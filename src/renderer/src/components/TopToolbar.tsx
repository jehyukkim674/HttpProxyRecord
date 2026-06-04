import { useState } from 'react';
import { Alert, Button, Input, Space, Switch, Tag } from 'antd';
import {
  AuditOutlined,
  BarChartOutlined,
  BulbOutlined,
  CameraOutlined,
  CloudDownloadOutlined,
  CodeOutlined,
  DiffOutlined,
  FileTextOutlined,
  ImportOutlined,
  MobileOutlined,
  NodeIndexOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  StarOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ProxyStatus } from '../../../shared/types';

type TopToolbarProps = {
  status: ProxyStatus;
  error: string | null;
  systemProxyEnabled: boolean;
  onStart: (sessionName: string) => void;
  onStop: () => void;
  onToggleSystemProxy: (enabled: boolean) => void;
  onInstallCert: () => void;
  onOpenSettings: () => void;
  onOpenCompare: () => void;
  onOpenSnapshots: () => void;
  onImportHar: () => void;
  onOpenStats: () => void;
  onOpenFavorites: () => void;
  onOpenPairing: () => void;
  onAiAnomalies: () => void;
  onAiSearch: () => void;
  onAiReport: () => void;
  onOpenScripts: () => void;
  onOpenAnalysis: () => void;
  onOpenSequence: () => void;
  onOpenGuide: () => void;
  onOpenPalette: () => void;
  darkMode: boolean;
  onToggleDarkMode: (enabled: boolean) => void;
  onCheckUpdate: () => void;
  checkingUpdate: boolean;
};

export const TopToolbar = ({
  status,
  error,
  systemProxyEnabled,
  onStart,
  onStop,
  onToggleSystemProxy,
  onInstallCert,
  onOpenSettings,
  onOpenCompare,
  onOpenSnapshots,
  onImportHar,
  onOpenStats,
  onOpenFavorites,
  onOpenPairing,
  onAiAnomalies,
  onAiSearch,
  onAiReport,
  onOpenScripts,
  onOpenAnalysis,
  onOpenSequence,
  onOpenGuide,
  onOpenPalette,
  darkMode,
  onToggleDarkMode,
  onCheckUpdate,
  checkingUpdate,
}: TopToolbarProps) => {
  const [sessionName, setSessionName] = useState('');

  const handleStart = () => {
    const name = sessionName.trim() || `세션 ${new Date().toLocaleString('ko-KR')}`;
    onStart(name);
    setSessionName('');
  };

  return (
    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--app-border)' }}>
      <Space wrap>
        {status.running ? (
          <Button danger icon={<StopOutlined />} onClick={onStop}>
            녹화 중지
          </Button>
        ) : (
          <>
            <Input
              placeholder="세션 이름 (비우면 자동 생성)"
              value={sessionName}
              onChange={(event) => setSessionName(event.target.value)}
              style={{ width: 260 }}
              onPressEnter={handleStart}
            />
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStart}>
              녹화 시작
            </Button>
          </>
        )}
        {status.running && status.port !== null && (
          <Tag color="green">프록시 실행 중 — 127.0.0.1:{status.port}</Tag>
        )}
        <Switch
          checkedChildren="시스템 프록시 ON"
          unCheckedChildren="시스템 프록시 OFF"
          checked={systemProxyEnabled}
          disabled={!status.running}
          onChange={onToggleSystemProxy}
        />
        <Button icon={<SafetyCertificateOutlined />} onClick={onInstallCert}>
          인증서 설치
        </Button>
        <Button icon={<MobileOutlined />} onClick={onOpenPairing}>
          모바일
        </Button>
        <Button icon={<DiffOutlined />} onClick={onOpenCompare}>
          세션 비교
        </Button>
        <Button icon={<CameraOutlined />} onClick={onOpenSnapshots}>
          스냅샷
        </Button>
        <Button icon={<ImportOutlined />} onClick={onImportHar}>
          HAR 가져오기
        </Button>
        <Button icon={<BarChartOutlined />} onClick={onOpenStats}>
          통계
        </Button>
        <Button icon={<StarOutlined />} onClick={onOpenFavorites}>
          즐겨찾기
        </Button>
        <Button icon={<RobotOutlined />} onClick={onAiAnomalies}>
          AI 이상탐지
        </Button>
        <Button icon={<SearchOutlined />} onClick={onAiSearch}>
          AI 검색
        </Button>
        <Button icon={<FileTextOutlined />} onClick={onAiReport}>
          AI 리포트
        </Button>
        <Button icon={<CodeOutlined />} onClick={onOpenScripts}>
          스크립트
        </Button>
        <Button icon={<AuditOutlined />} onClick={onOpenAnalysis}>
          분석
        </Button>
        <Button icon={<NodeIndexOutlined />} onClick={onOpenSequence}>
          시퀀스
        </Button>
        <Button icon={<PictureOutlined />} onClick={onOpenGuide}>
          가이드
        </Button>
        <Button icon={<SettingOutlined />} onClick={onOpenSettings}>
          설정
        </Button>
        <Button
          icon={<CloudDownloadOutlined />}
          loading={checkingUpdate}
          onClick={onCheckUpdate}
          title="업데이트 확인"
        >
          업데이트
        </Button>
        <Button onClick={onOpenPalette} title="명령 팔레트 (Cmd/Ctrl+K)">
          ⌘K
        </Button>
        <Button
          icon={<BulbOutlined />}
          type={darkMode ? 'primary' : 'default'}
          onClick={() => onToggleDarkMode(!darkMode)}
        >
          {darkMode ? '라이트' : '다크'}
        </Button>
      </Space>
      {error && <Alert type="error" message={error} style={{ marginTop: 8 }} showIcon closable />}
    </div>
  );
};
