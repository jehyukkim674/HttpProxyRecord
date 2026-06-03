/** 분석 결과 한 건. 세션 분석에서는 recordId로 해당 트래픽을 가리킨다. */
export type Severity = 'high' | 'warn' | 'info';

export type Finding = {
  severity: Severity;
  rule: string; // 예: 'secret.aws-access-key'
  message: string;
  recordId?: number;
};
