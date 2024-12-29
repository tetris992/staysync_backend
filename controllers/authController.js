// backend/controllers/authController.js

import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import HotelSettings from '../models/HotelSettings.js';
import RefreshToken from '../models/RefreshToken.js';
import logger from '../utils/logger.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import crypto from 'crypto';
import sendEmail from '../utils/sendEmail.js';
import axios from 'axios';

// Access Token 생성 함수 (4시간)
const generateAccessToken = (user) => {
  return jwt.sign({ hotelId: user.hotelId }, process.env.JWT_SECRET, {
    expiresIn: '255m', // 약 4시간
  });
};

// Refresh Token 생성 함수 (1년)
const generateRefreshToken = (user) => {
  return jwt.sign({ hotelId: user.hotelId }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: '365d', // 1년
  });
};

const { KAKAO_REST_API_KEY, KAKAO_REDIRECT_URI } = process.env;

// === (B) 카카오 "리다이렉트" 방식 로그인 컨트롤러 ===
export const kakaoRedirectLogin = async (req, res) => {
  try {
    const { code, error, error_description } = req.query;
    if (error) {
      // 카카오 측 오류 (사용자가 동의 거부 등)
      return res.status(400).json({
        message: `카카오 인증 실패: ${error}, ${error_description}`,
      });
    }
    if (!code) {
      // code가 없다면 에러
      return res.status(400).json({ message: '카카오 인증 code가 없습니다.' });
    }

    // 1) code -> 카카오 AccessToken 교환
    const tokenResponse = await axios.post(
      'https://kauth.kakao.com/oauth/token',
      null, // POST body는 비어있고, query params로 전달
      {
        params: {
          grant_type: 'authorization_code',
          client_id: KAKAO_REST_API_KEY,
          redirect_uri: 'http://localhost:3003/auth/kakao/callback',
          code,
          // client_secret: KAKAO_CLIENT_SECRET, // 선택사항
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        },
      }
    );

    const kakaoAccessToken = tokenResponse.data.access_token;
    if (!kakaoAccessToken) {
      return res
        .status(400)
        .json({ message: '카카오 토큰 발급에 실패했습니다.' });
    }

    // 2) 카카오 AccessToken으로 사용자 정보 조회
    const { data: kakaoUser } = await axios.get(
      'https://kapi.kakao.com/v2/user/me',
      {
        headers: { Authorization: `Bearer ${kakaoAccessToken}` },
      }
    );

    const { id, kakao_account } = kakaoUser;
    const hotelId = `kakao_${id}`;

    // 3) DB에서 회원 조회 or 생성
    let user = await User.findOne({ hotelId });
    if (!user) {
      return res
        .status(404)
        .json({ message: '해당 호텔 ID가 존재하지 않습니다.' });
    }

    // 4) 호텔 설정(등록) 여부 확인
    const hotelSettings = await HotelSettings.findOne({
      hotelId: user.hotelId,
    });
    const isRegistered = !!hotelSettings;

    // 5) Access/Refresh Token 발급 + DB 저장 + 쿠키 설정
    const accessToken = generateAccessToken(user); // 이미 작성한 함수
    const refreshToken = generateRefreshToken(user); // 이미 작성한 함수

    const refreshTokenDoc = await RefreshToken.findOneAndUpdate(
      { hotelId: user.hotelId },
      {
        token: refreshToken,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.cookie('refreshToken', refreshTokenDoc.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });

    // 6) 응답 방법 (택1)
    // (a) JSON으로 반환
    // res.status(200).json({ accessToken, isRegistered });

    // (b) 프론트엔드로 리다이렉트 (쿼리에 accessToken 전달 - 보안 고려)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(
      `${frontendUrl}/kakao/callback?accessToken=${accessToken}&isRegistered=${isRegistered}`
    );
  } catch (error) {
    logger.error('Kakao Redirect Login Error:', error);
    return res
      .status(500)
      .json({ message: '카카오 로그인 중 오류가 발생했습니다.' });
  }
};

