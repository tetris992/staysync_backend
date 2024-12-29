// backend/controllers/scraperTaskController.js

import ScraperTask from '../models/ScraperTask.js';
import logger from '../utils/logger.js';

/**
 * 다중 OTA에 대한 즉시 스크랩 작업을 큐에 추가하는 컨트롤러
 * 기존에는 scraperManager를 통해 로직을 처리했지만,
 * 스크래핑은 이제 Electron 측에서 관리한다고 가정.
 * 따라서 이 함수는 더 이상 scraperManager를 호출할 수 없음.
 */
export const enqueueInstantScrapeTasks = async (req, res /*, scraperManager*/) => {
  const { hotelId, otaNames } = req.body;

  if (!hotelId || !Array.isArray(otaNames) || otaNames.length === 0) {
    return res.status(400).json({ message: 'hotelId와 최소 하나 이상의 otaNames가 필요합니다.' });
  }

  try {
    // 기존 코드:
    // otaNames.forEach((otaName) => {
    //   scraperManager.enqueueScrapeTask(hotelId, otaName);
    // });
    //
    // 이제 Electron 관리하므로 직접 처리 불가:
    // TODO: Electron으로 API 호출 또는 IPC를 통해 스크래핑 요청 전달하는 로직 추가 예정
    // 여기서는 단순히 not implemented 응답을 보냄
    return res.status(501).json({
      message: `즉시 스크랩 작업은 이제 Electron 앱을 통해 관리됩니다. hotelId: ${hotelId}, otas: ${otaNames.join(', ')}`
    });
  } catch (error) {
    console.error('즉시 스크랩 작업 추가 중 오류:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
};

/**
 * 스크래핑 작업 상태 조회
 * 이전에는 DB (ScraperTask 컬렉션)에서 상태 조회
 * 지금도 DB는 그대로 유지한다고 가정할 수 있으나,
 * 스크래핑 자체는 Electron으로 옮겼으므로 상태만 읽는 것은 가능.
 */
export const getScraperTasks = async (req, res) => {
  try {
    const tasks = await ScraperTask.find({});
    res.status(200).json({ tasks });
  } catch (error) {
    logger.error('Error fetching scraper tasks:', error);
    res.status(500).json({ message: 'Failed to fetch scraper tasks.' });
  }
};

/**
 * 특정 스크래핑 작업 재시작
 * 원래 scraperManager를 통해 로직 수행했으나 제거됨.
 */
export const restartScraperTask = async (req, res /*, scraperManager*/) => {
  const { hotelId, taskName } = req.body;

  if (!hotelId || !taskName) {
    return res.status(400).json({ message: 'hotelId와 taskName이 필요합니다.' });
  }

  // Electron 앱 측에서 처리해야 한다고 가정
  return res.status(501).json({
    message: `재시작 기능은 이제 Electron 앱에서 처리됩니다. hotelId: ${hotelId}, taskName: ${taskName}`
  });
};

/**
 * 모든 스크래핑 작업 리셋
 * 동일하게 Electron 관리로 변경
 */
export const resetAllScraperTasks = async (req, res /*, scraperManager*/) => {
  // Electron 앱 측에서 처리해야 한다고 가정
  return res.status(501).json({
    message: '모든 스크래핑 작업 리셋은 이제 Electron 앱에서 처리됩니다.'
  });
};
