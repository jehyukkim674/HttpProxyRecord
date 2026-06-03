import type { TrafficRecord } from '../../shared/types';

/** 숫자/UUID 세그먼트를 {id}로 치환해 경로를 일반화한다. */
const parameterizePath = (path: string): string =>
  path
    .split('?')[0]
    .split('/')
    .map((segment) => {
      if (/^\d+$/.test(segment)) return '{id}';
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return '{id}';
      return segment;
    })
    .join('/');

/** Postman Collection v2.1 형식으로 변환. */
export const toPostmanCollection = (name: string, records: TrafficRecord[]): object => ({
  info: {
    name,
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: records.map((record) => ({
    name: `${record.method} ${record.path}`,
    request: {
      method: record.method,
      header: Object.entries(record.requestHeaders)
        .filter(([key]) => key.toLowerCase() !== 'host')
        .map(([key, value]) => ({ key, value })),
      url: {
        raw: record.url,
        host: [record.host],
        path: record.path.split('?')[0].split('/').filter(Boolean),
      },
      ...(record.requestBody ? { body: { mode: 'raw', raw: record.requestBody } } : {}),
    },
  })),
});

/** 캡처 트래픽에서 OpenAPI 3.1 스펙을 역공학 생성. */
export const toOpenApi = (records: TrafficRecord[]): object => {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const record of records) {
    const apiPath = parameterizePath(record.path);
    const method = record.method.toLowerCase();
    paths[apiPath] ??= {};

    const existing = paths[apiPath][method] as { responses: Record<string, unknown> } | undefined;
    const responses = existing?.responses ?? {};
    responses[String(record.statusCode)] = {
      description: `${record.statusCode} 응답`,
      content: {
        [record.responseHeaders['content-type']?.split(';')[0] ?? 'application/json']: {
          ...(record.responseBody ? { example: record.responseBody } : {}),
        },
      },
    };

    paths[apiPath][method] = {
      summary: `${record.method} ${apiPath}`,
      responses,
    };
  }

  return {
    openapi: '3.1.0',
    info: { title: 'HttpProxyRecord 캡처 스펙', version: '1.0.0' },
    paths,
  };
};
