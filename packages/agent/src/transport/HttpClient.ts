// HTTP 전송 클라이언트
export interface HttpClientOptions {
  serverUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

export interface SendResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

// Ward 서버로 데이터를 전송하는 HTTP 클라이언트
export class HttpClient {
  private readonly serverUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options: HttpClientOptions) {
    this.serverUrl = options.serverUrl.replace(/\/$/, ''); // 끝 슬래시 제거
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 10000; // 기본 10초 타임아웃
  }

  // 공통 POST 요청 메서드
  async post(path: string, body: unknown): Promise<SendResult> {
    const url = `${this.serverUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { success: true, statusCode: response.status };
      } else {
        return {
          success: false,
          statusCode: response.status,
          error: `HTTP 오류: ${response.status} ${response.statusText}`,
        };
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: '요청 타임아웃' };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      };
    }
  }

  // 메트릭 전송
  async sendMetrics(metrics: unknown): Promise<SendResult> {
    return this.post('/api/agent/metrics', metrics);
  }

  // Heartbeat 전송
  async sendHeartbeat(data: unknown): Promise<SendResult> {
    return this.post('/api/agent/heartbeat', data);
  }
}
