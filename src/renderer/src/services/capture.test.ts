// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureSource } from './capture';

const track = { stop: vi.fn() };
const stream = { getTracks: () => [track] };
const getUserMedia = vi.fn();

class FakeVideo {
  videoWidth = 640;
  videoHeight = 480;
  srcObject: unknown = null;
  play = vi.fn().mockResolvedValue(undefined);
  set onloadedmetadata(cb: () => void) {
    queueMicrotask(cb);
  }
}

const canvasStub = {
  width: 0,
  height: 0,
  getContext: vi.fn(() => ({ drawImage: vi.fn() })),
  toDataURL: vi.fn(() => 'data:image/png;base64,SHOT'),
};

describe('captureSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMedia.mockResolvedValue(stream);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
      tag === 'video' ? new FakeVideo() : canvasStub) as typeof document.createElement);
  });

  afterEach(() => vi.restoreAllMocks());

  it('소스 id로 화면을 캡처해 PNG dataURL을 반환하고 트랙을 정리한다', async () => {
    const result = await captureSource('screen:1');

    expect(result).toBe('data:image/png;base64,SHOT');
    const constraints = getUserMedia.mock.calls[0][0];
    expect(constraints.video.mandatory.chromeMediaSourceId).toBe('screen:1');
    expect(canvasStub.toDataURL).toHaveBeenCalledWith('image/png');
    expect(track.stop).toHaveBeenCalled(); // finally에서 정리
  });

  it('캡처 실패해도 스트림 트랙을 정리한다(finally)', async () => {
    canvasStub.toDataURL.mockImplementationOnce(() => {
      throw new Error('toDataURL 실패');
    });
    await expect(captureSource('screen:1')).rejects.toThrow('toDataURL 실패');
    expect(track.stop).toHaveBeenCalled();
  });
});
