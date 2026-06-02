import { Button, Descriptions, Empty, Table, Tabs, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import type { TrafficRecord } from '../../../shared/types';
import { BodyViewer } from './BodyViewer';

type TrafficDetailProps = {
  record: TrafficRecord | null;
  onCopyCurl: (recordId: number) => void;
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

export const TrafficDetail = ({ record, onCopyCurl }: TrafficDetailProps) => {
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
      <Button
        size="small"
        icon={<CopyOutlined />}
        onClick={() => onCopyCurl(record.id)}
        style={{ marginBottom: 12 }}
      >
        curl 복사
      </Button>
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
        ]}
      />
    </div>
  );
};
