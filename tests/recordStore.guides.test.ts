import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecordStore } from '../src/main/store/recordStore';
import type { GuideStep } from '../src/shared/types';

const step = (id: string): GuideStep => ({
  id,
  imageDataUrl: 'data:image/png;base64,AAA',
  boxes: [{ id: 'b1', x: 0.1, y: 0.1, w: 0.2, h: 0.2, number: 1, description: '설명', kind: 'box' }],
});

describe('RecordStore 가이드', () => {
  let dir: string;
  let store: RecordStore;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpr-guide-'));
    store = new RecordStore(path.join(dir, 'g.db'));
  });
  afterEach(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('save→get 라운드트립', () => {
    const saved = store.saveGuide({ title: '로그인 가이드', steps: [step('s1')] });
    expect(saved.id).toBeGreaterThan(0);
    const got = store.getGuide(saved.id);
    expect(got?.title).toBe('로그인 가이드');
    expect(got?.steps[0].boxes[0].description).toBe('설명');
  });

  it('list는 stepCount 요약을 준다', () => {
    store.saveGuide({ title: 'A', steps: [step('s1'), step('s2')] });
    expect(store.listGuides()[0].stepCount).toBe(2);
  });

  it('update는 같은 id를 유지한다', () => {
    const saved = store.saveGuide({ title: 'A', steps: [step('s1')] });
    const updated = store.saveGuide({ id: saved.id, title: 'A2', steps: [step('s1'), step('s2')] });
    expect(updated.id).toBe(saved.id);
    expect(store.getGuide(saved.id)?.title).toBe('A2');
    expect(store.getGuide(saved.id)?.steps).toHaveLength(2);
  });

  it('delete 후 조회되지 않는다', () => {
    const saved = store.saveGuide({ title: 'A', steps: [] });
    store.deleteGuide(saved.id);
    expect(store.getGuide(saved.id)).toBeNull();
    expect(store.listGuides()).toHaveLength(0);
  });
});
