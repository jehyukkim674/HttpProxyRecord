import { useCallback, useState } from 'react';
import { ConfigProvider, Segmented, message, theme } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { TopToolbar } from './components/TopToolbar';
import { SessionSidebar } from './components/SessionSidebar';
import { TrafficTable } from './components/TrafficTable';
import { TrafficDetail } from './components/TrafficDetail';
import { TrafficFilterBar } from './components/TrafficFilterBar';
import { SettingsDrawer } from './components/SettingsDrawer';
import { ComposerModal } from './components/ComposerModal';
import { WaterfallView } from './components/WaterfallView';
import { SessionCompareModal } from './components/SessionCompareModal';
import { SnapshotsDrawer } from './components/SnapshotsDrawer';
import { RequestDiffModal } from './components/RequestDiffModal';
import { BreakpointPrompt } from './components/BreakpointPrompt';
import { useProxyControl } from './hooks/useProxyControl';
import { useSessions } from './hooks/useSessions';
import { useTraffic } from './hooks/useTraffic';
import { useTrafficFilter } from './hooks/useTrafficFilter';
import { useComposerVariables } from './hooks/useComposerVariables';
import { ipc } from './services/ipc';
import type { ReplayStatus, TrafficRecord } from '../../shared/types';

const DEFAULT_REPLAY_PORT = 8889;

