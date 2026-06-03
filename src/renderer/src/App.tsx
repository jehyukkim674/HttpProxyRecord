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
import { StatsModal } from './components/StatsModal';
import { FavoritesDrawer } from './components/FavoritesDrawer';
import { MobilePairingModal } from './components/MobilePairingModal';
import { AiResultModal } from './components/AiResultModal';
import { AiSearchModal } from './components/AiSearchModal';
import { ScriptsDrawer } from './components/ScriptsDrawer';
import { AnalysisModal } from './components/AnalysisModal';
import { SequenceDiagramModal } from './components/SequenceDiagramModal';
import { useProxyControl } from './hooks/useProxyControl';
import { useSessions } from './hooks/useSessions';
import { useTraffic } from './hooks/useTraffic';
import { useTrafficFilter } from './hooks/useTrafficFilter';
import { useComposerVariables } from './hooks/useComposerVariables';
import { useSystemProxy } from './hooks/useSystemProxy';
import { useReplay } from './hooks/useReplay';
import { useExportActions } from './hooks/useExportActions';
import { useAiActions } from './hooks/useAiActions';
import { ipc } from './services/ipc';
import type { TrafficRecord } from '../../shared/types';

const App = () => {
  const [messageApi, messageContextHolder] = message.useMessage();
  const { sessions, reload, remove } = useSessions();
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<TrafficRecord | null>(null);
  const { records } = useTraffic(selectedSessionId);
  const { filter, setFilter, filtered } = useTrafficFilter(records);

  // 기능별 액션 훅 (IPC 호출 + 자체 상태)
  const proxy = useSystemProxy(messageApi);
  const replay = useReplay(messageApi);
  const exporter = useExportActions(messageApi, reload);
  const ai = useAiActions(messageApi, selectedSessionId, records);
  const composerVars = useComposerVariables();

  // UI 토글/모달 상태
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerSeed, setComposerSeed] = useState<TrafficRecord | null>(null);
  const [trafficView, setTrafficView] = useState<'table' | 'waterfall'>('table');
  const [compareOpen, setCompareOpen] = useState(false);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [diffA, setDiffA] = useState<TrafficRecord | null>(null);
  const [diffB, setDiffB] = useState<TrafficRecord | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [scriptsOpen, setScriptsOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [sequenceOpen, setSequenceOpen] = useState(false);

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
      proxy.setEnabled(false);
    });
  }, [stopRecording, proxy]);

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

  // ── 트래픽 단건 액션 ──

  const handleSaveSnapshot = useCallback(
    async (record: TrafficRecord) => {
      await ipc.saveSnapshot(record);
      void messageApi.success('스냅샷을 저장했어요');
    },
    [messageApi],
  );

  const handleAddFavorite = useCallback(
    async (record: TrafficRecord) => {
      await ipc.saveFavorite({ method: record.method, url: record.url, note: '' });
      void messageApi.success('즐겨찾기에 추가했어요');
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
          systemProxyEnabled={proxy.enabled}
          onStart={handleStart}
          onStop={handleStop}
          onToggleSystemProxy={(enabled) => void proxy.toggle(enabled)}
          onInstallCert={() => void proxy.installCert()}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenCompare={() => setCompareOpen(true)}
          onOpenSnapshots={() => setSnapshotsOpen(true)}
          onImportHar={() => void exporter.importHar()}
          onOpenStats={() => setStatsOpen(true)}
          onOpenFavorites={() => setFavoritesOpen(true)}
          onOpenPairing={() => setPairingOpen(true)}
          onAiAnomalies={ai.anomalies}
          onAiSearch={() => ai.setSearchOpen(true)}
          onAiReport={ai.report}
          onOpenScripts={() => setScriptsOpen(true)}
          onOpenAnalysis={() => setAnalysisOpen(true)}
          onOpenSequence={() => setSequenceOpen(true)}
          darkMode={darkMode}
          onToggleDarkMode={setDarkMode}
        />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <SessionSidebar
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            recordingSessionId={status.recordingSessionId}
            replaySessionId={replay.status?.sessionId ?? null}
            onSelect={(sessionId) => {
              setSelectedSessionId(sessionId);
              setSelectedRecord(null);
            }}
            onDelete={handleDelete}
            onStartReplay={(sessionId) => void replay.start(sessionId)}
            onStopReplay={() => void replay.stop()}
            onExportHar={(sessionId) => void exporter.exportHar(sessionId)}
            onExportMarkdown={(sessionId) => void exporter.exportMarkdown(sessionId)}
            onExportPostman={(sessionId) => void exporter.exportPostman(sessionId)}
            onExportOpenApi={(sessionId) => void exporter.exportOpenApi(sessionId)}
            onExportK6={(sessionId) => void exporter.exportK6(sessionId)}
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
              onCopyCurl={(recordId) => void exporter.copyCurl(recordId)}
              onCopySnippet={(text, label) => void exporter.copySnippet(text, label)}
              onResend={(record) => {
                setComposerSeed(record);
                setComposerOpen(true);
              }}
              onSaveSnapshot={(record) => void handleSaveSnapshot(record)}
              onPickDiff={handlePickDiff}
              onAddFavorite={(record) => void handleAddFavorite(record)}
              onAiExplain={ai.explain}
              onAiTests={ai.tests}
              onAiSecurity={ai.security}
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
      <StatsModal open={statsOpen} records={records} onClose={() => setStatsOpen(false)} />
      <MobilePairingModal open={pairingOpen} onClose={() => setPairingOpen(false)} />
      <AiResultModal
        open={ai.modal.open}
        title={ai.modal.title}
        loading={ai.modal.loading}
        text={ai.modal.text}
        onClose={ai.closeModal}
      />
      <AiSearchModal open={ai.searchOpen} onSearch={ai.search} onClose={() => ai.setSearchOpen(false)} />
      <ScriptsDrawer open={scriptsOpen} onClose={() => setScriptsOpen(false)} />
      <AnalysisModal
        open={analysisOpen}
        records={records}
        onClose={() => setAnalysisOpen(false)}
        onJump={(recordId) => {
          const found = records.find((record) => record.id === recordId);
          if (found) setSelectedRecord(found);
        }}
      />
      <SequenceDiagramModal open={sequenceOpen} records={records} onClose={() => setSequenceOpen(false)} />
      <FavoritesDrawer
        open={favoritesOpen}
        onClose={() => setFavoritesOpen(false)}
        onResend={(record) => {
          setComposerSeed(record);
          setComposerOpen(true);
          setFavoritesOpen(false);
        }}
      />
    </ConfigProvider>
  );
};

export default App;
