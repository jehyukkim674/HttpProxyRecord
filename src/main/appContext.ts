import { app } from 'electron';
import path from 'node:path';
import { CertManager } from './proxy/certManager';
import { ProxyEngine } from './proxy/proxyEngine';
import { RecordStore } from './store/recordStore';
import { ReplayServer } from './replay/replayServer';
import { SystemProxyManager } from './system/systemProxy';
import type { CapturedTraffic, ProxyStatus, ReplayStatus, TrafficRecord } from '../shared/types';

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

  constructor() {
    const userDataDir = app.getPath('userData');
    this.certManager = new CertManager(path.join(userDataDir, 'certs'));
    this.recordStore = new RecordStore(path.join(userDataDir, 'records.db'));
    this.proxyEngine = new ProxyEngine(this.certManager);

    this.certManager.loadOrCreateRootCa();
    this.proxyEngine.onTraffic((traffic) => this.handleTraffic(traffic));
  }

  /** Renderer로 실시간 트래픽을 보낼 콜백 등록 */
  setBroadcaster(broadcaster: TrafficBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  private handleTraffic(traffic: CapturedTraffic): void {
    if (this.recordingSessionId === null) return;

    const record = this.recordStore.insertTraffic(this.recordingSessionId, traffic);
    this.broadcaster?.(record);
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
