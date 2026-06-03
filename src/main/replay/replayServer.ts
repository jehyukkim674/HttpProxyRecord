import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import type { TrafficRecord } from '../../shared/types';

/** 재생 응답에서 제거할 헤더 (재계산되거나 의미 없는 것들) */
const STRIP_RESPONSE_HEADERS = ['content-length', 'transfer-encoding', 'content-encoding', 'connection'];

type ReplayStatusInternal = {
  running: boolean;
  port: number | null;
  hitCount: number;
  missCount: number;
};

export type ReplayOptions = {
  applyDelay?: boolean; // #17 녹화된 durationMs만큼 지연
  passthrough?: boolean; // #16 미매칭 요청을 원본 서버로 통과
};

/** 레코드에서 가장 흔한 원본 베이스 URL을 추정한다 (passthrough 대상). */
const inferBaseUrl = (records: TrafficRecord[]): { origin: string; isHttps: boolean } | null => {
  const hostCounts = new Map<string, { count: number; isHttps: boolean }>();
  for (const record of records) {
    const entry = hostCounts.get(record.host) ?? { count: 0, isHttps: record.isHttps };
    entry.count += 1;
    hostCounts.set(record.host, entry);
  }
  let best: { host: string; count: number; isHttps: boolean } | null = null;
  for (const [host, info] of hostCounts.entries()) {
    if (!best || info.count > best.count) best = { host, count: info.count, isHttps: info.isHttps };
  }
  if (!best) return null;
  return { origin: `${best.isHttps ? 'https' : 'http'}://${best.host}`, isHttps: best.isHttps };
};

/**
 * 녹화된 세션을 mock 서버로 재생한다.
 * 매칭 규칙: "METHOD 경로(쿼리 제외)" 정확 일치 — 쿼리가 다른 요청도 경로가 같으면 매칭
 */
export class ReplayServer {
  private server: http.Server | null = null;
  private port: number | null = null;
  private hitCount = 0;
  private missCount = 0;

  async start(records: TrafficRecord[], port: number, options: ReplayOptions = {}): Promise<number> {
    if (this.server) {
      await this.stop();
    }

    const matchMap = this.buildMatchMap(records);
    const baseTarget = inferBaseUrl(records);

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const pathWithoutQuery = (req.url ?? '/').split('?')[0];
        const matched = matchMap.get(`${req.method} ${pathWithoutQuery}`);

        if (!matched) {
          this.missCount += 1;
          // #16 패스스루: 미매칭 요청을 원본 서버로 통과 (하이브리드 mock)
          if (options.passthrough && baseTarget) {
            this.passthrough(req, res, baseTarget);
            return;
          }
          res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: '녹화된 응답이 없습니다', method: req.method, path: req.url }));
          return;
        }

        this.hitCount += 1;
        const responseHeaders: Record<string, string> = {};
        for (const [name, value] of Object.entries(matched.responseHeaders)) {
          if (STRIP_RESPONSE_HEADERS.includes(name.toLowerCase())) continue;
          responseHeaders[name] = value;
        }
        const send = (): void => {
          res.writeHead(matched.statusCode, responseHeaders);
          res.end(matched.responseBody ?? '');
        };
        // #17 지연 반영 재생: 녹화된 durationMs만큼 늦게 응답
        if (options.applyDelay && matched.durationMs > 0) {
          setTimeout(send, matched.durationMs);
        } else {
          send();
        }
      });

      server.on('error', reject);
      server.listen(port, '127.0.0.1', () => {
        this.server = server;
        this.port = (server.address() as AddressInfo).port;
        this.hitCount = 0;
        this.missCount = 0;
        resolve(this.port);
      });
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
        this.server.closeAllConnections();
      } else {
        resolve();
      }
    });
    this.server = null;
    this.port = null;
  }

  getStatus(): ReplayStatusInternal {
    return {
      running: this.server !== null,
      port: this.port,
      hitCount: this.hitCount,
      missCount: this.missCount,
    };
  }

  /** 미매칭 요청을 원본 베이스 서버로 중계한다 (#16 passthrough). */
  private passthrough(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    baseTarget: { origin: string; isHttps: boolean },
  ): void {
    const target = new URL(req.url ?? '/', baseTarget.origin);
    const requestFn = baseTarget.isHttps ? https.request : http.request;
    const upstream = requestFn(
      {
        hostname: target.hostname,
        port: target.port || (baseTarget.isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: req.method,
        headers: { ...req.headers, host: target.host },
        rejectUnauthorized: false,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('passthrough 실패');
    });
    req.pipe(upstream);
  }

  /** 첫 번째로 기록된 응답이 우선한다 (같은 메서드+경로 중복 시) */
  private buildMatchMap(records: TrafficRecord[]): Map<string, TrafficRecord> {
    const matchMap = new Map<string, TrafficRecord>();
    for (const record of records) {
      const pathWithoutQuery = record.path.split('?')[0];
      const key = `${record.method} ${pathWithoutQuery}`;
      if (!matchMap.has(key)) {
        matchMap.set(key, record);
      }
    }
    return matchMap;
  }
}
