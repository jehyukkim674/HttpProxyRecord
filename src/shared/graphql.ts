export type GraphQLInfo = {
  isGraphQL: boolean;
  operationName: string | null;
  operationType: 'query' | 'mutation' | 'subscription';
};

/** 요청 본문이 GraphQL이면 operation 정보를 파싱한다 (#33). */
export const parseGraphQL = (body: string | null): GraphQLInfo | null => {
  if (!body) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const query = (parsed as { query?: unknown }).query;
  if (typeof query !== 'string') return null;

  const operationName = (parsed as { operationName?: unknown }).operationName;
  const trimmed = query.trimStart();
  const operationType: GraphQLInfo['operationType'] = trimmed.startsWith('mutation')
    ? 'mutation'
    : trimmed.startsWith('subscription')
      ? 'subscription'
      : 'query';

  return {
    isGraphQL: true,
    operationName: typeof operationName === 'string' ? operationName : null,
    operationType,
  };
};
