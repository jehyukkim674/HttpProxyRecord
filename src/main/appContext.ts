import { app } from 'electron';
import path from 'node:path';
import { CertManager } from './proxy/certManager';
import { ProxyEngine } from './proxy/proxyEngine';
import type { BreakpointHit } from './proxy/proxyEngine';
import { matchExcludeDomain } from './proxy/excludeFilter';
import { RecordStore } from './store/recordStore';
import { ReplayServer } from './replay/replayServer';
import { SystemProxyManager } from './system/systemProxy';
import type {
  CapturedTraffic,
  OverrideRule,
  ProxyStatus,
  ReplayStatus,
  ThrottleConfig,
  TrafficRecord,
} from '../shared/types';

const DEFAULT_THROTTLE: ThrottleConfig = { enabled: false, latencyMs: 0 };

export type TrafficBroadcaster = (record: TrafficRecord) => void;

/**
 * Main 프로세스의 전역 컨텍스트.
 * 프록시/저장소/인증서/재생/시스템 프록시를 초기화하고 녹화 상태를 관리한다.
 */
export class AppContext {
  readonly certManager: CertManager;
  readonly recordStore: RecordStore;
  readonly proxyEngine: ProxyEngine;
  readonly replayServer = new ReplayServer();
  readonly systemProxyManager = new SystemProxyManager();

  private proxyPort: number | null = null;
  private recordingSessionId: number | null = null;
  private replaySessionId: number | null = null;
  private broadcaster: TrafficBroadcaster | null = null;
  private breakpointBroadcaster: ((hit: BreakpointHit) => void) | null = null;
  private excludeDomains: string[] = [];

  constructor() {
    const userDataDir = app.getPath('userData');
    this.certManager = new CertManager(path.join(userDataDir, 'certs'));
    this.recordStore = new RecordStore(path.join(userDataDir, 'records.db'));
    this.proxyEngine = new ProxyEngine(this.certManager);

    this.certManager.loadOrCreateRootCa();
    this.proxyEngine.onTraffic((traffic) => this.handleTraffic(traffic));
    this.proxyEngine.onBreakpoint((hit) => this.breakpointBroadcaster?.(hit));
    this.excludeDomains = this.loadExcludeDomains();
    this.applyInterception();
  }

  setBreakpointBroadcaster(broadcaster: (hit: BreakpointHit) => void): void {
    this.breakpointBroadcaster = broadcaster;
  }

  // ─────────────────────────── 인터셉션 (#4 오버라이드 / #7 throttle) ───────────────────────────

