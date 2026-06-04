import { useMemo, useState } from 'react';
import { Button, Radio, Space, Tag, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { JsonTree } from './JsonTree';
import { RENDER_LIMIT, bodyRenderPolicy, formatBytes } from '../services/bodyRenderPolicy';

type BodyViewerProps = {
  body: string | null;
  contentType: string | undefined;
};

type ViewMode = 'tree' | 'pretty' | 'raw';

/** 응답/요청 바디 뷰어 — JSON 트리/pretty + 이미지 미리보기 + 대용량 안전 표기 */
export const BodyViewer = ({ body, contentType }: BodyViewerProps) => {
  const [mode, setMode] = useState<ViewMode>('tree');
  const [forceFull, setForceFull] = useState(false);

  const isJson = (contentType ?? '').includes('json');
  const isImage = (contentType ?? '').toLowerCase().startsWith('image/');

  // 대용량 본문은 파싱·전체 렌더를 막아 프리징을 방지한다.
  const policy = useMemo(() => bodyRenderPolicy(body?.length ?? 0, forceFull), [body, forceFull]);

  const parsed = useMemo(() => {
    if (body === null || !isJson || !policy.allowParse) return { ok: false, value: null as unknown };
    try {
      return { ok: true, value: JSON.parse(body) as unknown };
    } catch {
      return { ok: false, value: null as unknown };
    }
  }, [body, isJson, policy.allowParse]);

  const prettyBody = useMemo(() => {
    if (body === null) return null;
    if (!parsed.ok) return body;
    return JSON.stringify(parsed.value, null, 2);
  }, [body, parsed]);

  if (body === null || body.length === 0) {
    return <Typography.Text type="secondary">바디 없음</Typography.Text>;
  }

  // 이미지: 캡처 시 base64로 저장되므로 data URL로 렌더
  if (isImage) {
    return (
      <img
        src={`data:${contentType};base64,${body}`}
        alt="응답 이미지"
        style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 4 }}
      />
    );
  }

  const handleSave = () => {
    const blob = new Blob([body], { type: contentType || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `body-${Date.now()}.${isJson ? 'json' : 'txt'}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const treeAvailable = parsed.ok;
  const effectiveMode: ViewMode = mode === 'tree' && !treeAvailable ? 'pretty' : mode;
  const rawText = policy.truncated ? body.slice(0, policy.renderLength) + '\n…(잘림)' : body;

  return (
    <div>
      {policy.truncated && (
        <Space style={{ marginBottom: 8 }} wrap>
          <Tag color="warning">
            {formatBytes(body.length)} — 앞 {formatBytes(RENDER_LIMIT)}만 표시 (트리/Pretty 비활성)
          </Tag>
          <Button size="small" onClick={() => setForceFull(true)}>
            전체 보기
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={handleSave}>
            원본 저장
          </Button>
        </Space>
      )}
      {isJson && !policy.truncated && (
        <Radio.Group
          size="small"
          value={effectiveMode}
          onChange={(event) => setMode(event.target.value as ViewMode)}
          style={{ marginBottom: 8 }}
        >
          {treeAvailable && <Radio.Button value="tree">트리</Radio.Button>}
          <Radio.Button value="pretty">Pretty</Radio.Button>
          <Radio.Button value="raw">Raw</Radio.Button>
        </Radio.Group>
      )}
      {!policy.truncated && effectiveMode === 'tree' && treeAvailable ? (
        <div
          style={{
            background: 'var(--app-surface)',
            padding: 12,
            borderRadius: 4,
            maxHeight: 400,
            overflow: 'auto',
          }}
        >
          <JsonTree data={parsed.value} />
        </div>
      ) : (
        <pre
          style={{
            background: 'var(--app-surface)',
            padding: 12,
            borderRadius: 4,
            maxHeight: 400,
            overflow: 'auto',
            fontSize: 12,
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {policy.truncated ? rawText : effectiveMode === 'pretty' ? prettyBody : body}
        </pre>
      )}
    </div>
  );
};
