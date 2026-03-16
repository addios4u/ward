import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  bigserial,
  doublePrecision,
  bigint,
  jsonb,
  integer,
  text,
  primaryKey,
} from 'drizzle-orm/pg-core';

// ENUM 타입
export const serverStatusEnum = pgEnum('server_status', ['online', 'offline', 'unknown']);

// servers 테이블
export const servers = pgTable('servers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  hostname: varchar('hostname', { length: 255 }).notNull(),
  groupName: varchar('group_name', { length: 255 }),      // nullable, --name 플래그
  publicIp: varchar('public_ip', { length: 45 }),          // nullable, ip-api.com
  country: varchar('country', { length: 100 }),            // nullable
  city: varchar('city', { length: 100 }),                  // nullable
  isp: varchar('isp', { length: 255 }),                    // nullable
  osName: varchar('os_name', { length: 100 }),             // e.g. 'Ubuntu', 'CentOS'
  osVersion: varchar('os_version', { length: 100 }),       // e.g. '22.04'
  arch: varchar('arch', { length: 50 }),                   // e.g. 'x64', 'arm64'
  status: serverStatusEnum('status').notNull().default('unknown'),
  lastSeenAt: timestamp('last_seen_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// users 테이블
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// metrics 테이블 (TimescaleDB hypertable)
// TimescaleDB 요구사항: 시간 컬럼(collected_at)이 복합 기본키에 포함되어야 함
export const metrics = pgTable(
  'metrics',
  {
    id: bigserial('id', { mode: 'number' }).notNull(),
    serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
    collectedAt: timestamp('collected_at').notNull(),
    cpuUsage: doublePrecision('cpu_usage'),
    memTotal: bigint('mem_total', { mode: 'number' }),
    memUsed: bigint('mem_used', { mode: 'number' }),
    diskUsage: jsonb('disk_usage'),
    networkIo: jsonb('network_io'),
    loadAvg: doublePrecision('load_avg').array(),
  },
  (t) => [primaryKey({ columns: [t.id, t.collectedAt] })],
);

// processes 테이블 (TimescaleDB hypertable)
export const processes = pgTable(
  'processes',
  {
    id: bigserial('id', { mode: 'number' }).notNull(),
    serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
    collectedAt: timestamp('collected_at').notNull(),
    pid: integer('pid').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    cpuUsage: doublePrecision('cpu_usage'),
    memUsage: bigint('mem_usage', { mode: 'number' }),
    status: varchar('status', { length: 50 }),             // 'running', 'sleeping', etc.
  },
  (t) => [primaryKey({ columns: [t.id, t.collectedAt] })],
);

// logs 테이블 (TimescaleDB hypertable)
export const logs = pgTable(
  'logs',
  {
    id: bigserial('id', { mode: 'number' }).notNull(),
    serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
    source: varchar('source', { length: 100 }),
    level: varchar('level', { length: 20 }),
    message: text('message').notNull(),
    loggedAt: timestamp('logged_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.id, t.loggedAt] })],
);

// 타입 추론
export type Server = typeof servers.$inferSelect;
export type NewServer = typeof servers.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Metric = typeof metrics.$inferSelect;
export type NewMetric = typeof metrics.$inferInsert;
export type Process = typeof processes.$inferSelect;
export type NewProcess = typeof processes.$inferInsert;
export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;
