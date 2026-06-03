import type { CapturedTraffic } from '../../shared/types';

type HarHeader = { name: string; value: string };
type HarEntry = {
  startedDateTime?: string;
  time?: number;
  request?: { method?: string; url?: string; headers?: HarHeader[]; postData?: { text?: string } };
  response?: { status?: number; headers?: HarHeader[]; content?: { text?: string } };
};

const headersToMap = (headers: HarHeader[] | undefined): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const header of headers ?? []) map[header.name] = header.value;
  return map;
};

/** HAR 1.2 JSON 문자열을 CapturedTraffic 배열로 파싱한다. */
export const parseHar = (raw: string): CapturedTraffic[] => {
  const parsed: unknown = JSON.parse(raw);
  const entries = (parsed as { log?: { entries?: HarEntry[] } })?.log?.entries;
  if (!Array.isArray(entries)) {
    throw new Error('유효한 HAR 파일이 아니에요 (log.entries 없음).');
  }

  return entries.map((entry) => {
    const url = new URL(entry.request?.url ?? 'http://unknown/');
    const requestBody = entry.request?.postData?.text ?? null;
    const responseBody = entry.response?.content?.text ?? null;
    return {
      timestamp: entry.startedDateTime ?? new Date().toISOString(),
      method: entry.request?.method ?? 'GET',
      url: entry.request?.url ?? '',
      host: url.host,
      path: `${url.pathname}${url.search}`,
      requestHeaders: headersToMap(entry.request?.headers),
      requestBody,
      statusCode: entry.response?.status ?? 0,
      responseHeaders: headersToMap(entry.response?.headers),
      responseBody,
      durationMs: Math.round(entry.time ?? 0),
      requestSize: requestBody ? Buffer.byteLength(requestBody) : 0,
      responseSize: responseBody ? Buffer.byteLength(responseBody) : 0,
      isHttps: url.protocol === 'https:',
      clientIp: '',
    };
  });
};
