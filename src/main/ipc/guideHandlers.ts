import { desktopCapturer, dialog } from 'electron';
import fs from 'node:fs';
import type { AppContext } from '../appContext';
import { CH } from '../../shared/channels';
import { handle } from './handle';
import type { GuideStep } from '../../shared/types';

/** 캡처 가이드 — 화면 소스 목록, 가이드 CRUD, HTML 내보내기. */
export const registerGuideHandlers = (context: AppContext): void => {
  handle(CH.captureListSources, async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 200 },
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
    }));
  });

  handle(CH.guideList, () => context.recordStore.listGuides());
  handle(CH.guideGet, (_event, id: number) => context.recordStore.getGuide(id));
  handle(CH.guideSave, (_event, input: { id?: number; title: string; steps: GuideStep[] }) =>
    context.recordStore.saveGuide(input),
  );
  handle(CH.guideDelete, (_event, id: number) => {
    context.recordStore.deleteGuide(id);
    return context.recordStore.listGuides();
  });

  handle(CH.guideExportHtml, async (_event, title: string, html: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: `${title || 'guide'}.html`,
      filters: [{ name: 'HTML', extensions: ['html'] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    fs.writeFileSync(result.filePath, html);
    return { saved: true, path: result.filePath };
  });
};
