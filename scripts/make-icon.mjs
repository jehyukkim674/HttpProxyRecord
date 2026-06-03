// 외부 이미지 라이브러리 없이 512x512 앱 아이콘 PNG를 생성한다.
// 디자인: 둥근 사각 다크 배경 + 빨간 레코드 점 + 흰 트래픽 막대(워터폴 모티프).
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 512;
const buffer = Buffer.alloc(SIZE * SIZE * 4); // RGBA

const setPixel = (x, y, [r, g, b, a]) => {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  buffer[i] = r;
  buffer[i + 1] = g;
  buffer[i + 2] = b;
  buffer[i + 3] = a;
};

const fillRoundedRect = (x0, y0, x1, y1, radius, color) => {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const dx = Math.max(x0 + radius - x, 0, x - (x1 - 1 - radius));
      const dy = Math.max(y0 + radius - y, 0, y - (y1 - 1 - radius));
      if (dx * dx + dy * dy <= radius * radius) setPixel(x, y, color);
    }
  }
};

const fillCircle = (cx, cy, r, color) => {
  for (let y = cy - r; y <= cy + r; y += 1) {
    for (let x = cx - r; x <= cx + r; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) setPixel(x, y, color);
    }
  }
};

// 배경 (투명) → 둥근 다크 네이비 카드
fillRoundedRect(24, 24, SIZE - 24, SIZE - 24, 96, [31, 41, 55, 255]);

// 트래픽 막대 (워터폴 모티프) — 흰색, 길이 다양
const barColor = [236, 240, 243, 255];
const bars = [
  [120, 150, 300],
  [120, 220, 230],
  [120, 290, 360],
];
for (const [x, y, w] of bars) {
  fillRoundedRect(x, y, x + w, y + 34, 17, barColor);
}

// 레코드 점 (빨강)
fillCircle(370, 167, 40, [239, 68, 68, 255]);

// PNG 인코딩
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
// 10,11,12 = 0 (compression/filter/interlace)

// 스캔라인마다 필터 바이트(0) 추가
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE * 4 + 1)] = 0;
  buffer.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const idat = zlib.deflateSync(raw);

const png = Buffer.concat([
  signature,
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icon.png'), png);
console.log(`build/icon.png 생성 완료 (${png.length} bytes, ${SIZE}x${SIZE})`);
