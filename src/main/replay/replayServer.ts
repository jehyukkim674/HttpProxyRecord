import http from 'node:http';
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

/**
 * 녹화된 세션을 mock 서버로 재생한다.
 * 매칭 규칙: "METHOD 경로(쿼리 제외)" 정확 일치 — 쿼리가 다른 요청도 경로가 같으면 매칭
 */
export class ReplayServer {
  private server: http.Server | null = null;
  private port: number | null = null;
  private hitCount = 0;
  private missCount = 0;

  async start(records: TrafficRecord[], port: number): Promise<number> {
    if (this.server) {
      await this.stop();
    }

    const matchMap = this.buildMatchMap(records);

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const pathWithoutQuery = (req.url ?? '/').split('?')[0];
        const matched = matchMap.get(`${req.method} ${pathWithoutQuery}`);

        if (!matched) {
          this.missCount += 1;
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
        res.writeHead(matched.statusCode, responseHeaders);
        res.end(matched.responseBody ?? '');
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
