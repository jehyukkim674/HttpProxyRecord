import { app, Notification } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CertManager } from './proxy/certManager';
import { ProxyEngine } from './proxy/proxyEngine';
import type { BreakpointHit } from './proxy/proxyEngine';
import { AIService } from './ai/aiService';
import { matchExcludeDomain } from './proxy/excludeFilter';
import { RecordStore } from './store/recordStore';
import { ReplayServer } from './replay/replayServer';
import { SystemProxyManager } from './system/systemProxy';
import { SettingsStore } from './settings';
import type { AlertRule, ReplayOptions } from './settings';
import { ScriptRunner } from './scripting/scriptRunner';
import type { ScriptLog } from './scripting/scriptRunner';
import { log } from './logger';
import type {
  CapturedTraffic,
  InterceptScript,
  OverrideRule,
  ProxyStatus,
  ReplayStatus,
  ThrottleConfig,
  TrafficRecord,
} from '../shared/types';

export type TrafficBroadcaster = (record: TrafficRecord) => void;

/**
 * Main 프로세스의 전역 컨텍스트.
 * 프록시/저장소/인증서/재생/시스템 프록시를 초기화하고 녹화 상태를 관리한다.
 * 설정 읽기/쓰기는 SettingsStore에 위임한다 (키·기본값·직렬화는 거기 한 곳에 모임).
 */
export class AppContext {
  readonly certManager: CertManager;
  readonly recordStore: RecordStore;
  readonly proxyEngine: ProxyEngine;
  readonly settings: SettingsStore;
  readonly scriptRunner: ScriptRunner;
  readonly replayServer = new ReplayServer();
  readonly systemProxyManager = new SystemProxyManager();
  readonly aiService = new AIService(() => this.settings.getAiApiKey());

  private proxyPort: number | null = null;
  private recordingSessionId: number | null = null;
  private replaySessionId: number | null = null;
  private broadcaster: TrafficBroadcaster | null = null;
  private breakpointBroadcaster: ((hit: BreakpointHit) => void) | null = null;
  private scriptLogBroadcaster: ((entry: ScriptLog) => void) | null = null;
  private excludeDomains: string[] = [];

  constructor() {
    const userDataDir = app.getPath('userData');
    this.certManager = new CertManager(path.join(userDataDir, 'certs'));
    this.recordStore = new RecordStore(path.join(userDataDir, 'records.db'));
    this.settings = new SettingsStore(this.recordStore);
    this.proxyEngine = new ProxyEngine(this.certManager);
    this.scriptRunner = new ScriptRunner((entry) => this.scriptLogBroadcaster?.(entry));
    this.proxyEngine.setScriptRunner(this.scriptRunner);

    this.certManager.loadOrCreateRootCa();
    this.proxyEngine.onTraffic((traffic) => this.handleTraffic(traffic));
    this.proxyEngine.onBreakpoint((hit) => this.breakpointBroadcaster?.(hit));
    this.excludeDomains = this.settings.getExcludeDomains();
    this.applyInterception();
    this.scriptRunner.setScripts(this.settings.getScripts());
  }

  setScriptLogBroadcaster(broadcaster: (entry: ScriptLog) => void): void {
    this.scriptLogBroadcaster = broadcaster;
  }

  // ─────────────────────────── 스크립트 인터셉션 ───────────────────────────

  getScripts(): InterceptScript[] {
    return this.settings.getScripts();
  }

  saveScript(input: { id?: string; name: string; code: string; enabled: boolean }): InterceptScript[] {
    const scripts = this.settings.getScripts();
    if (input.id) {
      const idx = scripts.findIndex((s) => s.id === input.id);
      if (idx >= 0) {
        scripts[idx] = { ...scripts[idx], name: input.name, code: input.code, enabled: input.enabled };
      }
    } else {
      scripts.push({ id: randomUUID(), name: input.name, code: input.code, enabled: input.enabled });
    }
    this.settings.setScripts(scripts);
    this.scriptRunner.setScripts(scripts);
    return scripts;
  }

  deleteScript(id: string): InterceptScript[] {
    const scripts = this.settings.getScripts().filter((s) => s.id !== id);
    this.settings.setScripts(scripts);
    this.scriptRunner.setScripts(scripts);
    return scripts;
  }

