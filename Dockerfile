# syntax=docker/dockerfile:1

# 1) Node.js 20 버전의 slim 이미지를 베이스로 사용
FROM node:20-slim

# 2) 애플리케이션 디렉터리를 만들고, 작업 폴더로 설정
WORKDIR /app

# 3) package.json과 package-lock.json만 복사
COPY package*.json ./

# 4) npm install ( --omit=dev 또는 --production 옵션은 필요 시 사용)
#    로컬 개발용이라면 그냥 npm install
RUN npm install

# 5) 소스코드 전체를 복사 (server.js 포함)
COPY . .

# 6) 환경변수 설정(예: NODE_ENV=production) - 필요 시
# ENV NODE_ENV=production

# 7) 앱이 사용하는 포트를 명시(도커 컨테이너 내부 포트)
EXPOSE 3003

# 8) 컨테이너가 실행될 때 시작할 명령 (npm start 또는 node server.js)
CMD ["npm", "start"]
