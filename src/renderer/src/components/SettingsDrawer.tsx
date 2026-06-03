import { useEffect, useState } from 'react';
import { Button, Drawer, Input, List, Space, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { ipc } from '../services/ipc';

type SettingsDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export const SettingsDrawer = ({ open, onClose }: SettingsDrawerProps) => {
  const [domains, setDomains] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (open) void ipc.getExcludeDomains().then(setDomains);
  }, [open]);

  const persist = async (next: string[]) => {
    setDomains(await ipc.setExcludeDomains(next));
  };

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    void persist([...domains, value]);
    setDraft('');
  };

  return (
    <Drawer title="설정" open={open} onClose={onClose} width={420}>
      <Typography.Title level={5}>캡처 제외 도메인</Typography.Title>
      <Typography.Paragraph type="secondary">
        여기 등록한 도메인은 기록하지 않습니다 (중계는 정상). 와일드카드(*) 사용 가능. 예:
        *.google-analytics.com
      </Typography.Paragraph>
      <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
        <Input
          placeholder="예: *.google-analytics.com"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPressEnter={add}
        />
        <Button type="primary" onClick={add}>
          추가
        </Button>
      </Space.Compact>
      <List
        size="small"
        bordered
        dataSource={domains}
        locale={{ emptyText: '제외 도메인 없음' }}
        renderItem={(domain) => (
          <List.Item
            actions={[
              <Button
                key="del"
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => void persist(domains.filter((item) => item !== domain))}
              />,
            ]}
          >
            {domain}
          </List.Item>
        )}
      />
    </Drawer>
  );
};
