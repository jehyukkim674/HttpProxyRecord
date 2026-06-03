import { useEffect, useState } from 'react';
import { Button, Drawer, Input, List, Tag, Typography } from 'antd';
import { DeleteOutlined, SendOutlined } from '@ant-design/icons';
import { ipc } from '../services/ipc';
import type { Favorite, TrafficRecord } from '../../../shared/types';

type FavoritesDrawerProps = {
  open: boolean;
  onClose: () => void;
  onResend: (record: TrafficRecord) => void;
};

const toRecord = (favorite: Favorite): TrafficRecord => ({
  id: 0,
  sessionId: 0,
  timestamp: favorite.createdAt,
  method: favorite.method,
  url: favorite.url,
  host: new URL(favorite.url).host,
  path: `${new URL(favorite.url).pathname}${new URL(favorite.url).search}`,
  requestHeaders: {},
  requestBody: null,
  statusCode: 0,
  responseHeaders: {},
  responseBody: null,
  durationMs: 0,
  requestSize: 0,
  responseSize: 0,
  isHttps: favorite.url.startsWith('https'),
  clientIp: '',
});

export const FavoritesDrawer = ({ open, onClose, onResend }: FavoritesDrawerProps) => {
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  useEffect(() => {
    if (open) void ipc.listFavorites().then(setFavorites);
  }, [open]);

  return (
    <Drawer title="즐겨찾기" open={open} onClose={onClose} width={520}>
      <List
        dataSource={favorites}
        locale={{ emptyText: '즐겨찾기가 없어요 (상세 패널의 ⭐ 버튼으로 추가)' }}
        renderItem={(favorite) => (
          <List.Item
            actions={[
              <Button
                key="resend"
                type="text"
                size="small"
                icon={<SendOutlined />}
                onClick={() => onResend(toRecord(favorite))}
              />,
              <Button
                key="del"
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => void ipc.deleteFavorite(favorite.id).then(setFavorites)}
              />,
            ]}
          >
            <List.Item.Meta
              title={
                <span style={{ wordBreak: 'break-all' }}>
                  <Tag>{favorite.method}</Tag>
                  {favorite.url}
                </span>
              }
              description={
                <Input
                  size="small"
                  placeholder="메모"
                  defaultValue={favorite.note}
                  onBlur={(e) => void ipc.updateFavoriteNote(favorite.id, e.target.value).then(setFavorites)}
                />
              }
            />
          </List.Item>
        )}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        메모는 입력 후 포커스를 벗어나면 저장됩니다. ▶로 Composer에서 재전송할 수 있어요.
      </Typography.Paragraph>
    </Drawer>
  );
};
