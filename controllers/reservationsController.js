// backend/controllers/reservationsController.js

import getReservationModel from '../models/Reservation.js';
import getCanceledReservationModel from '../models/CanceledReservation.js';
import logger from '../utils/logger.js';
import initializeHotelCollection from '../utils/initializeHotelCollection.js';
import availableOTAs from '../config/otas.js';
import { parseDate } from '../utils/dateParser.js';
import { isCancelledStatus } from '../utils/isCancelledStatus.js';

// 전화번호에서 숫자만 추출하는 헬퍼 함수
function sanitizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';
  // 숫자만 추출하는 정규식
  return phoneNumber.replace(/\D/g, '');
}

function parsePrice(priceString) {
  if (priceString == null) return 0; // null 혹은 undefined 처리

  // priceString이 숫자일 경우 바로 반환
  if (typeof priceString === 'number') {
    return priceString;
  }

  // 여기서부터는 priceString이 문자열이라고 가정
  const str = String(priceString);
  const match = str.match(/\d[\d,]*/);
  if (!match) return 0;
  return parseInt(match[0].replace(/,/g, ''), 10) || 0;
}

// 모든 정상 예약 목록 가져오기
export const getReservations = async (req, res) => {
  const { name, hotelId } = req.query;

  if (!hotelId) {
    return res.status(400).send({ message: 'hotelId is required' });
  }

  const Reservation = getReservationModel(hotelId);
  const filter = {};

  if (name) {
    filter.customerName = { $regex: new RegExp(`^${name}$`, 'i') };
  }

  // 취소되지 않은 예약만 필터: isCancelled: false
  filter.isCancelled = false;

  const sort = { createdAt: -1 };
  try {
    const reservations = await Reservation.find(filter).sort(sort);
    res.send(reservations);
  } catch (error) {
    logger.error('Error fetching reservations:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

// 예약 생성 또는 업데이트
export const createOrUpdateReservations = async (req, res) => {
  const { siteName, reservations, hotelId } = req.body;
  const finalHotelId = hotelId || req.user.hotelId;

  if (!siteName || !reservations || !finalHotelId) {
    return res.status(400).send({
      message: 'siteName, reservations, hotelId 필드는 필수입니다.',
    });
  }

  try {
    await initializeHotelCollection(finalHotelId);
    const Reservation = getReservationModel(finalHotelId);
    const CanceledReservation = getCanceledReservationModel(finalHotelId);

    for (const reservation of reservations) {
      if (!reservation.reservationNo || reservation.reservationNo === 'N/A') {
        logger.warn(
          'Skipping reservation with invalid reservation number',
          reservation
        );
        continue;
      }

      const reservationId = `${siteName}-${reservation.reservationNo}`;
      let checkOutDate = reservation.checkOut;
      if (!/\d{2}:\d{2}/.test(checkOutDate)) {
        checkOutDate += ' 11:00';
      }
// 오류가 많이나는 날짜 파싱
      const checkIn = parseDate(reservation.checkIn);
      const checkOut = parseDate(checkOutDate);

      if (!checkIn || !checkOut || checkIn >= checkOut) {
        logger.warn('Skipping reservation with invalid dates', reservation);
        continue;
      }

      let paymentMethod = '정보 없음';
      if (availableOTAs.includes(siteName)) {
        paymentMethod = 'OTA';
      } else if (siteName === '현장예약') {
        paymentMethod = reservation.paymentMethod || 'Pending';
      } else {
        paymentMethod = reservation.paymentMethod || 'Pending';
      }

      const sanitizedPhoneNumber = sanitizePhoneNumber(
        reservation.phoneNumber || ''
      );
      const parsedReservationDate =
        parseDate(reservation.reservationDate) || new Date();

      const updateData = {
        siteName,
        customerName: reservation.customerName,
        phoneNumber: sanitizedPhoneNumber,
        roomInfo: reservation.roomInfo,
        checkIn,
        checkOut,
        reservationDate: parsedReservationDate,
        reservationStatus: reservation.reservationStatus || 'Pending',
        price: parsePrice(reservation.price),
        specialRequests: reservation.specialRequests || null,
        additionalFees: reservation.additionalFees || 0,
        couponInfo: reservation.couponInfo || null,
        paymentStatus: reservation.paymentStatus || '확인 필요',
        paymentMethod: paymentMethod,
        hotelId: finalHotelId,
      };

      const cancelled = isCancelledStatus(
        updateData.reservationStatus,
        updateData.customerName,
        updateData.roomInfo,
        reservation.reservationNo
      );
      updateData.isCancelled = cancelled;

      const existingReservation = await Reservation.findById(reservationId);
      const existingCanceled = await CanceledReservation.findById(
        reservationId
      );

      // 이미 취소 컬렉션에 있는 경우
      if (existingCanceled) {
        if (cancelled) {
          // 이미 취소 컬렉션에 있고 계속 취소 상태면 업데이트
          await CanceledReservation.updateOne(
            { _id: reservationId },
            updateData,
            {
              runValidators: true,
              strict: true,
              overwrite: true,
            }
          );
          logger.info(`Updated canceled reservation: ${reservationId}`);
        } else {
          // 취소에서 정상 예약으로 복귀하는 경우 (드문 케이스)
          await CanceledReservation.deleteOne({ _id: reservationId });
          const newReservation = new Reservation({
            _id: reservationId,
            ...updateData,
            isCancelled: false,
          });
          await newReservation.save();
          logger.info(
            `Moved canceled reservation back to normal: ${reservationId}`
          );
        }
        continue;
      }

      // 기존 예약이 있는 경우
      if (existingReservation) {
        if (cancelled) {
          // 기존 예약에서 취소 상태로 변경
          await Reservation.deleteOne({ _id: reservationId });
          const newCanceled = new CanceledReservation({
            _id: reservationId,
            ...updateData,
          });
          await newCanceled.save();
          logger.info(`Moved reservation to canceled: ${reservationId}`);
        } else {
          // 기존 예약 업데이트
          await Reservation.updateOne({ _id: reservationId }, updateData, {
            runValidators: true,
            strict: true,
            overwrite: true,
          });
          logger.info(`Updated reservation: ${reservationId}`);
        }
      } else {
        // 새로운 예약
        if (cancelled) {
          const newCanceled = new CanceledReservation({
            _id: reservationId,
            ...updateData,
          });
          await newCanceled.save();
          logger.info(`Created new canceled reservation: ${reservationId}`);
        } else {
          const newReservation = new Reservation({
            _id: reservationId,
            ...updateData,
          });
          await newReservation.save();
          logger.info(`Created new reservation: ${reservationId}`);

          // ─────────────────────────────────────────
          // 카카오톡 발송 조건 체크
          // ─────────────────────────────────────────
          const isOnSite = siteName === '현장예약';
          const hasPhone = Boolean(sanitizedPhoneNumber);
          // "대실" 여부 구분 (roomInfo나 customerName에 "대실"이 포함되어 있는지)
          const isDaesil =
            updateData.roomInfo?.includes('대실') ||
            updateData.customerName?.includes('대실');

          if (isOnSite && !isDaesil && hasPhone) {
            // 전송 메시지 예시
            const messageText =
              `[현장예약 안내]\n` +
              `예약자명: ${updateData.customerName}\n` +
              `체크인: ${updateData.checkIn}\n` +
              `체크아웃: ${updateData.checkOut}\n` +
              `가격: ${updateData.price}원\n` +
              `문의: (호텔 대표번호)`;

            const templateCode = 'ONSITE_RESERVATION'; // 사전 등록된 템플릿
            try {
              await sendKakaoMessage(
                sanitizedPhoneNumber,
                templateCode,
                messageText
              );
              logger.info(`카카오톡 알림 발송 완료 - ${sanitizedPhoneNumber}`);
            } catch (error) {
              logger.error(
                `카카오톡 알림 전송 오류: ${reservationId}, phone=${sanitizedPhoneNumber}`,
                error
              );
            }
          } else {
            // 조건을 만족 못하는 경우 로그로만 남김
            if (!isOnSite) {
              logger.info(
                `siteName=(${siteName}) → 현장예약 아님, 카톡 전송 스킵`
              );
            }
            if (isDaesil) {
              logger.info(`현장대실(대실) 예약이므로 카톡 전송 스킵`);
            }
            if (!hasPhone) {
              logger.info(
                `전화번호가 없어 카카오 알림 없음. reservationId=${reservationId}`
              );
            }
          }
        }
      }
    }

    res.status(201).send({ message: 'Reservations processed successfully' });
  } catch (error) {
    logger.error('Error processing reservations:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

// 예약 삭제 컨트롤러
export const deleteReservation = async (req, res) => {
  const { reservationId } = req.params; // URL 파라미터로부터 reservationId 추출
  const { hotelId, siteName } = req.query; // 쿼리 파라미터로부터 hotelId와 siteName 추출

  // 필수 파라미터 검증
  if (!reservationId || !hotelId || !siteName) {
    return res
      .status(400)
      .send({ message: 'reservationId, hotelId, siteName는 필수입니다.' });
  }

  try {
    // 해당 호텔의 예약 컬렉션 가져오기
    const Reservation = getReservationModel(hotelId);

    // 예약 삭제: reservationId, hotelId, siteName으로 예약 찾기
    const reservation = await Reservation.findOneAndDelete({
      _id: reservationId,
      hotelId,
      siteName,
    });

    // 예약이 존재하지 않을 경우 404 응답
    if (!reservation) {
      return res.status(404).send({ message: '해당 예약을 찾을 수 없습니다.' });
    }

    // 성공적으로 삭제되었을 경우 204 No Content 응답
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting reservation:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

// 예약 확정 컨트롤러
export const confirmReservation = async (req, res) => {
  const { reservationId } = req.params;
  const { hotelId } = req.body;

  console.log(`Received reservationId: ${reservationId}, hotelId: ${hotelId}`);

  if (!reservationId || !hotelId) {
    return res
      .status(400)
      .send({ message: 'reservationId와 hotelId는 필수입니다.' });
  }

  try {
    const Reservation = getReservationModel(hotelId); // 동적 컬렉션 가져오기
    const reservation = await Reservation.findOne({
      _id: reservationId,
      hotelId,
    });

    if (!reservation) {
      return res.status(404).send({ message: '예약을 찾을 수 없습니다.' });
    }

    if (reservation.reservationStatus === 'confirmed') {
      return res.status(400).send({ message: '이미 확정된 예약입니다.' });
    }

    // 예약 상태를 'confirmed'로 변경
    reservation.reservationStatus = 'confirmed';
    await reservation.save();

    res
      .status(200)
      .send({ message: '예약이 성공적으로 확정되었습니다.', reservation });
  } catch (error) {
    logger.error('Error confirming reservation:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

// 예약 수정 컨트롤러
export const updateReservation = async (req, res) => {
  const { reservationId } = req.params;
  const { hotelId, ...updateData } = req.body;

  if (!hotelId) {
    return res.status(400).send({ message: 'hotelId는 필수입니다.' });
  }

  try {
    const Reservation = getReservationModel(hotelId);
    const reservation = await Reservation.findOne({
      _id: reservationId,
      hotelId,
    });

    if (reservation) {
      if (updateData.phoneNumber) {
        updateData.phoneNumber = sanitizePhoneNumber(updateData.phoneNumber);
      }

      // price 필드 숫자 변환
      if (updateData.price) {
        updateData.price = parsePrice(updateData.price);
      }

      // 날짜 필드도 parseDate 사용하여 업데이트
      if (updateData.checkIn) {
        updateData.checkIn = parseDate(updateData.checkIn);
      }
      if (updateData.checkOut) {
        updateData.checkOut = parseDate(updateData.checkOut);
      }
      if (updateData.reservationDate) {
        updateData.reservationDate = parseDate(updateData.reservationDate);
      }

      Object.keys(updateData).forEach((key) => {
        reservation[key] = updateData[key];
      });

      // 결제 방식 설정
      if (availableOTAs.includes(reservation.siteName)) {
        reservation.paymentMethod = 'OTA';
      } else if (reservation.siteName === '현장예약') {
        reservation.paymentMethod = updateData.paymentMethod || 'Pending';
      } else {
        reservation.paymentMethod = updateData.paymentMethod || 'Pending';
      }

      await reservation.save();
      logger.info(`Updated reservation: ${reservationId}`);
      res.send(reservation);
    } else {
      res
        .status(404)
        .send({ message: '해당 ID와 hotelId를 가진 예약을 찾을 수 없습니다.' });
    }
  } catch (error) {
    logger.error('Error updating reservation:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

// 취소된 예약 목록 가져오기
export const getCanceledReservations = async (req, res) => {
  const { hotelId } = req.query;

  if (!hotelId) {
    return res.status(400).send({ message: 'hotelId는 필수입니다.' });
  }

  const CanceledReservation = getCanceledReservationModel(hotelId);

  try {
    // 취소된 예약 전용 콜렉션에서 직접 찾는다.
    const canceledReservations = await CanceledReservation.find();

    // canceledReservations가 제대로 조회되는지 콘솔 확인
    console.log('Fetched canceled reservations:', canceledReservations);

    res.status(200).send(canceledReservations);
  } catch (error) {
    logger.error('취소된 예약 가져오는 중 오류 발생:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};
