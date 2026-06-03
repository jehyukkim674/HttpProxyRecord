import { useEffect, useMemo, useState } from 'react';
import { Input, List, Modal } from 'antd';

export type Command = { id: string; label: string; keywords?: string; run: () => void };

type Props = { open: boolean; commands: Command[]; onClose: () => void };

/** Cmd/Ctrl+K 커맨드 팔레트 — 모든 동작을 키보드로 검색·실행. */
export const CommandPalette = ({ open, commands, onClose }: Props) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.keywords ?? ''}`.toLowerCase().includes(q),
    );
  }, [query, commands]);

  const runCommand = (command: Command) => {
    onClose();
    command.run();
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={560}
      style={{ top: 80 }}
      styles={{ body: { padding: 0 } }}
    >
      <Input
        autoFocus
        size="large"
        variant="borderless"
        placeholder="명령 검색… (Enter 실행 · Esc 닫기)"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onPressEnter={() => filtered[0] && runCommand(filtered[0])}
      />
      <List
        size="small"
        dataSource={filtered.slice(0, 30)}
        style={{ maxHeight: 360, overflow: 'auto', borderTop: '1px solid #f0f0f0' }}
        renderItem={(command) => (
          <List.Item style={{ cursor: 'pointer', padding: '8px 16px' }} onClick={() => runCommand(command)}>
            {command.label}
          </List.Item>
        )}
      />
    </Modal>
  );
};
