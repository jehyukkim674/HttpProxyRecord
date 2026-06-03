import type { AppContext } from '../appContext';
import { sendComposedRequest } from '../composer/requestSender';
import { verifySnapshot } from '../composer/snapshotVerifier';
import { CH } from '../../shared/channels';
import { handle } from './handle';
import type { ComposedRequest, TrafficRecord } from '../../shared/types';

/** 재전송(Composer), 스냅샷, 즐겨찾기. */
export const registerComposerSnapshotHandlers = (context: AppContext): void => {
  // Composer (#2 #32)
  handle(CH.composerSend, (_event, request: ComposedRequest) => sendComposedRequest(request));

  // 스냅샷 (#26)
  handle(CH.snapshotSave, (_event, record: TrafficRecord) =>
    context.recordStore.saveSnapshot({
      method: record.method,
      path: record.path,
      url: record.url,
      statusCode: record.statusCode,
      body: record.responseBody ?? '',
    }),
  );
  handle(CH.snapshotList, () => context.recordStore.listSnapshots());
  handle(CH.snapshotDelete, (_event, id: number) => {
    context.recordStore.deleteSnapshot(id);
    return context.recordStore.listSnapshots();
  });
  handle(CH.snapshotVerify, (_event, id: number) => {
    const snapshot = context.recordStore.getSnapshotById(id);
    if (!snapshot) throw new Error('스냅샷을 찾을 수 없어요.');
    return verifySnapshot(snapshot);
  });

  // 즐겨찾기 (#19)
  handle(CH.favoriteSave, (_event, input: { method: string; url: string; note: string }) =>
    context.recordStore.saveFavorite(input),
  );
  handle(CH.favoriteList, () => context.recordStore.listFavorites());
  handle(CH.favoriteUpdateNote, (_event, id: number, note: string) => {
    context.recordStore.updateFavoriteNote(id, note);
    return context.recordStore.listFavorites();
  });
  handle(CH.favoriteDelete, (_event, id: number) => {
    context.recordStore.deleteFavorite(id);
    return context.recordStore.listFavorites();
  });
};
