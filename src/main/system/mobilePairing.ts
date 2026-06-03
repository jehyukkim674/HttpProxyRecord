import os from 'node:os';
import QRCode from 'qrcode';

/** LAN에서 접근 가능한 첫 IPv4 주소를 찾는다. */
export const findLanIp = (): string | null => {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return null;
};

/**
 * 모바일 기기 프록시 페어링 정보를 QR(data URL)로 생성한다 (#31).
 * QR에는 프록시 host:port 정보를 담는다.
 */
export const buildPairingQr = async (
  proxyPort: number,
): Promise<{ ip: string | null; port: number; dataUrl: string | null; guide: string }> => {
  const ip = findLanIp();
  const guide = ip
    ? `모바일 Wi-Fi 프록시를 ${ip}:${proxyPort} 로 설정하고, http://${ip}:${proxyPort} 에서 인증서를 설치하세요.`
    : 'LAN IP를 찾지 못했어요. 유선/무선 네트워크 연결을 확인하세요.';
  if (!ip) return { ip: null, port: proxyPort, dataUrl: null, guide };

  const payload = `proxy=${ip}:${proxyPort}`;
  const dataUrl = await QRCode.toDataURL(payload, { width: 240 });
  return { ip, port: proxyPort, dataUrl, guide };
};
