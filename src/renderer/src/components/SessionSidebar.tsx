import { Button, Dropdown, List, Popconfirm, Tag, Typography } from 'antd';
import { DeleteOutlined, ExportOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import type { Session } from '../../../shared/types';

type SessionSidebarProps = {
  sessions: Session[];
  selectedSessionId: number | null;
  recordingSessionId: number | null;
  replaySessionId: number | null;
  onSelect: (sessionId: number) => void;
  onDelete: (sessionId: number) => void;
  onStartReplay: (sessionId: number) => void;
  onStopReplay: () => void;
  onExportHar: (sessionId: number) => void;
  onExportMarkdown: (sessionId: number) => void;
};

export const SessionSidebar = ({
  sessions,
  selectedSessionId,
  recordingSessionId,
  replaySessionId,
  onSelect,
  onDelete,
  onStartReplay,
  onStopReplay,
  onExportHar,
  onExportMarkdown,
}: SessionSidebarProps) => {
  return (
    <div style={{ width: 300, borderRight: '1px solid #f0f0f0', overflow: 'auto', flexShrink: 0 }}>
      <Typography.Title level={5} style={{ padding: '12px 16px', margin: 0 }}>
        세션
      </Typography.Title>
      <List
        dataSource={sessions}
        locale={{ emptyText: '녹화된 세션이 없어요' }}
        renderItem={(session) => (
          <List.Item
            onClick={() => onSelect(session.id)}
            style={{
              cursor: 'pointer',
              padding: '8px 12px',
              background: session.id === selectedSessionId ? '#e6f4ff' : undefined,
            }}
            actions={[
              <Dropdown
                key="export"
                menu={{
                  items: [
                    { key: 'har', label: 'HAR로 내보내기' },
                    { key: 'markdown', label: 'Markdown으로 내보내기' },
                  ],
                  onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    if (key === 'har') onExportHar(session.id);
                    if (key === 'markdown') onExportMarkdown(session.id);
                  },
                }}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<ExportOutlined />}
                  disabled={session.recordCount === 0}
                  onClick={(event) => event.stopPropagation()}
                />
              </Dropdown>,
              session.id === replaySessionId ? (
                <Button
                  key="stop-replay"
                  type="text"
                  size="small"
                  icon={<PauseCircleOutlined style={{ color: '#fa8c16' }} />}
                  onClick={(event) => {
                    event.stopPropagation();
                    onStopReplay();
                  }}
                />
              ) : (
                <Button
                  key="start-replay"
                  type="text"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  disabled={session.recordCount === 0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onStartReplay(session.id);
                  }}
                />
              ),
              <Popconfirm
                key="delete"
                title="이 세션을 삭제할까요?"
                onConfirm={(event) => {
                  event?.stopPropagation();
                  onDelete(session.id);
                }}
                onCancel={(event) => event?.stopPropagation()}
              >
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(event) => event.stopPropagation()}
                />
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={
                <span style={{ wordBreak: 'break-all' }}>
                  {session.name} {session.id === recordingSessionId && <Tag color="red">녹화 중</Tag>}
                  {session.id === replaySessionId && <Tag color="orange">재생 중</Tag>}
                </span>
              }
              description={`${session.recordCount}건 · ${new Date(session.createdAt).toLocaleString('ko-KR')}`}
            />
          </List.Item>
        )}
      />
    </div>
  );
};
