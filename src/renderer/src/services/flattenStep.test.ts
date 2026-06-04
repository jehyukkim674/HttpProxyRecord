// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flattenStep } from './flattenStep';
import type { GuideStep } from '../../../shared/types';

let imageShouldError = false;
let ctxValue: Record<string, unknown> | null;

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 200;
  naturalHeight = 100;
  set src(_v: string) {
    queueMicrotask(() => (imageShouldError ? this.onerror?.() : this.onload?.()));
  }
}

const ctxStub = (): Record<string, unknown> => ({
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  strokeRect: vi.fn(),
  fillText: vi.fn(),
  filter: '',
  lineWidth: 0,
  font: '',
  textAlign: '',
  textBaseline: '',
  strokeStyle: '',
  fillStyle: '',
});

const step = (): GuideStep => ({
  id: 's1',
  imageDataUrl: 'data:image/png;base64,IN',
  boxes: [
    { id: 'b1', x: 0.1, y: 0.1, w: 0.2, h: 0.2, number: 1, description: '버튼', kind: 'box' },
    { id: 'b2', x: 0.5, y: 0.5, w: 0.1, h: 0.1, number: 2, description: '가림', kind: 'blur' },
  ],
});

describe('flattenStep', () => {
  beforeEach(() => {
    imageShouldError = false;
    ctxValue = ctxStub();
    vi.stubGlobal('Image', FakeImage);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ctxValue,
          toDataURL: () => 'data:image/png;base64,OUT',
        } as unknown as HTMLCanvasElement;
      }
      return {} as HTMLElement;
    }) as typeof document.createElement);
  });

  afterEach(() => vi.restoreAllMocks());

  it('박스/블러를 그려 평탄화한 dataURL을 반환한다', async () => {
    const result = await flattenStep(step());
    expect(result).toBe('data:image/png;base64,OUT');
    expect(ctxValue!.strokeRect as ReturnType<typeof vi.fn>).toHaveBeenCalled(); // box
    expect(ctxValue!.drawImage as ReturnType<typeof vi.fn>).toHaveBeenCalled(); // 원본 + blur
  });

  it('2D 컨텍스트가 없으면 원본 dataURL을 그대로 반환한다', async () => {
    ctxValue = null;
    const result = await flattenStep(step());
    expect(result).toBe('data:image/png;base64,IN');
  });

  it('이미지 로드 실패 시 reject', async () => {
    imageShouldError = true;
    await expect(flattenStep(step())).rejects.toThrow('이미지 로드 실패');
  });
});
