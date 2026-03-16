/**
 * Ward 테스트용 샘플 Node.js HTTP 서버
 *
 * 사용법:
 *   node sample-app.js
 *
 * Ward 서비스 등록 예시:
 *   ward service add '{"name":"sample-app","method":"exec","command":"node /path/to/sample-app.js","restartDelay":3000}'
 */

const http = require('http');

const PORT = process.env.PORT || 3000;
const APP_NAME = process.env.APP_NAME || 'sample-app';

// HTTP 서버 생성
const server = http.createServer((req, res) => {
  const now = new Date().toISOString();
  console.log(`[${now}] ${req.method} ${req.url} - 요청 수신`);

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    status: 'ok',
    app: APP_NAME,
    timestamp: now,
    uptime: Math.floor(process.uptime()) + '초',
    pid: process.pid,
  }, null, 2));
});

server.listen(PORT, () => {
  console.log(`[시작] ${APP_NAME} 서버가 포트 ${PORT}에서 실행 중입니다. (PID: ${process.pid})`);
});

// 주기적으로 상태 로그 출력 (Ward 로그 스트림 확인용)
let tickCount = 0;
const logInterval = setInterval(() => {
  tickCount++;
  const memMB = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
  console.log(`[상태] tick=${tickCount} | 메모리=${memMB}MB | 업타임=${Math.floor(process.uptime())}초`);

  // 10틱마다 경고 로그 출력
  if (tickCount % 10 === 0) {
    console.warn(`[경고] 10틱 도달 (tick=${tickCount}) - 이것은 테스트용 경고 메시지입니다.`);
  }
}, 5000);

// 종료 시그널 처리
process.on('SIGTERM', () => {
  console.log('[종료] SIGTERM 수신 - 서버를 종료합니다.');
  clearInterval(logInterval);
  server.close(() => {
    console.log('[종료] HTTP 서버 종료 완료.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[종료] SIGINT 수신 - 서버를 종료합니다.');
  clearInterval(logInterval);
  server.close(() => {
    console.log('[종료] HTTP 서버 종료 완료.');
    process.exit(0);
  });
});

// 처리되지 않은 예외 로깅 (Ward가 stderr도 수집함)
process.on('uncaughtException', (err) => {
  console.error(`[오류] 처리되지 않은 예외: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
