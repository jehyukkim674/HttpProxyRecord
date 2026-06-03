import { useMemo, useState } from 'react';
import { Radio, Typography } from 'antd';
import { JsonTree } from './JsonTree';

type BodyViewerProps = {
  body: string | null;
  contentType: string | undefined;
};

type ViewMode = 'tree' | 'pretty' | 'raw';

/** 응답/요청 바디 뷰어 — JSON 트리/pretty + 이미지 미리보기 지원 */
export const BodyViewer = ({ body, contentType }: BodyViewerProps) => {
  const [mode, setMode] = useState<ViewMode>('tree');

  const isJson = (contentType ?? '').includes('json');
  const isImage = (contentType ?? '').toLowerCase().startsWith('image/');

  const parsed = useMemo(() => {
    if (body === null || !isJson) return { ok: false, value: null as unknown };
    try {
      return { ok: true, value: JSON.parse(body) as unknown };
    } catch {
      return { ok: false, value: null as unknown };
    }
  }, [body, isJson]);

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

  const treeAvailable = parsed.ok;
  const effectiveMode: ViewMode = mode === 'tree' && !treeAvailable ? 'pretty' : mode;

  return (
    <div>
      {isJson && (
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
      {effectiveMode === 'tree' && treeAvailable ? (
        <div
          style={{
            background: '#fafafa',
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
            background: '#fafafa',
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
          {effectiveMode === 'pretty' ? prettyBody : body}
        </pre>
      )}
    </div>
  );
};
