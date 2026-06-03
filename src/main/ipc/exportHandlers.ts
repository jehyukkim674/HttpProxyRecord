import { clipboard, dialog } from 'electron';
import fs from 'node:fs';
import type { AppContext } from '../appContext';
import { toCurl, toHar, toMarkdown } from '../export/exporter';
import { toOpenApi, toPostmanCollection } from '../export/postmanOpenApi';
import { parseHar } from '../export/harImport';
import { toK6Script } from '../../shared/loadtest';
import { CH } from '../../shared/channels';
import { handle } from './handle';
import type { CapturedTraffic, Session, TrafficRecord } from '../../shared/types';

/** 세션 단위 파일 저장 다이얼로그 공통 처리. */
const saveToFile = async (
  context: AppContext,
  sessionId: number,
  defaultName: string,
  filter: { name: string; extensions: string[] },
  serialize: (sessionId: number) => string,
): Promise<{ saved: boolean; path?: string }> => {
  const result = await dialog.showSaveDialog({ defaultPath: defaultName, filters: [filter] });
  if (result.canceled || !result.filePath) return { saved: false };
  fs.writeFileSync(result.filePath, serialize(sessionId));
  return { saved: true, path: result.filePath };
};

/** 내보내기(HAR/MD/curl/Postman/OpenAPI/k6), HAR 가져오기, 클립보드. */
export const registerExportHandlers = (context: AppContext): void => {
  handle(CH.exportHar, (_event, sessionId: number) =>
    saveToFile(context, sessionId, `session-${sessionId}.har`, { name: 'HAR', extensions: ['har'] }, (id) =>
      JSON.stringify(toHar(context.recordStore.listTraffic(id)), null, 2),
    ),
  );
  handle(CH.exportMarkdown, (_event, sessionId: number) =>
    saveToFile(
      context,
      sessionId,
      `session-${sessionId}.md`,
      { name: 'Markdown', extensions: ['md'] },
      (id) => toMarkdown(context.recordStore.listTraffic(id)),
    ),
  );
  handle(CH.exportPostman, (_event, sessionId: number) =>
    saveToFile(
      context,
      sessionId,
      `session-${sessionId}.postman_collection.json`,
      { name: 'Postman', extensions: ['json'] },
      (id) => {
        const session = context.recordStore.listSessions().find((s) => s.id === id);
        return JSON.stringify(
          toPostmanCollection(session?.name ?? '세션', context.recordStore.listTraffic(id)),
          null,
          2,
        );
      },
    ),
  );
  handle(CH.exportOpenApi, (_event, sessionId: number) =>
    saveToFile(
      context,
      sessionId,
      `session-${sessionId}.openapi.json`,
      { name: 'OpenAPI', extensions: ['json'] },
      (id) => JSON.stringify(toOpenApi(context.recordStore.listTraffic(id)), null, 2),
    ),
  );
  handle(CH.exportK6, (_event, sessionId: number) =>
    saveToFile(context, sessionId, `session-${sessionId}.k6.js`, { name: 'k6', extensions: ['js'] }, (id) =>
      toK6Script(context.recordStore.listTraffic(id)),
    ),
  );

  handle(CH.exportCurl, (_event, recordId: number) => {
    const record = context.recordStore.getTrafficById(recordId);
    if (!record) throw new Error('기록을 찾을 수 없어요.');
    clipboard.writeText(toCurl(record));
    return { copied: true };
  });
  handle(CH.clipboardWrite, (_event, text: string) => {
    clipboard.writeText(text);
    return { copied: true };
  });

  // 세션 번들(.hpr) 내보내기 — 전체 충실도 JSON (#28)
  handle(CH.exportBundle, (_event, sessionId: number) =>
    saveToFile(
      context,
      sessionId,
      `session-${sessionId}.hpr.json`,
      { name: 'HttpProxyRecord 번들', extensions: ['json'] },
      (id) => {
        const session = context.recordStore.listSessions().find((item) => item.id === id) ?? null;
        return JSON.stringify({ version: 1, session, records: context.recordStore.listTraffic(id) }, null, 2);
      },
    ),
  );

  // 세션 번들 가져오기 → 새 세션 (#28)
  handle(CH.importBundle, async (): Promise<{ imported: boolean; sessions?: Session[] }> => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'HttpProxyRecord 번들', extensions: ['json', 'hpr'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { imported: false };

    const parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8')) as {
      session?: { name?: string };
      records?: TrafficRecord[];
    };
    const session = context.recordStore.createSession(`번들: ${parsed.session?.name ?? '가져옴'}`);
    for (const record of parsed.records ?? []) {
      const captured = { ...record } as Partial<TrafficRecord>;
      delete captured.id;
      delete captured.sessionId;
      context.recordStore.insertTraffic(session.id, captured as CapturedTraffic);
    }
    return { imported: true, sessions: context.recordStore.listSessions() };
  });

  // HAR 가져오기 → 새 세션 (#15)
  handle(CH.importHar, async (): Promise<{ imported: boolean; sessions?: Session[] }> => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'HAR', extensions: ['har', 'json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { imported: false };

    const raw = fs.readFileSync(result.filePaths[0], 'utf-8');
    const traffic = parseHar(raw);
    const fileName = result.filePaths[0].split('/').pop() ?? 'imported.har';
    const session = context.recordStore.createSession(`가져옴: ${fileName}`);
    for (const item of traffic) context.recordStore.insertTraffic(session.id, item);
    return { imported: true, sessions: context.recordStore.listSessions() };
  });
};
