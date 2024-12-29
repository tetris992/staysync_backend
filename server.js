import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import logger from './utils/logger.js';
import connectDB from './config/db.js';
import reservationsRoutes from './routes/reservations.js';
import hotelSettingsRoutes from './routes/hotelSettings.js';
import statusRoutes from './routes/status.js';
import authRoutes from './routes/auth.js';
import chromeRoutes from './routes/chrome.js';
import scraperTasksRoutes from './routes/scraperTasks.js';

dotenv.config();

const app = express();

app.use(helmet());
app.use(morgan('combined'));
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// CORS_ORIGIN 환경변수가 비어있는 경우를 대비해 처리
let allowedOrigins = ['*']; // default: 전체 허용 (테스트용)
if (process.env.CORS_ORIGIN) {
  // 쉼표로 구분된 여러 도메인을 환경변수에서 가져오기
  allowedOrigins = process.env.CORS_ORIGIN.split(',');
}

app.use(
  cors({
    origin: allowedOrigins,

    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true, // 쿠키/인증정보 허용

    allowedHeaders: ['Authorization', 'Content-Type', 'Refresh-Token'],

    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

app.use(cookieParser());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

connectDB();

app.use('/auth', authRoutes);
app.use('/reservations', reservationsRoutes);
app.use('/hotel-settings', hotelSettingsRoutes);
app.use('/status', statusRoutes);
app.use('/chrome', chromeRoutes);
app.use('/api/scrape', scraperTasksRoutes);

// 에러 처리 미들웨어
app.use((err, req, res, next) => {
  logger.error(`Unhandled Error: ${err.message}`, err);
  const statusCode = err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'development'
      ? err.message
      : 'Internal Server Error';
  res.status(statusCode).json({ message });
});

const startServer = async () => {
  const PORT = process.env.PORT || 3003;
  const server = app.listen(PORT, () => {
    logger.info(`Server started on port ${PORT}`);
  });
};

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
