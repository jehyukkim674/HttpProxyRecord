import { Suspense, lazy, useEffect, useState } from 'react';
import { Button, Drawer, Empty, Input, List, Spin, Switch, Typography, message } from 'antd';
import { useScripts } from '../hooks/useScripts';
import type { InterceptScript } from '../../../shared/types';

const ScriptEditor = lazy(() => import('./ScriptEditor'));

const STARTER = `// onRequest(req): 요청 변조 / return {status,body} 가짜응답 / return {block:true} 차단
// onResponse(req, res): 응답 변조
function onRequest(req) {
  // req.headers['authorization'] = 'Bearer test';
}
function onResponse(req, res) {
  // const j = JSON.parse(res.body); j.flag = true; res.body = JSON.stringify(j);
}`;

type Props = { open: boolean; onClose: () => void };

export const ScriptsDrawer = ({ open, onClose }: Props) => {
  const { scripts, logs, save, remove, toggle } = useScripts();
  const [selected, setSelected] = useState<InterceptScript | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState(STARTER);
  const [messageApi, holder] = message.useMessage();

  useEffect(() => {
    if (selected) {
      setName(selected.name);
      setCode(selected.code);
    }
  }, [selected]);

  const startNew = () => {
    setSelected(null);
    setName('');
    setCode(STARTER);
  };

  const onSave = async () => {
    if (!name.trim()) {
      void messageApi.warning('이름을 입력하세요');
      return;
    }
    await save({ id: selected?.id, name: name.trim(), code, enabled: selected?.enabled ?? true });
    void messageApi.success('저장했어요');
  };

  return (
    <Drawer title="스크립트 인터셉션" open={open} onClose={onClose} width={780}>
      {holder}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 220, flexShrink: 0 }}>
          <Button block type="dashed" onClick={startNew} style={{ marginBottom: 8 }}>
            + 새 스크립트
          </Button>
          <List
            size="small"
            bordered
            dataSource={scripts}
            locale={{ emptyText: <Empty description="스크립트 없음" /> }}
            renderItem={(item) => (
              <List.Item
                onClick={() => setSelected(item)}
                style={{ cursor: 'pointer', background: selected?.id === item.id ? '#f0f5ff' : undefined }}
                actions={[
                  <Switch
                    key="t"
                    size="small"
                    checked={item.enabled}
                    onClick={(_checked, event) => event.stopPropagation()}
                    onChange={(value) => void toggle(item.id, value)}
                  />,
                  <Button
                    key="d"
                    size="small"
                    danger
                    type="text"
                    onClick={(event) => {
                      event.stopPropagation();
                      void remove(item.id);
                    }}
                  >
                    삭제
                  </Button>,
                ]}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </span>
              </List.Item>
            )}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="스크립트 이름"
            style={{ marginBottom: 8 }}
          />
          <Suspense fallback={<Spin />}>
            <ScriptEditor value={code} onChange={setCode} />
          </Suspense>
          <Button type="primary" onClick={() => void onSave()} style={{ marginTop: 8 }}>
            저장
          </Button>

          <Typography.Title level={5} style={{ marginTop: 16 }}>
            실행 로그
          </Typography.Title>
          <div
            style={{
              height: 120,
              overflow: 'auto',
              background: '#1e1e1e',
              color: '#ddd',
              padding: 8,
              fontFamily: 'monospace',
              fontSize: 12,
              borderRadius: 4,
            }}
          >
            {logs.length === 0 ? (
              <Typography.Text type="secondary">로그 없음</Typography.Text>
            ) : (
              logs.map((entry, index) => (
                <div key={index}>
                  [{entry.level}] {entry.message}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
};
