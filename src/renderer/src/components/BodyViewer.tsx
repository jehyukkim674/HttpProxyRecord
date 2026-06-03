import { useMemo, useState } from 'react';
import { Radio, Typography } from 'antd';

type BodyViewerProps = {
  body: string | null;
  contentType: string | undefined;
};

/** 응답/요청 바디 뷰어 — JSON pretty + 이미지 미리보기 지원 */
export const BodyViewer = ({ body, contentType }: BodyViewerProps) => {
  const [mode, setMode] = useState<'pretty' | 'raw'>('pretty');

  const isJson = (contentType ?? '').includes('json');
  const isImage = (contentType ?? '').toLowerCase().startsWith('image/');

  const prettyBody = useMemo(() => {
    if (body === null) return null;
    if (!isJson) return body;
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }, [body, isJson]);

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

  return (
    <div>
      {isJson && (
        <Radio.Group
          size="small"
          value={mode}
          onChange={(event) => setMode(event.target.value as 'pretty' | 'raw')}
          style={{ marginBottom: 8 }}
        >
          <Radio.Button value="pretty">Pretty</Radio.Button>
          <Radio.Button value="raw">Raw</Radio.Button>
        </Radio.Group>
      )}
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
        {mode === 'pretty' ? prettyBody : body}
      </pre>
    </div>
  );
};