const App = () => {
  const [messageApi, messageContextHolder] = message.useMessage();
  const { sessions, reload, remove } = useSessions();
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<TrafficRecord | null>(null);
  const [systemProxyEnabled, setSystemProxyEnabled] = useState(false);
  const [replayStatus, setReplayStatus] = useState<ReplayStatus | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const composerVars = useComposerVariables();
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerSeed, setComposerSeed] = useState<TrafficRecord | null>(null);
  const [trafficView, setTrafficView] = useState<'table' | 'waterfall'>('table');
  const [compareOpen, setCompareOpen] = useState(false);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [diffA, setDiffA] = useState<TrafficRecord | null>(null);
  const [diffB, setDiffB] = useState<TrafficRecord | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);

  const { records } = useTraffic(selectedSessionId);
  const { filter, setFilter, filtered } = useTrafficFilter(records);

  const handleRecordingChanged = useCallback(() => {
    void reload();
  }, [reload]);

  const { status, startRecording, stopRecording, error } = useProxyControl(handleRecordingChanged);

  // ── 녹화 제어 ──

  const handleStart = useCallback(
    (sessionName: string) => {
      void startRecording(sessionName).then(async (nextStatus) => {
        await reload();
        if (nextStatus?.recordingSessionId != null) {
          setSelectedSessionId(nextStatus.recordingSessionId);
          setSelectedRecord(null);
        }
      });
    },
    [startRecording, reload],
  );

  const handleStop = useCallback(() => {
    void stopRecording().then(() => {
      setSystemProxyEnabled(false);
    });
  }, [stopRecording]);

  const handleDelete = useCallback(
    (sessionId: number) => {
      void remove(sessionId);
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
        setSelectedRecord(null);
      }
    },
    [remove, selectedSessionId],
  );

  // ── 시스템 프록시 / 인증서 ──

  const handleToggleSystemProxy = useCallback(
    async (enabled: boolean) => {
      try {
        if (enabled) {
          await ipc.enableSystemProxy();
          setSystemProxyEnabled(true);
          void messageApi.success('시스템 프록시를 등록했어요');
        } else {
          await ipc.disableSystemProxy();
          setSystemProxyEnabled(false);
          void messageApi.info('시스템 프록시를 해제했어요');
        }
      } catch (caught) {
        void messageApi.error(caught instanceof Error ? caught.message : '시스템 프록시 설정 실패');
      }
    },
    [messageApi],
  );

  const handleInstallCert = useCallback(async () => {
    const result = await ipc.installCert();
    if (result.ok) {
      void messageApi.success(result.message);
    } else {
      void messageApi.warning(result.message);
    }
  }, [messageApi]);

  // ── 재생 ──

  const handleStartReplay = useCallback(
    async (sessionId: number) => {
      try {
        const nextReplayStatus = await ipc.startReplay(sessionId, DEFAULT_REPLAY_PORT);
        setReplayStatus(nextReplayStatus);
        void messageApi.success(`Mock 서버 재생 시작 — 127.0.0.1:${nextReplayStatus.port}`);
      } catch (caught) {
        void messageApi.error(caught instanceof Error ? caught.message : '재생 시작 실패');
      }
    },
    [messageApi],
  );

  const handleStopReplay = useCallback(async () => {
    const finalStatus = await ipc.stopReplay();
    setReplayStatus(null);
    void messageApi.info(`재생 중지 (히트 ${finalStatus.hitCount} / 미스 ${finalStatus.missCount})`);
  }, [messageApi]);

  // ── 내보내기 ──

  const handleExportHar = useCallback(
    async (sessionId: number) => {
      const result = await ipc.exportHar(sessionId);
      if (result.saved) void messageApi.success(`HAR 저장 완료: ${result.path}`);
    },
    [messageApi],
  );

  const handleExportMarkdown = useCallback(
    async (sessionId: number) => {
      const result = await ipc.exportMarkdown(sessionId);
      if (result.saved) void messageApi.success(`Markdown 저장 완료: ${result.path}`);
    },
    [messageApi],
  );

  const handleCopyCurl = useCallback(
    async (recordId: number) => {
      await ipc.copyCurl(recordId);
      void messageApi.success('curl 명령어를 클립보드에 복사했어요');
    },
    [messageApi],
  );

  const handleSaveSnapshot = useCallback(
    async (record: TrafficRecord) => {
      await ipc.saveSnapshot(record);
      void messageApi.success('스냅샷을 저장했어요');
    },
    [messageApi],
  );

  const handleCopySnippet = useCallback(
    async (text: string, label: string) => {
      await ipc.copyToClipboard(text);
      void messageApi.success(`${label} 코드를 복사했어요`);
    },
    [messageApi],
  );

  const handlePickDiff = useCallback(
    (record: TrafficRecord) => {
      setDiffA((previousA) => {
        if (!previousA) {
          void messageApi.info('A로 담았어요. 다른 요청을 한 번 더 담으면 비교됩니다');
          return record;
        }
        setDiffB(record);
        setDiffOpen(true);
        return previousA;
      });
    },
    [messageApi],
  );

  const handleExportPostman = useCallback(
    async (sessionId: number) => {
      const result = await ipc.exportPostman(sessionId);
      if (result.saved) void messageApi.success(`Postman 컬렉션 저장: ${result.path}`);
    },
    [messageApi],
  );

  const handleExportOpenApi = useCallback(
    async (sessionId: number) => {
      const result = await ipc.exportOpenApi(sessionId);
      if (result.saved) void messageApi.success(`OpenAPI 스펙 저장: ${result.path}`);
    },
    [messageApi],
  );

  const handleImportHar = useCallback(async () => {
    const result = await ipc.importHar();
    if (result.imported) {
      await reload();
      void messageApi.success('HAR을 새 세션으로 가져왔어요');
    }
  }, [messageApi, reload]);

  return (
    <ConfigProvider
      locale={koKR}
      theme={{ algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm }}
    >
      {messageContextHolder}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <TopToolbar
          status={status}
          error={error}
          systemProxyEnabled={systemProxyEnabled}
          onStart={handleStart}
          onStop={handleStop}
          onToggleSystemProxy={(enabled) => void handleToggleSystemProxy(enabled)}
          onInstallCert={() => void handleInstallCert()}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenCompare={() => setCompareOpen(true)}
          onOpenSnapshots={() => setSnapshotsOpen(true)}
          onImportHar={() => void handleImportHar()}
          darkMode={darkMode}
          onToggleDarkMode={setDarkMode}
        />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <SessionSidebar
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            recordingSessionId={status.recordingSessionId}
            replaySessionId={replayStatus?.sessionId ?? null}
            onSelect={(sessionId) => {
              setSelectedSessionId(sessionId);
              setSelectedRecord(null);
            }}
            onDelete={handleDelete}
            onStartReplay={(sessionId) => void handleStartReplay(sessionId)}
            onStopReplay={() => void handleStopReplay()}
            onExportHar={(sessionId) => void handleExportHar(sessionId)}
            onExportMarkdown={(sessionId) => void handleExportMarkdown(sessionId)}
            onExportPostman={(sessionId) => void handleExportPostman(sessionId)}
            onExportOpenApi={(sessionId) => void handleExportOpenApi(sessionId)}
          />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '8px 16px 0' }}>
              <Segmented
                size="small"
                value={trafficView}
                onChange={(value) => setTrafficView(value as 'table' | 'waterfall')}
                options={[
                  { label: '테이블', value: 'table' },
                  { label: '워터폴', value: 'waterfall' },
                ]}
              />
            </div>
            <TrafficFilterBar
              filter={filter}
              onChange={setFilter}
              total={records.length}
              shown={filtered.length}
            />
            <div style={{ flex: 1, overflow: 'auto' }}>
              {trafficView === 'table' ? (
                <TrafficTable
                  records={filtered}
                  selectedRecordId={selectedRecord?.id ?? null}
                  onSelect={setSelectedRecord}
                />
              ) : (
                <WaterfallView records={filtered} />
              )}
            </div>
          </div>
          <div style={{ width: 480, borderLeft: '1px solid #f0f0f0', overflow: 'hidden', flexShrink: 0 }}>
            <TrafficDetail
              record={selectedRecord}
              onCopyCurl={(recordId) => void handleCopyCurl(recordId)}
              onCopySnippet={(text, label) => void handleCopySnippet(text, label)}
              onResend={(record) => {
                setComposerSeed(record);
                setComposerOpen(true);
              }}
              onSaveSnapshot={(record) => void handleSaveSnapshot(record)}
              onPickDiff={handlePickDiff}
            />
          </div>
        </div>
      </div>
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ComposerModal
        open={composerOpen}
        initial={composerSeed}
        variables={composerVars.variables}
        onSetVariable={composerVars.setVariable}
        onRemoveVariable={composerVars.removeVariable}
        onClose={() => setComposerOpen(false)}
      />
      <SessionCompareModal open={compareOpen} sessions={sessions} onClose={() => setCompareOpen(false)} />
      <SnapshotsDrawer open={snapshotsOpen} onClose={() => setSnapshotsOpen(false)} />
      <RequestDiffModal
        open={diffOpen}
        recordA={diffA}
        recordB={diffB}
        onClose={() => {
          setDiffOpen(false);
          setDiffA(null);
          setDiffB(null);
        }}
      />
      <BreakpointPrompt />
    </ConfigProvider>
  );
};

export default App;
