import type { AppContext } from '../appContext';
import { CH } from '../../shared/channels';
import { handle } from './handle';

/** 스크립트 인터셉션 — 목록/저장/삭제/토글. 저장·삭제·토글 시 AppContext가 러너를 재컴파일한다. */
export const registerScriptHandlers = (context: AppContext): void => {
  handle(CH.scriptList, () => context.getScripts());
  handle(CH.scriptSave, (_event, input: { id?: string; name: string; code: string; enabled: boolean }) =>
    context.saveScript(input),
  );
  handle(CH.scriptDelete, (_event, id: string) => context.deleteScript(id));
  handle(CH.scriptToggle, (_event, id: string, enabled: boolean) => context.toggleScript(id, enabled));
};
