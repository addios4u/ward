import { pgTable, uuid, varchar, timestamp, pgEnum, bigserial, doublePrecision, bigint, jsonb, integer, text } from 'drizzle-orm/pg-core';

// ENUM 타입
export const serverStatusEnum = pgEnum('server_status', ['online', 'offline', 'unknown']);

// servers 테이블
export const servers = pgTable('servers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  hostname: varchar('hostname', { length: 255 }).notNull(),
  apiKey: varchar('api_key', { length: 255 }).notNull().unique(),
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

// metrics 테이블
export const metrics = pgTable('metrics', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  collectedAt: timestamp('collected_at').notNull(),
  cpuUsage: doublePrecision('cpu_usage'),
  memTotal: bigint('mem_total', { mode: 'number' }),
  memUsed: bigint('mem_used', { mode: 'number' }),
  diskUsage: jsonb('disk_usage'),
  networkIo: jsonb('network_io'),
  loadAvg: doublePrecision('load_avg').array(),
});

// processes 테이블
export const processes = pgTable('processes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  collectedAt: timestamp('collected_at').notNull(),
  pid: integer('pid').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  cpuUsage: doublePrecision('cpu_usage'),
  memUsage: bigint('mem_usage', { mode: 'number' }),
});

// logs 테이블
export const logs = pgTable('logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  source: varchar('source', { length: 100 }),
  level: varchar('level', { length: 20 }),
  message: text('message').notNull(),
  loggedAt: timestamp('logged_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// 타입 추론
export type Server = typeof servers.$inferSelect;
export type NewServer = typeof servers.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Metric = typeof metrics.$inferSelect;
export type NewMetric = typeof metrics.$inferInsert;
export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;