export const linkKakaoAccount = async (req, res) => {
  try {
    // 1) code 파싱
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ message: '카카오 code가 없습니다.' });
    }

    // 2) code -> 카카오 AccessToken
    const tokenResponse = await axios.post(
      'https://kauth.kakao.com/oauth/token',
      null,
      {
        params: {
          grant_type: 'authorization_code',
          client_id: process.env.KAKAO_REST_API_KEY,
          redirect_uri: 'http://localhost:3003/auth/kakao/link/callback',
          code,
        },
      }
    );
    const kakaoAccessToken = tokenResponse.data.access_token;

    // 3) 카카오 유저 정보 조회
    const { data: kakaoUser } = await axios.get(
      'https://kapi.kakao.com/v2/user/me',
      {
        headers: { Authorization: `Bearer ${kakaoAccessToken}` },
      }
    );
    const kakaoId = kakaoUser.id; // 예: 123456

    // 4) 현재 로그인된 유저(=hotelId) 찾기
    if (!req.user) {
      return res.status(401).json({ message: '로그인이 필요합니다.' });
    }
    const user = await User.findOne({ hotelId: req.user.hotelId });
    if (!user) {
      return res.status(404).json({ message: '유저를 찾을 수 없습니다.' });
    }

    // 5) 소셜 정보 저장
    user.socialProvider = 'kakao';
    user.socialId = String(kakaoId);
    await user.save();

    logger.info(`User ${req.user.hotelId} linked Kakao ID ${kakaoId}`);
    res.json({
      message: `카카오 계정(${kakaoId})이 hotelId=${req.user.hotelId}와 연동되었습니다.`,
    });
  } catch (error) {
    logger.error('카카오 연동 오류:', error);
    res
      .status(500)
      .json({ message: '카카오 연동 중 오류 발생', error: error.message });
  }
};

// 로그인 함수
export const loginUser = async (req, res) => {
  const { hotelId, password } = req.body;

  try {
    const user = await User.findOne({ hotelId });
    if (user && (await user.comparePassword(password))) {
      // 호텔 설정 존재 여부 확인
      const hotelSettings = await HotelSettings.findOne({
        hotelId: user.hotelId,
      });
      const isRegistered = !!hotelSettings;

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      // Refresh Token DB에 저장 (업데이트 또는 삽입)
      const refreshTokenDoc = await RefreshToken.findOneAndUpdate(
        { hotelId: user.hotelId },
        {
          token: refreshToken,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1년 뒤
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // 리프레시 토큰을 HTTP-only 쿠키로 설정
      // 개발환경에서는 secure=false, 프로덕션이면 secure=true 권장
      res.cookie('refreshToken', refreshTokenDoc.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none', // 또는 'strict' / 'lax' / 개발 편의로 'none'
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1년
      });

      // 클라이언트(Electron)에는 AccessToken만 JSON으로 전달
      res.status(200).json({ accessToken, isRegistered });
    } else {
      res.status(401).json({ message: 'Invalid hotel ID or password' });
    }
  } catch (error) {
    logger.error(`Login error: ${error.message}`, error);
    res.status(500).json({ message: '서버 오류' });
  }
};

// Refresh Access Token 함수
export const refreshAccessToken = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ message: 'Refresh Token이 필요합니다.' });
  }

  try {
    // Refresh Token 유효성 검사
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const hotelId = decoded.hotelId;

    // DB에 해당 토큰이 존재하는지 확인 (탈퇴 or 로그아웃 시 삭제됨)
    const savedRefreshToken = await RefreshToken.findOne({
      token: refreshToken,
    });
    if (!savedRefreshToken) {
      return res
        .status(403)
        .json({ message: 'Refresh Token이 유효하지 않습니다.' });
    }

    // 새 AccessToken 발급 (4시간)
    const newAccessToken = jwt.sign({ hotelId }, process.env.JWT_SECRET, {
      expiresIn: '255m',
    });

    // 클라이언트에 새 AccessToken 반환
    res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    logger.error('Refresh Token Error:', error);
    return res
      .status(403)
      .json({ message: 'Refresh Token이 유효하지 않습니다.' });
  }
};

// 로그아웃 함수
export const logout = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  // req.user가 있을 수도 없을 수도 있으니 hotelId 우선순위 정리
  const hotelId = req.user ? req.user.hotelId : req.body.hotelId;

  if (refreshToken && hotelId) {
    try {
      // DB에서 해당 RefreshToken 삭제
      await RefreshToken.findOneAndDelete({ token: refreshToken });

      // OTA 상태 비활성화 (필요 시)
      await HotelSettings.findOneAndUpdate(
        { hotelId },
        { $set: { 'otas.$[].isActive': false } }
      );

      // 세션 종료 (만약 express-session을 사용한다면)
      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            logger.error('Error destroying session:', err);
            return res.status(500).json({ message: 'Internal Server Error' });
          }
          // 쿠키에서 refreshToken 제거
          res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
          });
          res.status(200).json({ message: '로그아웃 되었습니다.' });
        });
      } else {
        // 세션이 없는 경우도 쿠키만 제거
        res.clearCookie('refreshToken', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
        });
        res.status(200).json({ message: '로그아웃 되었습니다.' });
      }
    } catch (error) {
      logger.error('Logout Error:', error);
      res.status(500).json({ message: '서버 오류로 로그아웃 실패' });
    }
  } else {
    res.status(400).json({ message: '리프레시 토큰이 존재하지 않습니다.' });
  }
};

