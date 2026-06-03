import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeBody, isImageContentType } from '../src/main/proxy/decompress';

describe('decodeBody', () => {
  it('gzip 응답을 해제한다', () => {
    const original = '{"hello":"월드"}';
    const gzipped = zlib.gzipSync(Buffer.from(original, 'utf-8'));
    const { text, encoding } = decodeBody(gzipped, 'gzip');
    expect(text).toBe(original);
    expect(encoding).toBe('utf-8');
  });

  it('brotli 응답을 해제한다', () => {
    const original = 'brotli content';
    const compressed = zlib.brotliCompressSync(Buffer.from(original, 'utf-8'));
    const { text } = decodeBody(compressed, 'br');
    expect(text).toBe(original);
  });

  it('deflate 응답을 해제한다', () => {
    const original = 'deflate content';
    const compressed = zlib.deflateSync(Buffer.from(original, 'utf-8'));
    const { text } = decodeBody(compressed, 'deflate');
    expect(text).toBe(original);
  });

  it('인코딩 없으면 그대로 utf-8', () => {
    const { text } = decodeBody(Buffer.from('plain'), undefined);
    expect(text).toBe('plain');
  });

  it('이미지 등 바이너리는 base64로 인코딩한다', () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const { text, encoding } = decodeBody(bytes, undefined, 'image/jpeg');
    expect(encoding).toBe('base64');
    expect(text).toBe(bytes.toString('base64'));
  });

  it('압축 해제 실패 시 원본 utf-8로 폴백', () => {
    const notGzip = Buffer.from('not actually gzipped');
    const { text } = decodeBody(notGzip, 'gzip');
    expect(text).toBe('not actually gzipped');
  });
});

describe('isImageContentType', () => {
  it('이미지 타입을 식별한다', () => {
    expect(isImageContentType('image/png')).toBe(true);
    expect(isImageContentType('image/jpeg; charset=binary')).toBe(true);
    expect(isImageContentType('application/json')).toBe(false);
    expect(isImageContentType(undefined)).toBe(false);
  });
});
