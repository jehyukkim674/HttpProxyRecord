import { beforeEach, describe, expect, it, vi } from 'vitest';

const ipcMainMock = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: ipcMainMock }));

import { handle } from '../src/main/ipc/handle';

type Wrapped = (event: unknown, ...args: unknown[]) => Promise<unknown>;
const lastWrapped = (): Wrapped => ipcMainMock.handle.mock.calls.at(-1)![1] as Wrapped;

describe('handle (ipcMain.handle 래퍼)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('채널명과 래핑된 핸들러를 ipcMain.handle에 등록한다', () => {
    handle('ch:test', () => 1);
    expect(ipcMainMock.handle).toHaveBeenCalledWith('ch:test', expect.any(Function));
  });

  it('성공 시 핸들러 반환값을 그대로 돌려준다 (인자 전달 포함)', async () => {
    handle('ch:add', (_event, a: number, b: number) => a + b);
    await expect(lastWrapped()({}, 2, 3)).resolves.toBe(5);
  });

  it('핸들러가 throw하면 로깅 후 다시 throw한다', async () => {
    handle('ch:boom', () => {
      throw new Error('boom');
    });
    await expect(lastWrapped()({})).rejects.toThrow('boom');
  });

  it('핸들러가 reject해도 전달한다', async () => {
    handle('ch:reject', async () => {
      throw new Error('async-fail');
    });
    await expect(lastWrapped()({})).rejects.toThrow('async-fail');
  });
});
