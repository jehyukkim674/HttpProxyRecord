import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import { extractByDotPath, substituteVariables } from '../../../shared/composer';
import { ipc } from '../services/ipc';
import { BodyViewer } from './BodyViewer';
import type { ComposedRequest, ComposedResponse, TrafficRecord } from '../../../shared/types';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

type HeaderRow = { key: string; name: string; value: string };

type ComposerModalProps = {
  open: boolean;
  initial: TrafficRecord | null;
  variables: Record<string, string>;
  onSetVariable: (name: string, value: string) => void;
  onRemoveVariable: (name: string) => void;
  onClose: () => void;
};

const toHeaderRows = (headers: Record<string, string>): HeaderRow[] =>
  Object.entries(headers).map(([name, value], index) => ({ key: `${index}-${name}`, name, value }));

const fromHeaderRows = (rows: HeaderRow[]): Record<string, string> => {
  const headers: Record<string, string> = {};
  for (const row of rows) {
    if (row.name.trim()) headers[row.name.trim()] = row.value;
  }
  return headers;
};

export const ComposerModal = ({
  open,
  initial,
  variables,
  onSetVariable,
  onRemoveVariable,
  onClose,
}: ComposerModalProps) => {
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([]);
  const [body, setBody] = useState('');
  const [response, setResponse] = useState<ComposedResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [extractName, setExtractName] = useState('');
  const [extractPath, setExtractPath] = useState('');

  useEffect(() => {
    if (!open) return;
    setMethod(initial?.method ?? 'GET');
    setUrl(initial?.url ?? '');
    setHeaderRows(toHeaderRows(initial?.requestHeaders ?? {}));
    setBody(initial?.requestBody ?? '');
    setResponse(null);
    setExtractName('');
    setExtractPath('');
  }, [open, initial]);

  const variableEntries = useMemo(() => Object.entries(variables), [variables]);

  const send = async () => {
    setSending(true);
    setResponse(null);
    try {
      const request: ComposedRequest = {
        method,
        url: substituteVariables(url, variables),
        headers: Object.fromEntries(
          Object.entries(fromHeaderRows(headerRows)).map(([name, value]) => [
            name,
            substituteVariables(value, variables),
          ]),
        ),
        body: body.length > 0 ? substituteVariables(body, variables) : null,
      };
      setResponse(await ipc.composerSend(request));
    } catch (caught) {
      void message.error(caught instanceof Error ? caught.message : '전송 실패');
    } finally {
      setSending(false);
    }
  };

  const runExtract = () => {
    if (!response || !extractName.trim() || !extractPath.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      void message.warning('응답이 JSON이 아니에요');
      return;
    }
    const value = extractByDotPath(parsed, extractPath.trim());
    if (value === null) {
      void message.warning('값을 찾지 못했어요');
      return;
    }
    onSetVariable(extractName.trim(), value);
    void message.success(`변수 ${extractName.trim()} = ${value}`);
    setExtractName('');
    setExtractPath('');
  };

  return (
    <Modal title="요청 작성 / 재전송" open={open} onCancel={onClose} width={760} footer={null}>
      <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
        <Select
          value={method}
          onChange={setMethod}
          options={METHODS.map((item) => ({ value: item, label: item }))}
          style={{ width: 110 }}
        />
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://api.example.com/path"
        />
        <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={() => void send()}>
          전송
        </Button>
      </Space.Compact>

      {variableEntries.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {variableEntries.map(([name, value]) => (
            <Tag key={name} closable onClose={() => onRemoveVariable(name)} style={{ marginBottom: 4 }}>
              {`{{${name}}}`} = {value.length > 20 ? `${value.slice(0, 20)}…` : value}
            </Tag>
          ))}
        </div>
      )}

      <Typography.Text type="secondary">헤더</Typography.Text>
      <Table<HeaderRow>
        rowKey="key"
        size="small"
        pagination={false}
        dataSource={headerRows}
        style={{ marginBottom: 8 }}
        columns={[
          {
            title: '이름',
            dataIndex: 'name',
            render: (_, row) => (
              <Input
                value={row.name}
                onChange={(event) =>
                  setHeaderRows((rows) =>
                    rows.map((item) => (item.key === row.key ? { ...item, name: event.target.value } : item)),
                  )
                }
              />
            ),
          },
          {
            title: '값',
            dataIndex: 'value',
            render: (_, row) => (
              <Input
                value={row.value}
                onChange={(event) =>
                  setHeaderRows((rows) =>
                    rows.map((item) =>
                      item.key === row.key ? { ...item, value: event.target.value } : item,
                    ),
                  )
                }
              />
            ),
          },
          {
            title: '',
            width: 40,
            render: (_, row) => (
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => setHeaderRows((rows) => rows.filter((item) => item.key !== row.key))}
              />
            ),
          },
        ]}
      />
      <Button
        size="small"
        icon={<PlusOutlined />}
        onClick={() => setHeaderRows((rows) => [...rows, { key: `new-${Date.now()}`, name: '', value: '' }])}
        style={{ marginBottom: 8 }}
      >
        헤더 추가
      </Button>

      <Typography.Text type="secondary">바디</Typography.Text>
      <Input.TextArea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={4}
        style={{ marginBottom: 12 }}
      />

      {response && (
        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
          <Typography.Title level={5}>
            응답 <Tag color={response.statusCode < 400 ? 'green' : 'red'}>{response.statusCode}</Tag>
            <Typography.Text type="secondary">{response.durationMs}ms</Typography.Text>
          </Typography.Title>
          <BodyViewer body={response.body} contentType={response.headers['content-type']} />
          <Space.Compact style={{ width: '100%', marginTop: 8 }}>
            <Input
              placeholder="변수명 (예: token)"
              value={extractName}
              onChange={(event) => setExtractName(event.target.value)}
            />
            <Input
              placeholder="dot-path (예: data.token)"
              value={extractPath}
              onChange={(event) => setExtractPath(event.target.value)}
            />
            <Button onClick={runExtract}>추출</Button>
          </Space.Compact>
        </div>
      )}
    </Modal>
  );
};