  private loadJson<T>(key: string, fallback: T): T {
    const raw = this.recordStore.getSetting(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private applyInterception(): void {
    this.proxyEngine.setInterception({
      overrideRules: this.loadJson<OverrideRule[]>('overrideRules', []),
      throttle: this.loadJson<ThrottleConfig>('throttle', DEFAULT_THROTTLE),
      breakpointPatterns: this.loadJson<string[]>('breakpointPatterns', []),
    });
  }

  getBreakpointPatterns(): string[] {
    return this.loadJson<string[]>('breakpointPatterns', []);
  }

  setBreakpointPatterns(patterns: string[]): string[] {
    const cleaned = patterns.map((p) => p.trim()).filter((p) => p.length > 0);
    this.recordStore.setSetting('breakpointPatterns', JSON.stringify(cleaned));
    this.applyInterception();
    return cleaned;
  }

  resolveBreakpoint(id: number, action: 'forward' | 'block'): void {
    this.proxyEngine.resolveBreakpoint(id, action);
  }

  getOverrideRules(): OverrideRule[] {
    return this.loadJson<OverrideRule[]>('overrideRules', []);
  }

  setOverrideRules(rules: OverrideRule[]): OverrideRule[] {
    this.recordStore.setSetting('overrideRules', JSON.stringify(rules));
    this.applyInterception();
    return rules;
  }

  getThrottle(): ThrottleConfig {
    return this.loadJson<ThrottleConfig>('throttle', DEFAULT_THROTTLE);
  }

  setThrottle(config: ThrottleConfig): ThrottleConfig {
    this.recordStore.setSetting('throttle', JSON.stringify(config));
    this.applyInterception();
    return config;
  }

  /** Renderer로 실시간 트래픽을 보낼 콜백 등록 */
  setBroadcaster(broadcaster: TrafficBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  private handleTraffic(traffic: CapturedTraffic): void {
    if (this.recordingSessionId === null) return;
    // 제외 도메인은 기록·표시하지 않는다 (중계는 ProxyEngine이 이미 수행)
    if (matchExcludeDomain(traffic.host, this.excludeDomains)) return;

    const record = this.recordStore.insertTraffic(this.recordingSessionId, traffic);
    this.broadcaster?.(record);
  }

  // ─────────────────────────── 설정: 캡처 제외 도메인 ───────────────────────────

  private loadExcludeDomains(): string[] {
    const raw = this.recordStore.getSetting('excludeDomains');
    if (!raw) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  getExcludeDomains(): string[] {
    return this.excludeDomains;
  }

  setExcludeDomains(domains: string[]): string[] {
    this.excludeDomains = domains.map((domain) => domain.trim()).filter((domain) => domain.length > 0);
    this.recordStore.setSetting('excludeDomains', JSON.stringify(this.excludeDomains));
    return this.excludeDomains;
  }

  // ─────────────────────────── 녹화 ───────────────────────────

  /** 녹화 시작: 새 세션 생성 + 프록시 시작 */
  async startRecording(sessionName: string, port: number): Promise<ProxyStatus> {
    if (this.proxyEngine.isRunning) {
      throw new Error('이미 녹화가 진행 중입니다. 먼저 중지해 주세요.');
    }

    const session = this.recordStore.createSession(sessionName);
    const actualPort = await this.proxyEngine.start(port);
    this.proxyPort = actualPort;
    this.recordingSessionId = session.id;

    return this.getProxyStatus();
  }

  /** 녹화 중지: 프록시 중지 + 세션 종료 + 시스템 프록시 해제 */
  async stopRecording(): Promise<ProxyStatus> {
    if (this.recordingSessionId !== null) {
      this.recordStore.endSession(this.recordingSessionId);
    }
    if (this.systemProxyManager.isEnabled) {
      await this.systemProxyManager.disable().catch(() => undefined);
    }
    await this.proxyEngine.stop();
    this.proxyPort = null;
    this.recordingSessionId = null;

    return this.getProxyStatus();
  }

  getProxyStatus(): ProxyStatus {
    return {
      running: this.proxyEngine.isRunning,
      port: this.proxyPort,
      recordingSessionId: this.recordingSessionId,
    };
  }

  // ─────────────────────────── 재생 ───────────────────────────

  async startReplay(sessionId: number, port: number): Promise<ReplayStatus> {
    const records = this.recordStore.listTraffic(sessionId);
    if (records.length === 0) {
      throw new Error('이 세션에는 재생할 트래픽이 없어요.');
    }
    await this.replayServer.start(records, port);
    this.replaySessionId = sessionId;
    return this.getReplayStatus();
  }

  async stopReplay(): Promise<ReplayStatus> {
    await this.replayServer.stop();
    const finalStatus = this.getReplayStatus();
    this.replaySessionId = null;
    return finalStatus;
  }

  getReplayStatus(): ReplayStatus {
    const internalStatus = this.replayServer.getStatus();
    return {
      running: internalStatus.running,
      port: internalStatus.port,
      sessionId: this.replaySessionId,
      hitCount: internalStatus.hitCount,
      missCount: internalStatus.missCount,
    };
  }

  // ─────────────────────────── 정리 ───────────────────────────

  async dispose(): Promise<void> {
    if (this.systemProxyManager.isEnabled) {
      await this.systemProxyManager.disable().catch(() => undefined);
    }
    await this.replayServer.stop();
    await this.proxyEngine.stop();
    this.recordStore.close();
  }
}
