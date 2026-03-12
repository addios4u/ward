import { randomBytes } from 'crypto';

/**
 * 에이전트용 API 키 생성
 * 형식: ward_<32바이트 hex>
 */
export function generateApiKey(): string {
  return `ward_${randomBytes(32).toString('hex')}`;
}