// 사용자 등록
export const registerUser = async (req, res) => {
  const { hotelId, password, email, address, phoneNumber } = req.body;

  if (!hotelId || !password || !email || !address || !phoneNumber) {
    return res
      .status(400)
      .send({ message: '모든 필수 입력값을 입력해주세요.' });
  }

  try {
    const existingUser = await User.findOne({
      $or: [{ hotelId }, { email }, { phoneNumber }],
    });

    if (existingUser) {
      let message = '이미 존재하는 사용자입니다. 중복되는 ';
      if (existingUser.hotelId === hotelId) message += '호텔 ID';
      else if (existingUser.email === email) message += '이메일';
      else if (existingUser.phoneNumber === phoneNumber) message += '전화번호';
      message += '입니다.';
      return res.status(409).send({ message });
    }

    const newUser = new User({
      hotelId,
      password,
      email,
      address,
      phoneNumber,
    });
    await newUser.save();
    logger.info('New user account created:', hotelId);

    res.status(201).send({
      message: 'User account registered successfully',
      data: {
        hotelId: newUser.hotelId,
        email: newUser.email,
        address: newUser.address,
        phoneNumber: newUser.phoneNumber,
        createdAt: newUser.createdAt,
        updatedAt: newUser.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Error registering user:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

// 사용자 정보 가져오기
export const getUserInfo = async (req, res) => {
  const { hotelId } = req.params;

  try {
    // req.user.hotelId가 param으로 넘어온 hotelId와 같은지 체크
    if (req.user.hotelId !== hotelId) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    const user = await User.findOne({ hotelId }).select('-password');
    if (!user) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    res.status(200).json({
      message: '사용자 정보가 성공적으로 조회되었습니다.',
      data: {
        hotelId: user.hotelId,
        email: user.email,
        address: user.address,
        phoneNumber: user.phoneNumber,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Error getting user info:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
};

// 사용자 정보 업데이트
export const updateUser = async (req, res) => {
  const { hotelId } = req.params;
  const { email, address, phoneNumber, password } = req.body;

  try {
    if (req.user.hotelId !== hotelId) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    const user = await User.findOne({ hotelId });
    if (!user) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    if (email) user.email = email;
    if (address) user.address = address;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (password) user.password = password;

    await user.save();
    logger.info(`User ${hotelId} updated successfully.`);

    res.status(200).json({
      message: '사용자 정보가 성공적으로 업데이트되었습니다.',
      data: {
        hotelId: user.hotelId,
        email: user.email,
        address: user.address,
        phoneNumber: user.phoneNumber,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
};

// 비밀번호 재설정 요청
export const requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res
      .status(404)
      .json({ message: '해당 이메일의 유저를 찾을 수 없습니다.' });
  }

  // 기존에 발급된 토큰 제거
  await PasswordResetToken.deleteMany({ hotelId: user.hotelId });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1시간 후 만료

  await PasswordResetToken.create({
    hotelId: user.hotelId,
    token,
    expiresAt,
  });

  const resetLink = `${process.env.FRONTEND_URL}/reset-password/${token}`;
  await sendEmail({
    to: email,
    subject: '비밀번호 재설정 안내',
    text: `아래 링크를 클릭하여 비밀번호를 재설정하세요: ${resetLink}`,
  });

  return res.json({ message: '비밀번호 재설정 이메일을 전송했습니다.' });
};

// 실제 비밀번호 재설정 처리
export const resetPasswordController = async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  const resetTokenDoc = await PasswordResetToken.findOne({ token });
  if (!resetTokenDoc) {
    return res.status(400).json({ message: '유효하지 않은 토큰입니다.' });
  }

  if (resetTokenDoc.expiresAt < new Date()) {
    return res.status(400).json({ message: '토큰이 만료되었습니다.' });
  }

  const user = await User.findOne({ hotelId: resetTokenDoc.hotelId });
  if (!user) {
    return res.status(404).json({ message: '유저를 찾을 수 없습니다.' });
  }

  user.password = newPassword;
  await user.save();
  await resetTokenDoc.deleteOne();

  return res.json({ message: '비밀번호가 성공적으로 재설정되었습니다.' });
};
