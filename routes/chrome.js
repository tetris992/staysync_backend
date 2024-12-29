import express from 'express';
import logger from '../utils/logger.js';
import { protect } from '../middleware/authMiddleware.js'; 
// import connectToChrome from '../scrapers/browserConnection.js'; 
// 이제 프론트(Electron)쪽에서 크롬을 관리하므로 backend에서 connectToChrome 제거

const router = express.Router();

// 브라우저 상태 확인 엔드포인트 (인증 필요)
// 기존에는 connectToChrome()을 통해 로컬 크롬 상태 확인
// 이제 스크래핑과 크롬 제어가 프론트(Electron)으로 이동했으므로 이 라우트는 유효하지 않음
// 대안: 아직 유지하고 싶다면 단순 응답만 반환하거나, 별도 API로 Electron 측에 상태를 질의하는 방식을 구현
router.get('/status', protect, async (req, res) => {
  try {
    // Electron 측이 관리하는 크롬 상태를 확인할 수 없음
    // 필요하다면 Electron 앱이 백엔드에 주기적으로 상태를 업데이트하는 API를 만들고, 그 상태를 DB나 메모리에 저장 후 반환 가능
    // 여기서는 임시로 상태 확인 불가 메시지 반환
    res.json({ success: false, message: 'Browser status is not managed by the server anymore.' });
  } catch (error) {
    logger.error('Error checking browser status:', error.message);
    res.status(500).json({ success: false, message: 'Unable to check browser status' });
  }
});

export default router;
