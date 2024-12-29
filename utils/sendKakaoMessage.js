import axios from 'axios';
import logger from './logger.js';

// 카카오 비즈메시지(알림톡)용 예시 - 실제론 인증 토큰 발급/템플릿 등 훨씬 복잡
async function sendKakaoMessage(phoneNumber, templateCode, messageText) {
  try {
    // 예: 알리고(Aligo), NHN Toast 등 외부 솔루션의 API를 직접 호출
    const API_KEY = process.env.ALIMTALK_API_KEY;
    const SENDER_KEY = process.env.ALIMTALK_SENDER_KEY;
    // 위 값들은 .env 등 보안 설정에 넣고 불러오는 식

    const body = {
      senderKey: SENDER_KEY,
      templateCode, // 미리 등록한 템플릿 코드
      phoneNumber,
      message: messageText,
    };

    // 실제 요청 예시 (알리고 API가 아닐 수도 있음)
    const response = await axios.post(
      'https://api.some-kakao-biz.com/v1/sendAlimTalk',
      body,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data?.status === 'success') {
      logger.info(`카카오톡 메시지 전송 성공: ${phoneNumber}`);
    } else {
      logger.warn(
        `카카오톡 메시지 전송 실패: ${phoneNumber}, reason=${response.data?.reason}`
      );
    }
  } catch (error) {
    logger.error('카카오톡 메시지 전송 중 오류:', error);
  }
}

export default sendKakaoMessage;
