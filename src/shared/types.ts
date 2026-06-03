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
