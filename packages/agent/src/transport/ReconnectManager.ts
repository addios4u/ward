// 서버 연결 상태 관리 + exponential backoff 재연결
import { SendResult, SendErrorType } from './HttpClient.js';

export class ReconnectManager {
  private isServerUp = true;
  private retryDelayMs = 1000;
  private readonly maxRetryDelayMs = 5 * 60 * 1000; // 최대 5분
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private onReconnect: () => Promise<void>;

  constructor(onReconnect: () => Promise<void>) {
    this.onReconnect = onReconnect;
  }

  // 전송 결과를 보고받아 상태 업데이트
  reportResult(result: SendResult): void {
    if (result.success) {
      if (!this.isServerUp) {
        console.log('Ward 서버 연결이 복구되었습니다.');
      }
      this.isServerUp = true;
      this.retryDelayMs = 1000; // 성공 시 backoff 리셋
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    } else if (
      result.errorType === SendErrorType.CONNECTION_REFUSED ||
      result.errorType === SendErrorType.TIMEOUT
    ) {
      if (this.isServerUp) {
        console.warn(`Ward 서버 연결 끊김. ${this.retryDelayMs / 1000}초 후 재시도...`);
        this.isServerUp = false;
      }
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      console.log('Ward 서버 재연결 시도 중...');
      await this.onReconnect().catch(() => {});
      // 실패 시 다음 backoff 간격으로 재시도
      this.retryDelayMs = Math.min(this.retryDelayMs * 2, this.maxRetryDelayMs);
    }, this.retryDelayMs);
  }

  get serverAvailable(): boolean {
    return this.isServerUp;
  }

  destroy(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
