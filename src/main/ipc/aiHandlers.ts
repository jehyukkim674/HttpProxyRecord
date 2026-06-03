import type { AppContext } from '../appContext';
import { handle } from './handle';

/** AI 기능 (#21~#24). 키 미설정 시 서비스가 안내 에러를 던지고, handle 래퍼가 로깅 후 렌더러로 전달. */
export const registerAiHandlers = (context: AppContext): void => {
  handle('ai:key-status', () => context.getAiKeyStatus());
  handle('ai:set-key', (_event, apiKey: string) => context.setAiApiKey(apiKey));

  handle('ai:explain', (_event, recordId: number) => {
    const record = context.recordStore.getTrafficById(recordId);
    if (!record) throw new Error('기록을 찾을 수 없어요.');
    return context.aiService.explainResponse(record);
  });
  handle('ai:generate-tests', (_event, recordId: number) => {
    const record = context.recordStore.getTrafficById(recordId);
    if (!record) throw new Error('기록을 찾을 수 없어요.');
    return context.aiService.generateTests(record);
  });
  handle('ai:detect-anomalies', (_event, sessionId: number) =>
    context.aiService.detectAnomalies(context.recordStore.listTraffic(sessionId)),
  );
  handle('ai:search', (_event, sessionId: number, query: string) =>
    context.aiService.naturalLanguageSearch(query, context.recordStore.listTraffic(sessionId)),
  );
};
