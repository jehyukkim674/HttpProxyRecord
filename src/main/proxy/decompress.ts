import zlib from 'node:zlib';

export type DecodedBody = { text: string; encoding: 'utf-8' | 'base64' };

/** content-type이 이미지인지 판별. */
export const isImageContentType = (contentType: string | undefined): boolean =>
  (contentType ?? '').toLowerCase().startsWith('image/');

const decompress = (buffer: Buffer, contentEncoding: string | undefined): Buffer => {
  if (!contentEncoding) return buffer;
  const encoding = contentEncoding.toLowerCase();
  try {
    if (encoding.includes('br')) return zlib.brotliDecompressSync(buffer);
    if (encoding.includes('gzip')) return zlib.gunzipSync(buffer);
    if (encoding.includes('deflate')) return zlib.inflateSync(buffer);
  } catch {
    return buffer; // 해제 실패 시 원본 유지
  }
  return buffer;
};

/**
 * 응답 본문 버퍼를 content-encoding에 따라 해제하고,
 * 이미지/바이너리는 base64로, 텍스트는 utf-8로 인코딩한다.
 */
export const decodeBody = (
  buffer: Buffer,
  contentEncoding: string | undefined,
  contentType?: string,
): DecodedBody => {
  const decompressed = decompress(buffer, contentEncoding);
  if (isImageContentType(contentType)) {
    return { text: decompressed.toString('base64'), encoding: 'base64' };
  }
  return { text: decompressed.toString('utf-8'), encoding: 'utf-8' };
};
