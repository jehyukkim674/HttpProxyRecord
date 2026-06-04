import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock };
    constructor(_options: unknown) {}
  },
}));

import { AIService } from '../src/main/ai/aiService';
import type { TrafficRecord } from '../src/shared/types';

const rec = (over: Partial<TrafficRecord> = {}): TrafficRecord =>
  ({
    id: 1,
    sessionId: 1,
    timestamp: '',
    method: 'GET',
    url: 'https://h/a',
    host: 'h',
    path: '/a',
    requestHeaders: {},
    requestBody: null,
    statusCode: 200,
    responseHeaders: {},
    responseBody: null,
    durationMs: 1,
    requestSize: 0,
    responseSize: 0,
    isHttps: true,
    clientIp: '',
    ...over,
  }) as TrafficRecord;

const textResponse = (text: string) => ({ content: [{ type: 'text', text }] });

describe('AIService 메서드', () => {
  const svc = new AIService(() => 'test-key');

  beforeEach(() => vi.clearAllMocks());

  it('hasKey: 주입 키가 있으면 true', () => {
    expect(svc.hasKey()).toBe(true);
    expect(new AIService(() => null).hasKey()).toBe(Boolean(process.env.ANTHROPIC_API_KEY));
  });

  it('키가 없으면 호출 시 에러', async () => {
    const noKey = new AIService(() => null);
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    await expect(noKey.explainResponse(rec())).rejects.toThrow('API 키');
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  });

  it('explainResponse: 텍스트 블록들을 합쳐 반환한다', async () => {
    createMock.mockResolvedValue({
      content: [
        { type: 'text', text: '첫째' },
        { type: 'thinking', thinking: '무시' },
        { type: 'text', text: '둘째' },
      ],
    });
    await expect(svc.explainResponse(rec())).resolves.toBe('첫째\n둘째');
  });

  it.each([
    'detectAnomalies',
    'generateTests',
    'sessionReport',
    'generateMockData',
    'securitySuggestions',
  ] as const)('%s: ask 래퍼로 텍스트를 반환한다', async (method) => {
    createMock.mockResolvedValue(textResponse('결과'));
    const input = method === 'detectAnomalies' || method === 'sessionReport' ? [rec()] : rec();
    const fn = svc[method] as (arg: unknown) => Promise<string>;
    await expect(fn.call(svc, input)).resolves.toBe('결과');
  });

  it('naturalLanguageSearch: 응답에서 id 배열을 파싱한다', async () => {
    createMock.mockResolvedValue(textResponse('해당하는 항목: [1, 3, 5]'));
    await expect(svc.naturalLanguageSearch('느린 요청', [rec()])).resolves.toEqual([1, 3, 5]);
  });

  it('naturalLanguageSearch: 배열이 없으면 빈 배열', async () => {
    createMock.mockResolvedValue(textResponse('매칭 없음'));
    await expect(svc.naturalLanguageSearch('x', [rec()])).resolves.toEqual([]);
  });

  it('naturalLanguageSearch: 숫자가 아닌 값은 걸러낸다', async () => {
    createMock.mockResolvedValue(textResponse('[1, 2]'));
    await expect(svc.naturalLanguageSearch('x', [rec()])).resolves.toEqual([1, 2]);
  });
});
