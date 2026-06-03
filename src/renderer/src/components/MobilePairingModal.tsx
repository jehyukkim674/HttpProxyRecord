import { useEffect, useState } from 'react';
import { Alert, Modal, Typography } from 'antd';
import { ipc } from '../services/ipc';

type PairingInfo = { ip: string | null; port: number; dataUrl: string | null; guide: string };

type MobilePairingModalProps = {
  open: boolean;
  onClose: () => void;
};

export const MobilePairingModal = ({ open, onClose }: MobilePairingModalProps) => {
  const [info, setInfo] = useState<PairingInfo | null>(null);

  useEffect(() => {
    if (open) void ipc.getPairingQr().then(setInfo);
    else setInfo(null);
  }, [open]);

  return (
    <Modal title="모바일 기기 페어링" open={open} onCancel={onClose} footer={null}>
      {info ? (
        <div style={{ textAlign: 'center' }}>
          {info.dataUrl ? (
            <img src={info.dataUrl} alt="페어링 QR" style={{ width: 240, height: 240 }} />
          ) : (
            <Alert type="warning" message="LAN IP를 찾지 못했어요" />
          )}
          <Typography.Paragraph style={{ marginTop: 12 }}>{info.guide}</Typography.Paragraph>
          <Typography.Paragraph type="secondary">
            iOS: 설정 → Wi-Fi → 프록시 수동 / Android: Wi-Fi 고급 → 프록시 수동
          </Typography.Paragraph>
        </div>
      ) : (
        <Typography.Text type="secondary">불러오는 중…</Typography.Text>
      )}
    </Modal>
  );
};
