import { describe, expect, it } from 'vitest';
import { AIService } from '../src/main/ai/aiService';
import { summarizeRecordForAI, summarizeRecordsForAI } from '../src/main/ai/aiPrompts';
import type { TrafficRecord } from '../src/shared/types';

const rec = (over: Partial<TrafficRecord> = {}): TrafficRecord => ({
  id: 1,
  sessionId: 1,
  timestamp: '2026-06-03T10:00:00.000Z',
  method: 'POST',
  url: 'https://api.example.com/users',
  host: 'api.example.com',
  path: '/users',
  requestHeaders: { authorization: 'Bearer secret', accept: 'application/json' },
  requestBody: '{"name":"x"}',
  statusCode: 201,
  responseHeaders: {},
  responseBody: '{"id":1}',
  durationMs: 50,
  requestSize: 0,
  responseSize: 0,
  isHttps: true,
  clientIp: '',
  ...over,
});

describe('summarizeRecordForAI', () => {
  it('민감 헤더를 마스킹해 요약한다', () => {
    const text = summarizeRecordForAI(rec());
    expect(text).toContain('POST https://api.example.com/users');
    expect(text).toContain('***REDACTED***');
    expect(text).not.toContain('Bearer secret');
  });
});

describe('summarizeRecordsForAI', () => {
  it('id/메서드/경로/상태를 한 줄씩 요약한다', () => {
    const text = summarizeRecordsForAI([
      rec({ id: 1 }),
      rec({ id: 2, method: 'GET', path: '/x', statusCode: 200 }),
    ]);
    expect(text).toContain('#1 POST /users → 201');
    expect(text).toContain('#2 GET /x → 200');
  });
});

describe('AIService', () => {
  it('키가 없으면 hasKey는 false', () => {
    const service = new AIService(() => null);
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(service.hasKey()).toBe(false);
    if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('키가 없으면 explainResponse가 안내 에러를 던진다', async () => {
    const service = new AIService(() => null);
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    await expect(service.explainResponse(rec())).rejects.toThrow('Claude API 키가 설정되지 않았어요');
    if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('설정에 키가 있으면 hasKey는 true', () => {
    const service = new AIService(() => 'sk-ant-test');
    expect(service.hasKey()).toBe(true);
  });
});
