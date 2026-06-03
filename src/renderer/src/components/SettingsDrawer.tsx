import { useEffect, useState } from 'react';
import { Button, Divider, Drawer, Input, InputNumber, List, Space, Switch, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { ipc } from '../services/ipc';
import type { OverrideRule, ThrottleConfig } from '../../../shared/types';

type SettingsDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export const SettingsDrawer = ({ open, onClose }: SettingsDrawerProps) => {
  const [domains, setDomains] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [throttle, setThrottle] = useState<ThrottleConfig>({ enabled: false, latencyMs: 500 });
  const [rules, setRules] = useState<OverrideRule[]>([]);
  const [rulePattern, setRulePattern] = useState('');
  const [ruleStatus, setRuleStatus] = useState(200);
  const [ruleBody, setRuleBody] = useState('{"mocked":true}');
  const [breakpoints, setBreakpoints] = useState('');

  useEffect(() => {
    if (!open) return;
    void ipc.getExcludeDomains().then(setDomains);
    void ipc.getThrottle().then(setThrottle);
    void ipc.listOverrideRules().then(setRules);
    void ipc.getBreakpointPatterns().then((patterns) => setBreakpoints(patterns.join('\n')));
  }, [open]);

  const persistBreakpoints = (text: string) => {
    setBreakpoints(text);
    void ipc.setBreakpointPatterns(text.split('\n'));
  };

  const persistDomains = async (next: string[]) => {
    setDomains(await ipc.setExcludeDomains(next));
  };

  const addDomain = () => {
    const value = draft.trim();
    if (!value) return;
    void persistDomains([...domains, value]);
    setDraft('');
  };

  const persistThrottle = (next: ThrottleConfig) => {
    setThrottle(next);
    void ipc.setThrottle(next);
  };

  const persistRules = async (next: OverrideRule[]) => {
    setRules(await ipc.setOverrideRules(next));
  };

  const addRule = () => {
    if (!rulePattern.trim()) return;
    const rule: OverrideRule = {
      id: Date.now(),
      urlPattern: rulePattern.trim(),
      statusCode: ruleStatus,
      contentType: 'application/json',
      body: ruleBody,
      enabled: true,
    };
    void persistRules([...rules, rule]);
    setRulePattern('');
  };

  return (
    <Drawer title="설정" open={open} onClose={onClose} width={460}>
      <Typography.Title level={5}>캡처 제외 도메인</Typography.Title>
      <Typography.Paragraph type="secondary">
        여기 등록한 도메인은 기록하지 않습니다 (중계는 정상). 와일드카드(*) 사용 가능.
      </Typography.Paragraph>
      <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
        <Input
          placeholder="예: *.google-analytics.com"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPressEnter={addDomain}
        />
        <Button type="primary" onClick={addDomain}>
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
                onClick={() => void persistDomains(domains.filter((item) => item !== domain))}
              />,
            ]}
          >
            {domain}
          </List.Item>
        )}
      />

      <Divider />

      <Typography.Title level={5}>네트워크 throttle (#7)</Typography.Title>
      <Space>
        <Switch
          checked={throttle.enabled}
          onChange={(enabled) => persistThrottle({ ...throttle, enabled })}
        />
        <span>응답 지연</span>
        <InputNumber
          min={0}
          max={60000}
          step={100}
          value={throttle.latencyMs}
          onChange={(value) => persistThrottle({ ...throttle, latencyMs: value ?? 0 })}
          addonAfter="ms"
          style={{ width: 140 }}
        />
      </Space>

      <Divider />

      <Typography.Title level={5}>응답 오버라이드 (#4)</Typography.Title>
      <Typography.Paragraph type="secondary">
        매칭 URL에 업스트림 대신 가짜 응답을 반환합니다. 패턴은 와일드카드(*) 사용. 예: */api/users
      </Typography.Paragraph>
      <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
        <Input
          placeholder="URL 패턴 (예: */api/users)"
          value={rulePattern}
          onChange={(e) => setRulePattern(e.target.value)}
        />
        <Space>
          <InputNumber
            min={100}
            max={599}
            value={ruleStatus}
            onChange={(v) => setRuleStatus(v ?? 200)}
            addonBefore="상태"
          />
          <Button type="primary" onClick={addRule}>
            규칙 추가
          </Button>
        </Space>
        <Input.TextArea
          placeholder="응답 본문 (JSON)"
          value={ruleBody}
          onChange={(e) => setRuleBody(e.target.value)}
          rows={2}
        />
      </Space>
      <List
        size="small"
        bordered
        dataSource={rules}
        locale={{ emptyText: '오버라이드 규칙 없음' }}
        renderItem={(rule) => (
          <List.Item
            actions={[
              <Switch
                key="toggle"
                size="small"
                checked={rule.enabled}
                onChange={(enabled) =>
                  void persistRules(rules.map((r) => (r.id === rule.id ? { ...r, enabled } : r)))
                }
              />,
              <Button
                key="del"
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => void persistRules(rules.filter((r) => r.id !== rule.id))}
              />,
            ]}
          >
            <Typography.Text>
              {rule.statusCode} · {rule.urlPattern}
            </Typography.Text>
          </List.Item>
        )}
      />

      <Divider />

      <Typography.Title level={5}>브레이크포인트 (#3)</Typography.Title>
      <Typography.Paragraph type="secondary">
        매칭 URL은 전송 전 일시정지되어 통과/차단을 물어봅니다 (30초 후 자동 통과). 한 줄에 하나,
        와일드카드(*).
      </Typography.Paragraph>
      <Input.TextArea
        placeholder={'예:\n*/api/payments\n*/admin/*'}
        value={breakpoints}
        onChange={(e) => persistBreakpoints(e.target.value)}
        rows={3}
      />
    </Drawer>
  );
};
