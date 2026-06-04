import { CH } from '../../shared/channels';
import { handle } from './handle';
import { UpdateManager } from '../system/updater';

/** 자동 업데이트 확인/설치. 상태가 없어 AppContext에 의존하지 않는다. */
export const registerUpdateHandlers = (): void => {
  const updater = new UpdateManager();
  handle(CH.updateCheck, () => updater.check());
  handle(CH.updateInstall, () => updater.install());
};
