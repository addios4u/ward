import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

const app = createApp();

describe('GET /health', () => {
  it('200 상태코드와 ok 상태를 반환해야 한다', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('ward-server');
    expect(res.body.timestamp).toBeDefined();
  });
});
