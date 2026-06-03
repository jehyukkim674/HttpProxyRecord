import http from 'node:http';
import https from 'node:https';
import type { ComposedRequest, ComposedResponse } from '../../shared/types';

/** 합성 요청을 실제로 전송하고 응답을 수집한다 (재전송/체이닝용). */
export const sendComposedRequest = (request: ComposedRequest): Promise<ComposedResponse> =>
  new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      reject(new Error(`잘못된 URL입니다: ${request.url}`));
      return;
    }

    const isHttps = url.protocol === 'https:';
    const requestFn = isHttps ? https.request : http.request;
    const startedAt = Date.now();

    const clientRequest = requestFn(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers: request.headers,
        rejectUnauthorized: false,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const headers: Record<string, string> = {};
          for (const [name, value] of Object.entries(response.headers)) {
            if (value === undefined) continue;
            headers[name] = Array.isArray(value) ? value.join(', ') : value;
          }
          resolve({
            statusCode: response.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString('utf-8'),
            durationMs: Date.now() - startedAt,
          });
        });
      },
    );

    clientRequest.on('error', reject);
    if (request.body !== null && request.body.length > 0) clientRequest.write(request.body);
    clientRequest.end();
  });
