export type Session = {
  id: number;
  name: string;
  createdAt: string;
  endedAt: string | null;
  recordCount: number;
};

export type TrafficRecord = {
  id: number;
  sessionId: number;
  timestamp: string;
  method: string;
  url: string;
  host: string;
  path: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  statusCode: number;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  durationMs: number;
  requestSize: number;
  responseSize: number;
  isHttps: boolean;
  clientIp: string;
};

/** ProxyEngine이 캡처한 직후의 기록 (id/sessionId 부여 전) */
export type CapturedTraffic = Omit<TrafficRecord, 'id' | 'sessionId'>;

export type ProxyStatus = {
  running: boolean;
  port: number | null;
  recordingSessionId: number | null;
};

export type ReplayStatus = {
  running: boolean;
  port: number | null;
  sessionId: number | null;
  hitCount: number;
  missCount: number;
};

export type CertInfo = {
  exists: boolean;
  certPath: string;
  installed: boolean | null;
};

export type TrafficFilter = {
  domain: string; // 부분일치, '' = 전체
  methods: string[]; // 빈 배열 = 전체
  statusClasses: number[]; // [2,3,4,5] 중 선택, 빈 배열 = 전체
  search: string; // URL/경로 부분일치
};

export type ComposedRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
};

export type ComposedResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
};

export type LineDiff = { type: 'same' | 'added' | 'removed'; text: string };

export type ResponseComparison = {
  statusChanged: boolean;
  statusA: number;
  statusB: number;
  bodyDiff: LineDiff[];
};

export type SessionComparisonRow = {
  key: string;
  status: 'same' | 'changed' | 'onlyA' | 'onlyB';
  comparison: ResponseComparison | null;
};

export type WaterfallRow = {
  id: number;
  label: string;
  statusCode: number;
  leftMs: number;
  widthMs: number;
};

export type Snapshot = {
  id: number;
  method: string;
  path: string;
  url: string;
  statusCode: number;
  body: string;
  savedAt: string;
};

export type SnapshotVerifyResult = {
  snapshotId: number;
  passed: boolean;
  comparison: ResponseComparison;
};

export type OverrideRule = {
  id: number;
  urlPattern: string; // glob (예: */api/users)
  statusCode: number;
  contentType: string;
  body: string;
  enabled: boolean;
};

export type ThrottleConfig = {
  enabled: boolean;
  latencyMs: number;
};

export type StatsSummary = {
  totalCount: number;
  avgDurationMs: number;
  errorRate: number; // 0~1 (4xx+5xx 비율)
  byDomain: Array<{ host: string; count: number }>;
  slowest: TrafficRecord[];
};

export type Favorite = {
  id: number;
  method: string;
  url: string;
  note: string;
  createdAt: string;
};

// 스크립트 인터셉션: 사용자가 작성한 JS로 요청/응답을 변조하는 규칙
export type InterceptScript = {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
};
