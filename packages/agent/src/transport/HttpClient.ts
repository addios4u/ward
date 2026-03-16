// HTTP 전송 클라이언트

export enum SendErrorType {
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',  // 서버 다운
  TIMEOUT = 'TIMEOUT',
  HTTP_ERROR = 'HTTP_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export interface HttpClientOptions {
  serverUrl: string;
  serverId: string;  // apiKey 대신 serverId
  timeoutMs?: number;
}

export interface SendResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  errorType?: SendErrorType;
}

// Ward 서버로 데이터를 전송하는 HTTP 클라이언트
export class HttpClient {
  private readonly serverUrl: string;
  private readonly serverId: string;
  private readonly timeoutMs: number;

  constructor(options: HttpClientOptions) {
    this.serverUrl = options.serverUrl.replace(/\/$/, ''); // 끝 슬래시 제거
    this.serverId = options.serverId;
    this.timeoutMs = options.timeoutMs ?? 10000; // 기본 10초 타임아웃
  }

  // 에러를 SendErrorType으로 분류
  private classifyError(error: unknown): { error: string; errorType: SendErrorType } {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { error: '요청 타임아웃', errorType: SendErrorType.TIMEOUT };
      }
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ECONNREFUSED' || nodeError.code === 'ENOTFOUND') {
        return { error: error.message, errorType: SendErrorType.CONNECTION_REFUSED };
      }
      return { error: error.message, errorType: SendErrorType.UNKNOWN };
    }
    return { error: '알 수 없는 오류', errorType: SendErrorType.UNKNOWN };
  }

  // 공통 POST 요청 메서드 (x-ward-server-id 헤더 포함)
  async post(path: string, body: unknown): Promise<SendResult> {
    const url = `${this.serverUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ward-server-id': this.serverId,
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
          errorType: SendErrorType.HTTP_ERROR,
        };
      }
    } catch (error) {
      clearTimeout(timeoutId);
      const classified = this.classifyError(error);
      return { success: false, ...classified };
    }
  }

  // 서버 등록 (인증 헤더 없이)
  async register(
    hostname: string,
    groupName?: string,
    osInfo?: { osName?: string; osVersion?: string; arch?: string }
  ): Promise<{ serverId: string }> {
    const url = `${this.serverUrl}/api/agent/register`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname, groupName, ...osInfo }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await response.json() as { serverId: string };
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // 서버 등록 해제
  async unregister(): Promise<SendResult> {
    const url = `${this.serverUrl}/api/agent/unregister`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-ward-server-id': this.serverId,
        },
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
          errorType: SendErrorType.HTTP_ERROR,
        };
      }
    } catch (error) {
      clearTimeout(timeoutId);
      const classified = this.classifyError(error);
      return { success: false, ...classified };
    }
  }

  // 메트릭 전송
  async sendMetrics(metrics: unknown): Promise<SendResult> {
    return this.post('/api/agent/metrics', metrics);
  }

  // Heartbeat 전송 (응답 body의 commands 포함 반환)
  async sendHeartbeat(data: unknown): Promise<SendResult & { commands?: Array<{ id: string; serviceName: string; action: string }> }> {
    const url = `${this.serverUrl}/api/agent/heartbeat`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ward-server-id': this.serverId,
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const body = await response.json() as { ok: boolean; serverId: string; commands?: Array<{ id: string; serviceName: string; action: string }> };
        return { success: true, statusCode: response.status, commands: body.commands };
      } else {
        return {
          success: false,
          statusCode: response.status,
          error: `HTTP 오류: ${response.status} ${response.statusText}`,
          errorType: SendErrorType.HTTP_ERROR,
        };
      }
    } catch (error) {
      clearTimeout(timeoutId);
      const classified = this.classifyError(error);
      return { success: false, ...classified };
    }
  }

  // 서비스 목록 동기화
  async syncServices(services: Array<{
    name: string;
    type: string;
    config: object;
    status: string;
    pid?: number;
    restartCount?: number;
    startedAt?: string;
    cpuUsage?: number;
    memUsage?: number;
  }>): Promise<SendResult> {
    return this.post('/api/agent/services/sync', { services });
  }
}
