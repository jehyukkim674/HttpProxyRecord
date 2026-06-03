import vm from 'node:vm';
import { log } from '../logger';
import type { InterceptScript } from '../../shared/types';

export type ScriptRequest = {
  method: string;
  url: string;
  host: string;
  path: string;
  headers: Record<string, string>;
  body: string | null;
};
export type ScriptResponse = { status: number; headers: Record<string, string>; body: string };
export type ScriptShortCircuit = { status: number; headers: Record<string, string>; body: string };

/** ProxyEngine이 의존하는 인터페이스 (vm 의존 없이 테스트에서 가짜 주입 가능) */
export interface ScriptHooks {
  hasRequestHooks(): boolean;
  hasResponseHooks(): boolean;
  runRequest(req: ScriptRequest): ScriptShortCircuit | null;
  runResponse(req: ScriptRequest, res: ScriptResponse): void;
}

export type ScriptLog = { scriptId: string; level: 'log' | 'warn' | 'error'; message: string };
export type ScriptLogListener = (entry: ScriptLog) => void;

const TIMEOUT_MS = 1000;
const DEFAULT_HEADERS = { 'content-type': 'text/plain; charset=utf-8' };

type Compiled = { id: string; ctx: vm.Context; onReq: boolean; onRes: boolean };

/**
 * 사용자 스크립트를 node:vm 격리 컨텍스트에서 컴파일·실행한다.
 *
 * - 스크립트별 컨텍스트를 1회 컴파일해 보관(onRequest/onResponse/store 정의).
 * - 동기 훅만 지원(타임아웃으로 무한루프 차단 가능하게).
 * - 컴파일/런타임/타임아웃 오류는 모두 fail-open: 로그만 남기고 해당 스크립트를 건너뛴다
 *   (스크립트 오류가 프록시를 죽이지 않도록).
 */
export class ScriptRunner implements ScriptHooks {
  private compiled: Compiled[] = [];

  constructor(private readonly onLog: ScriptLogListener) {}

  setScripts(scripts: InterceptScript[]): void {
    const next: Compiled[] = [];
    for (const s of scripts) {
      if (!s.enabled) continue;
      try {
        const ctx = this.makeContext(s.id);
        vm.runInContext(s.code, ctx, { timeout: TIMEOUT_MS, filename: `${s.name}.js` });
        const g = ctx as Record<string, unknown>;
        next.push({
          id: s.id,
          ctx,
          onReq: typeof g.onRequest === 'function',
          onRes: typeof g.onResponse === 'function',
        });
      } catch (error) {
        this.report(s.id, 'error', `컴파일 실패: ${this.msg(error)}`);
      }
    }
    this.compiled = next;
  }

  hasRequestHooks(): boolean {
    return this.compiled.some((c) => c.onReq);
  }

  hasResponseHooks(): boolean {
    return this.compiled.some((c) => c.onRes);
  }

  runRequest(req: ScriptRequest): ScriptShortCircuit | null {
    for (const c of this.compiled) {
      if (!c.onReq) continue;
      try {
        (c.ctx as Record<string, unknown>).__req = req;
        const result = vm.runInContext('onRequest(__req)', c.ctx, { timeout: TIMEOUT_MS });
        const sc = this.normalize(result);
        if (sc) return sc;
      } catch (error) {
        this.report(c.id, 'error', this.msg(error));
      }
    }
    return null;
  }

  runResponse(req: ScriptRequest, res: ScriptResponse): void {
    for (const c of this.compiled) {
      if (!c.onRes) continue;
      try {
        const g = c.ctx as Record<string, unknown>;
        g.__req = req;
        g.__res = res;
        vm.runInContext('onResponse(__req, __res)', c.ctx, { timeout: TIMEOUT_MS });
      } catch (error) {
        this.report(c.id, 'error', this.msg(error));
      }
    }
  }

  private normalize(result: unknown): ScriptShortCircuit | null {
    if (!result || typeof result !== 'object') return null;
    const r = result as Record<string, unknown>;
    if (r.block === true) {
      return { status: 403, headers: { ...DEFAULT_HEADERS }, body: '스크립트에서 차단됨' };
    }
    if (typeof r.status === 'number' || typeof r.body === 'string') {
      return {
        status: typeof r.status === 'number' ? r.status : 200,
        headers:
          r.headers && typeof r.headers === 'object'
            ? (r.headers as Record<string, string>)
            : { ...DEFAULT_HEADERS },
        body: typeof r.body === 'string' ? r.body : '',
      };
    }
    return null;
  }

  private makeContext(scriptId: string): vm.Context {
    const sandbox = {
      console: {
        log: (...a: unknown[]) => this.report(scriptId, 'log', a.map(String).join(' ')),
        warn: (...a: unknown[]) => this.report(scriptId, 'warn', a.map(String).join(' ')),
        error: (...a: unknown[]) => this.report(scriptId, 'error', a.map(String).join(' ')),
      },
      JSON,
      Math,
      Date,
      URL,
      TextEncoder,
      TextDecoder,
      atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
      btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
      store: {},
    };
    return vm.createContext(sandbox);
  }

  private report(scriptId: string, level: ScriptLog['level'], message: string): void {
    log.warn(`[script ${scriptId}] ${message}`);
    try {
      this.onLog({ scriptId, level, message });
    } catch {
      /* 로그 리스너 실패는 무시 */
    }
  }

  private msg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
