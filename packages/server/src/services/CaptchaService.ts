import { createHmac } from 'crypto';
import { config } from '../config/index.js';

/**
 * 서버사이드 CAPTCHA 서비스 (stateless HMAC 방식)
 *
 * 토큰 구조: base64({answer}:{timestamp}:{hmac})
 * - answer: 정답 (숫자)
 * - timestamp: 생성 시각 (Unix ms)
 * - hmac: HMAC-SHA256(answer:timestamp, SESSION_SECRET)
 *
 * Redis에 저장하지 않고 HMAC으로 무결성 검증
 * 유효시간: 5분
 */
export class CaptchaService {
  private readonly EXPIRES_MS = 5 * 60 * 1000; // 5분

  private getSecret(): string {
    return config.session.secret || 'dev-secret-change-in-production';
  }

  /**
   * 수학 문제(덧셈) 생성 후 서명된 토큰 반환
   */
  generate(): { token: string; question: string } {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    const answer = String(a + b);
    const timestamp = String(Date.now());

    const hmac = createHmac('sha256', this.getSecret())
      .update(`${answer}:${timestamp}`)
      .digest('hex');

    const raw = `${answer}:${timestamp}:${hmac}`;
    const token = Buffer.from(raw).toString('base64');

    return { token, question: `${a} + ${b} = ?` };
  }

  /**
   * 토큰과 사용자가 입력한 답변을 검증
   * @returns 'ok' | 'invalid' | 'expired'
   */
  verify(token: string, answer: string): 'ok' | 'invalid' | 'expired' {
    try {
      const raw = Buffer.from(token, 'base64').toString('utf8');
      const parts = raw.split(':');
      if (parts.length !== 3) return 'invalid';

      const [storedAnswer, timestamp, storedHmac] = parts;

      // HMAC 검증
      const expectedHmac = createHmac('sha256', this.getSecret())
        .update(`${storedAnswer}:${timestamp}`)
        .digest('hex');

      if (expectedHmac !== storedHmac) return 'invalid';

      // 만료 검증
      const createdAt = parseInt(timestamp, 10);
      if (isNaN(createdAt) || Date.now() - createdAt > this.EXPIRES_MS) return 'expired';

      // 정답 검증
      if (answer.trim() !== storedAnswer) return 'invalid';

      return 'ok';
    } catch {
      return 'invalid';
    }
  }
}
