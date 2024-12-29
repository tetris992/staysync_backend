// backend/routes/auth.js

import express from 'express';
import {
  loginUser,
  refreshAccessToken,
  logout,
  registerUser,
  getUserInfo,
  updateUser,
  requestPasswordReset,
  resetPasswordController,
  kakaoRedirectLogin,
  linkKakaoAccount,
} from '../controllers/authController.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// 로그인 라우트
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    logger.info('Login route hit');
    await loginUser(req, res);
  })
);

router.get('/kakao/link/callback', protect, linkKakaoAccount);
router.get(
  '/kakao/callback',
  asyncHandler(async (req, res) => {
    logger.info('Kakao Redirect Callback route hit');
    await kakaoRedirectLogin(req, res);
  })
);

// 추가: 카카오 리다이렉트 콜백 라우트
router.get(
  '/kakao/callback',
  asyncHandler(async (req, res) => {
    logger.info('Kakao Redirect Callback route hit');
    await kakaoRedirectLogin(req, res);
  })
);

// Refresh Access Token 라우트
router.post(
  '/refresh-token',
  asyncHandler(async (req, res, next) => {
    logger.info('Refresh Access Token route hit');
    await refreshAccessToken(req, res);
  })
);

// 로그아웃 라우트 (보호 미들웨어 적용 시)
router.post(
  '/logout',
  protect, // 인증된 사용자만 접근 가능 (필요 시)
  asyncHandler(async (req, res, next) => {
    logger.info('Logout route hit');
    await logout(req, res);
  })
);

// 회원가입 라우트
router.post(
  '/register',
  asyncHandler(async (req, res, next) => {
    logger.info('Register route hit');
    await registerUser(req, res);
  })
);

// 사용자 정보 가져오기 라우트 추가
router.get(
  '/users/:hotelId',
  protect,
  asyncHandler(async (req, res) => {
    logger.info('Get User Info route hit');
    await getUserInfo(req, res);
  })
);

// 사용자 정보 업데이트 라우트 추가
router.patch(
  '/users/:hotelId',
  protect,
  asyncHandler(async (req, res) => {
    logger.info('Update User route hit');
    await updateUser(req, res);
  })
);

router.post(
  '/reset-password-request',
  asyncHandler(async (req, res) => {
    logger.info('Reset Password Request route hit');
    await requestPasswordReset(req, res);
  })
);

router.post(
  '/reset-password/:token',
  asyncHandler(async (req, res) => {
    logger.info('Reset Password route hit');
    await resetPasswordController(req, res);
  })
);

export default router;