  toggleScript(id: string, enabled: boolean): InterceptScript[] {
    const scripts = this.settings.getScripts().map((s) => (s.id === id ? { ...s, enabled } : s));
    this.settings.setScripts(scripts);
    this.scriptRunner.setScripts(scripts);
    return scripts;
  }

  setBreakpointBroadcaster(broadcaster: (hit: BreakpointHit) => void): void {
    this.breakpointBroadcaster = broadcaster;
  }

  // ─────────────────────────── 인터셉션 (#4 오버라이드 / #7 throttle) ───────────────────────────

  private applyInterception(): void {
    this.proxyEngine.setInterception({
      overrideRules: this.settings.getOverrideRules(),
      throttle: this.settings.getThrottle(),
      breakpointPatterns: this.settings.getBreakpointPatterns(),
    });
  }

  getBreakpointPatterns(): string[] {
    return this.settings.getBreakpointPatterns();
  }

  setBreakpointPatterns(patterns: string[]): string[] {
    const cleaned = patterns.map((p) => p.trim()).filter((p) => p.length > 0);
    this.settings.setBreakpointPatterns(cleaned);
    this.applyInterception();
    return cleaned;
  }

  resolveBreakpoint(id: number, action: 'forward' | 'block'): void {
    this.proxyEngine.resolveBreakpoint(id, action);
  }

  getReplayOptions(): ReplayOptions {
    return this.settings.getReplayOptions();
  }

  setReplayOptions(options: ReplayOptions): ReplayOptions {
    this.settings.setReplayOptions(options);
    return options;
  }

  getOverrideRules(): OverrideRule[] {
    return this.settings.getOverrideRules();
  }

  setOverrideRules(rules: OverrideRule[]): OverrideRule[] {
    this.settings.setOverrideRules(rules);
    this.applyInterception();
    return rules;
  }

  getThrottle(): ThrottleConfig {
    return this.settings.getThrottle();
  }

  setThrottle(config: ThrottleConfig): ThrottleConfig {
    this.settings.setThrottle(config);
    this.applyInterception();
    return config;
  }

  /** Renderer로 실시간 트래픽을 보낼 콜백 등록 */
  setBroadcaster(broadcaster: TrafficBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  private handleTraffic(traffic: CapturedTraffic): void {
    // 프록시 이벤트 콜백 안에서 실행되므로, DB/알림 실패가 프록시를 죽이지 않도록 격리한다.
    try {
      if (this.recordingSessionId === null) return;
      // 제외 도메인은 기록·표시하지 않는다 (중계는 ProxyEngine이 이미 수행)
      if (matchExcludeDomain(traffic.host, this.excludeDomains)) return;

      const record = this.recordStore.insertTraffic(this.recordingSessionId, traffic);
      this.broadcaster?.(record);
      this.maybeAlert(traffic);
    } catch (error) {
      log.error('트래픽 기록 실패', error);
    }
  }

  // ─────────────────────────── 조건부 알림 (#30) ───────────────────────────

  private maybeAlert(traffic: CapturedTraffic): void {
    const alert = this.settings.getAlertRule();
    if (!alert.enabled || traffic.statusCode < alert.statusMin) return;
    if (!Notification.isSupported()) return;
    new Notification({
      title: `HTTP ${traffic.statusCode} — ${traffic.host}`,
      body: `${traffic.method} ${traffic.path}`,
    }).show();
  }

  getAlertRule(): AlertRule {
    return this.settings.getAlertRule();
  }

  setAlertRule(rule: AlertRule): AlertRule {
    this.settings.setAlertRule(rule);
    return rule;
  }

  // ─────────────────────────── AI (#21~#24) ───────────────────────────

  getAiKeyStatus(): { hasKey: boolean } {
    return { hasKey: this.aiService.hasKey() };
  }

  setAiApiKey(apiKey: string): { hasKey: boolean } {
    this.settings.setAiApiKey(apiKey.trim());
    return { hasKey: this.aiService.hasKey() };
  }

  // ─────────────────────────── 설정: 캡처 제외 도메인 ───────────────────────────

  getExcludeDomains(): string[] {
    return this.excludeDomains;
  }

  setExcludeDomains(domains: string[]): string[] {
    this.excludeDomains = domains.map((domain) => domain.trim()).filter((domain) => domain.length > 0);
    this.settings.setExcludeDomains(this.excludeDomains);
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
    // 재생 옵션은 설정에서 읽는다 (#16 패스스루 / #17 지연)
    await this.replayServer.start(records, port, this.settings.getReplayOptions());
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
