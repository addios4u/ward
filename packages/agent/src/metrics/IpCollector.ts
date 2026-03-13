// 공인 IP 및 지역 정보 수집기

export interface IpInfo {
  ip: string;
  country: string;
  city: string;
  isp: string;
}

export class IpCollector {
  private cachedInfo: IpInfo | null = null;
  private lastFetchedAt: number = 0;
  private readonly cacheTtlMs = 60 * 60 * 1000; // 1시간

  async collect(): Promise<IpInfo | null> {
    const now = Date.now();
    if (this.cachedInfo && (now - this.lastFetchedAt) < this.cacheTtlMs) {
      return this.cachedInfo;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch('http://ip-api.com/json?fields=status,country,city,isp,query', {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json() as { status: string; query: string; country: string; city: string; isp: string };
      if (data.status !== 'success') return null;
      this.cachedInfo = { ip: data.query, country: data.country, city: data.city, isp: data.isp };
      this.lastFetchedAt = now;
      return this.cachedInfo;
    } catch {
      return null; // 실패해도 에이전트 동작에 영향 없음
    }
  }
}
