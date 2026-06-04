import { useState } from 'react';

type Props = { data: unknown; name?: string; depth?: number };

const isExpandable = (value: unknown): value is Record<string, unknown> | unknown[] =>
  typeof value === 'object' && value !== null;

const leafColor = (value: unknown): string => {
  if (typeof value === 'string') return 'var(--json-string)';
  if (typeof value === 'number') return 'var(--json-number)';
  if (typeof value === 'boolean') return 'var(--json-boolean)';
  return 'var(--app-muted)';
};

const formatLeaf = (value: unknown): string =>
  typeof value === 'string' ? `"${value}"` : value === null ? 'null' : String(value);

/** 의존성 없는 재귀 JSON 트리 뷰어. 기본 2레벨까지 펼치고 클릭으로 접기/펼치기. */
export const JsonTree = ({ data, name, depth = 0 }: Props) => {
  const [open, setOpen] = useState(depth < 2);
  const indent = { paddingLeft: depth * 14 };

  if (!isExpandable(data)) {
    return (
      <div style={{ ...indent, fontFamily: 'monospace', fontSize: 12 }}>
        {name !== undefined && <span style={{ color: 'var(--json-key)' }}>{name}: </span>}
        <span style={{ color: leafColor(data) }}>{formatLeaf(data)}</span>
      </div>
    );
  }

  const entries: Array<readonly [string, unknown]> = Array.isArray(data)
    ? data.map((value, index) => [String(index), value] as const)
    : Object.entries(data);
  const [openBracket, closeBracket] = Array.isArray(data) ? ['[', ']'] : ['{', '}'];

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
      <div style={{ ...indent, cursor: 'pointer' }} onClick={() => setOpen((value) => !value)}>
        <span style={{ color: 'var(--app-muted)' }}>{open ? '▼' : '▶'} </span>
        {name !== undefined && <span style={{ color: 'var(--json-key)' }}>{name}: </span>}
        <span style={{ color: 'var(--app-muted)' }}>
          {openBracket}
          {!open && `…${entries.length}${closeBracket}`}
        </span>
      </div>
      {open && (
        <>
          {entries.map(([key, value]) => (
            <JsonTree key={key} name={key} data={value} depth={depth + 1} />
          ))}
          <div style={{ ...indent, color: 'var(--app-muted)' }}>{closeBracket}</div>
        </>
      )}
    </div>
  );
};
