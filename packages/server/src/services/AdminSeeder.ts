import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

/**
 * 초기 관리자 계정 생성 서비스
 * ADMIN_EMAIL, ADMIN_PASSWORD 환경변수가 있으면 자동으로 users 테이블에 삽입
 * 이미 존재하면 건너뜀
 * 환경변수가 없으면 경고 로그만 출력
 */
export class AdminSeeder {
  async seed(): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.warn('경고: ADMIN_EMAIL 또는 ADMIN_PASSWORD 환경변수가 설정되지 않았습니다. 초기 관리자 계정이 생성되지 않습니다.');
      return;
    }

    const db = getDb();

    // 이미 존재하는지 확인
    const [existingUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, adminEmail))
      .limit(1);

    if (existingUser) {
      console.log(`관리자 계정이 이미 존재합니다: ${adminEmail}`);
      return;
    }

    // 비밀번호 해싱 후 삽입
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    await db.insert(schema.users).values({
      email: adminEmail,
      passwordHash,
    });

    console.log(`초기 관리자 계정 생성 완료: ${adminEmail}`);
  }
}
