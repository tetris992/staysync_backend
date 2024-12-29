// backend/routes/scraperTasks.js

import express from 'express';
// import {
//   getScraperTasks,
//   restartScraperTask,
//   resetAllScraperTasks,
//   enqueueInstantScrapeTasks,
// } from '../controllers/scraperTaskController.js';
import { protect } from '../middleware/authMiddleware.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';
// import scraperManager from '../scrapers/scraperManager.js'; 
// ScraperManager는 프론트로 이동했으므로 더이상 백엔드에서 import 불가

const router = express.Router();

// 참고: 아래 라우트들은 원래 scraperManager를 사용해 스크래핑 작업을 관리했지만
// 이제 스크래핑 코드는 프론트(Electron)로 옮겨짐.
// 따라서 이 라우트들은 더 이상 동작하지 않거나, Electron 측의 API 호출로 대체해야 함.
// 여기서는 일단 주석처리하고, 임시로 사용 불가 메시지 반환.

// 스크래핑 작업 상태 조회 라우트
router.get(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    logger.info('Get Scraper Tasks route hit');
    // 원래: await getScraperTasks(req, res);
    // 이제 scraperTasks 관리 로직이 프론트로 이동했으므로:
    return res.status(501).json({success:false, message:'Scraper tasks are now managed by the Electron app.'});
  })
);

// 스크래핑 작업 재시작 라우트
router.post(
  '/restart',
  protect,
  asyncHandler(async (req, res) => {
    logger.info('Restart Scraper Task route hit');
    // 원래: await restartScraperTask(req, res, scraperManager);
    // 이제 Electron 측에서 처리
    return res.status(501).json({success:false, message:'Restarting scraper tasks is now handled by the Electron app.'});
  })
);

// 모든 스크래핑 작업 리셋 라우트
router.post(
  '/reset-all',
  protect,
  asyncHandler(async (req, res) => {
    logger.info('Reset All Scraper Tasks route hit');
    // 원래: await resetAllScraperTasks(req, res, scraperManager);
    return res.status(501).json({success:false, message:'Resetting tasks is now handled by the Electron app.'});
  })
);

// 즉시 스크랩 작업 추가 라우트
router.post(
  '/instant',
  protect,
  asyncHandler(async (req, res) => {
    logger.info('Enqueue Instant Scrape Tasks route hit');
    // 원래: await enqueueInstantScrapeTasks(req, res, scraperManager);
    return res.status(501).json({success:false, message:'Instant scraping is now handled by the Electron app.'});
  })
);

export default router;
