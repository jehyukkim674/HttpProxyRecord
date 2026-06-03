import { compareResponses } from '../../shared/diff';
import { sendComposedRequest } from './requestSender';
import type { Snapshot, SnapshotVerifyResult } from '../../shared/types';

/** 스냅샷을 재전송해 현재 응답과 비교한다. */
export const verifySnapshot = async (snapshot: Snapshot): Promise<SnapshotVerifyResult> => {
  const live = await sendComposedRequest({
    method: snapshot.method,
    url: snapshot.url,
    headers: {},
    body: null,
  });
  const comparison = compareResponses(
    { statusCode: snapshot.statusCode, body: snapshot.body },
    { statusCode: live.statusCode, body: live.body },
  );
  const passed = !comparison.statusChanged && comparison.bodyDiff.every((line) => line.type === 'same');
  return { snapshotId: snapshot.id, passed, comparison };
};
