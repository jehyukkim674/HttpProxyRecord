import type { AppContext } from '../appContext';
import { CH } from '../../shared/channels';
import { handle } from './handle';

/** AI 기능 (#21~#24). 키 미설정 시 서비스가 안내 에러를 던지고, handle 래퍼가 로깅 후 렌더러로 전달. */
export const registerAiHandlers = (context: AppContext): void => {
  handle(CH.aiKeyStatus, () => context.getAiKeyStatus());
  handle(CH.aiSetKey, (_event, apiKey: string) => context.setAiApiKey(apiKey));

  handle(CH.aiExplain, (_event, recordId: number) => {
    const record = context.recordStore.getTrafficById(recordId);
    if (!record) throw new Error('기록을 찾을 수 없어요.');
    return context.aiService.explainResponse(record);
  });
  handle(CH.aiGenerateTests, (_event, recordId: number) => {
    const record = context.recordStore.getTrafficById(recordId);
    if (!record) throw new Error('기록을 찾을 수 없어요.');
    return context.aiService.generateTests(record);
  });
  handle(CH.aiDetectAnomalies, (_event, sessionId: number) =>
    context.aiService.detectAnomalies(context.recordStore.listTraffic(sessionId)),
  );
  handle(CH.aiSearch, (_event, sessionId: number, query: string) =>
    context.aiService.naturalLanguageSearch(query, context.recordStore.listTraffic(sessionId)),
  );
  handle(CH.aiSessionReport, (_event, sessionId: number) =>
    context.aiService.sessionReport(context.recordStore.listTraffic(sessionId)),
  );
  handle(CH.aiSecuritySuggest, (_event, recordId: number) => {
    const record = context.recordStore.getTrafficById(recordId);
    if (!record) throw new Error('기록을 찾을 수 없어요.');
    return context.aiService.securitySuggestions(record);
  });
  handle(CH.aiMockData, (_event, recordId: number) => {
    const record = context.recordStore.getTrafficById(recordId);
    if (!record) throw new Error('기록을 찾을 수 없어요.');
    return context.aiService.generateMockData(record);
  });
};
