import type { TrafficRecord } from '../../shared/types';

const APP_NAME = 'HttpProxyRecord';
const APP_VERSION = '0.1.0';

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
]);

const REDACTED = '***REDACTED***';

/** 민감 헤더 값을 마스킹한다 (내보내기 전용). 대소문자 무시. */
export const maskSensitiveHeaders = (headers: Record<string, string>): Record<string, string> => {
  const masked: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    masked[name] = SENSITIVE_HEADERS.has(name.toLowerCase()) ? REDACTED : value;
  }
  return masked;
};

type HarHeader = { name: string; value: string };

const toHarHeaders = (headers: Record<string, string>): HarHeader[] =>
  Object.entries(headers).map(([name, value]) => ({ name, value }));

/** HAR 1.2 형식으로 변환 (Chrome DevTools에서 import 가능) */
export const toHar = (records: TrafficRecord[]): object => ({
  log: {
    version: '1.2',
    creator: { name: APP_NAME, version: APP_VERSION },
    entries: records.map((record) => ({
      startedDateTime: record.timestamp,
      time: record.durationMs,
      request: {
        method: record.method,
        url: record.url,
        httpVersion: 'HTTP/1.1',
        headers: toHarHeaders(maskSensitiveHeaders(record.requestHeaders)),
        queryString: [],
        cookies: [],
        headersSize: -1,
        bodySize: record.requestSize,
        ...(record.requestBody !== null
          ? {
              postData: {
                mimeType: record.requestHeaders['content-type'] ?? 'application/octet-stream',
                text: record.requestBody,
              },
            }
          : {}),
      },
      response: {
        status: record.statusCode,
        statusText: '',
        httpVersion: 'HTTP/1.1',
        headers: toHarHeaders(maskSensitiveHeaders(record.responseHeaders)),
        cookies: [],
        content: {
          size: record.responseSize,
          mimeType: record.responseHeaders['content-type'] ?? 'application/octet-stream',
          text: record.responseBody ?? '',
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: record.responseSize,
      },
      cache: {},
      timings: { send: 0, wait: record.durationMs, receive: 0 },
    })),
  },
});

/** 단일 기록을 curl 명령어로 변환 */
export const toCurl = (record: TrafficRecord): string => {
  const lines = [`curl -X ${record.method} '${record.url}'`];

  for (const [name, value] of Object.entries(maskSensitiveHeaders(record.requestHeaders))) {
    if (name.toLowerCase() === 'host') continue;
    lines.push(`  -H '${name}: ${value.replace(/'/g, "'\\''")}'`);
  }

  if (record.requestBody !== null && record.requestBody.length > 0) {
    lines.push(`  -d '${record.requestBody.replace(/'/g, "'\\''")}'`);
  }

  return lines.join(' \\\n');
};

/** 세션 전체를 Markdown 문서로 변환 (증거 수집용) */
export const toMarkdown = (records: TrafficRecord[]): string => {
  const lines: string[] = ['# HTTP 트래픽 기록', ''];

  lines.push('| # | 시각 | 메서드 | 상태 | URL | 소요(ms) |');
  lines.push('|---|------|--------|------|-----|----------|');
  records.forEach((record, index) => {
    const time = new Date(record.timestamp).toLocaleTimeString('ko-KR', { hour12: false });
    lines.push(
      `| ${index + 1} | ${time} | ${record.method} | ${record.statusCode} | ${record.url} | ${record.durationMs} |`,
    );
  });
  lines.push('');

  records.forEach((record, index) => {
    lines.push(`## ${index + 1}. ${record.method} ${record.url}`);
    lines.push('');
    lines.push('### 요청');
    lines.push('');
    lines.push('| 헤더 | 값 |');
    lines.push('|------|-----|');
    for (const [name, value] of Object.entries(maskSensitiveHeaders(record.requestHeaders))) {
      lines.push(`| ${name} | ${value.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
    if (record.requestBody !== null && record.requestBody.length > 0) {
      lines.push('```json');
      lines.push(record.requestBody);
      lines.push('```');
      lines.push('');
    }

    lines.push(`### 응답 (${record.statusCode}, ${record.durationMs}ms)`);
    lines.push('');
    lines.push('| 헤더 | 값 |');
    lines.push('|------|-----|');
    for (const [name, value] of Object.entries(maskSensitiveHeaders(record.responseHeaders))) {
      lines.push(`| ${name} | ${value.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
    if (record.responseBody !== null && record.responseBody.length > 0) {
      lines.push('```json');
      lines.push(record.responseBody);
      lines.push('```');
      lines.push('');
    }
  });

  return lines.join('\n');
};
