import { Button, Descriptions, Empty, Space, Table, Tabs, Tag, Typography } from 'antd';
import { CameraOutlined, CopyOutlined, SendOutlined } from '@ant-design/icons';
import type { TrafficRecord } from '../../../shared/types';
import { decodeJwt, findBearerToken } from '../../../shared/jwt';
import { parseCookieHeader } from '../../../shared/cookies';
import { BodyViewer } from './BodyViewer';

const SecurityTab = ({ record }: { record: TrafficRecord }) => {
  const token = findBearerToken(record.requestHeaders);
  const decoded = token ? decodeJwt(token) : null;
  const cookies = parseCookieHeader(record.requestHeaders['cookie']);

  return (
    <>
      <Typography.Title level={5}>JWT (Authorization)</Typography.Title>
      {decoded ? (
        <>
          {decoded.expiresAt && (
            <Tag color={new Date(decoded.expiresAt) < new Date() ? 'red' : 'green'}>
              만료: {new Date(decoded.expiresAt).toLocaleString('ko-KR')}
            </Tag>
          )}
          <Typography.Text type="secondary">payload</Typography.Text>
          <pre style={{ background: '#fafafa', padding: 8, borderRadius: 4, fontSize: 12, overflow: 'auto' }}>
            {JSON.stringify(decoded.payload, null, 2)}
          </pre>
        </>
      ) : (
        <Typography.Text type="secondary">Bearer JWT 없음</Typography.Text>
      )}
      <Typography.Title level={5} style={{ marginTop: 16 }}>
        쿠키 ({cookies.length})
      </Typography.Title>
      {cookies.length > 0 ? (
        <Table
          rowKey={(row) => row.name}
          dataSource={cookies}
          columns={[
            { title: '이름', dataIndex: 'name', width: 180 },
            { title: '값', dataIndex: 'value', ellipsis: true },
          ]}
          size="small"
          pagination={false}
        />
      ) : (
        <Typography.Text type="secondary">쿠키 없음</Typography.Text>
      )}
    </>
  );
};

type TrafficDetailProps = {
  record: TrafficRecord | null;
  onCopyCurl: (recordId: number) => void;
  onResend: (record: TrafficRecord) => void;
  onSaveSnapshot: (record: TrafficRecord) => void;
};

const HeaderTable = ({ headers }: { headers: Record<string, string> }) => (
  <Table
    rowKey={(row) => row.name}
    dataSource={Object.entries(headers).map(([name, value]) => ({ name, value }))}
    columns={[
      { title: '이름', dataIndex: 'name', width: 200 },
      { title: '값', dataIndex: 'value', ellipsis: true },
    ]}
    size="small"
    pagination={false}
  />
);

export const TrafficDetail = ({ record, onCopyCurl, onResend, onSaveSnapshot }: TrafficDetailProps) => {
  if (!record) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Empty description="트래픽을 선택하세요" />
      </div>
    );
  }

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
      <Typography.Title level={5} style={{ wordBreak: 'break-all', marginTop: 0 }}>
        {record.method} {record.url}
      </Typography.Title>
      <Space style={{ marginBottom: 12 }}>
        <Button size="small" icon={<CopyOutlined />} onClick={() => onCopyCurl(record.id)}>
          curl 복사
        </Button>
        <Button size="small" icon={<SendOutlined />} onClick={() => onResend(record)}>
          재전송
        </Button>
        <Button size="small" icon={<CameraOutlined />} onClick={() => onSaveSnapshot(record)}>
          스냅샷 저장
        </Button>
      </Space>
      <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="상태">{record.statusCode}</Descriptions.Item>
        <Descriptions.Item label="소요시간">{record.durationMs}ms</Descriptions.Item>
        <Descriptions.Item label="프로토콜">{record.isHttps ? 'HTTPS' : 'HTTP'}</Descriptions.Item>
        <Descriptions.Item label="클라이언트">{record.clientIp}</Descriptions.Item>
      </Descriptions>

      <Tabs
        items={[
          {
            key: 'response',
            label: '응답',
            children: (
              <>
                <Typography.Title level={5}>헤더</Typography.Title>
                <HeaderTable headers={record.responseHeaders} />
                <Typography.Title level={5} style={{ marginTop: 16 }}>
                  바디
                </Typography.Title>
                <BodyViewer body={record.responseBody} contentType={record.responseHeaders['content-type']} />
              </>
            ),
          },
          {
            key: 'request',
            label: '요청',
            children: (
              <>
                <Typography.Title level={5}>헤더</Typography.Title>
                <HeaderTable headers={record.requestHeaders} />
                <Typography.Title level={5} style={{ marginTop: 16 }}>
                  바디
                </Typography.Title>
                <BodyViewer body={record.requestBody} contentType={record.requestHeaders['content-type']} />
              </>
            ),
          },
          {
            key: 'security',
            label: 'JWT/쿠키',
            children: <SecurityTab record={record} />,
          },
        ]}
      />
    </div>
  );
};
