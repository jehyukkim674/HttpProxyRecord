# HttpProxyRecord 설계 문서

**작성일:** 2026-06-03
**상태:** 승인됨

## 개요

HTTP/HTTPS 트래픽을 캡처·기록·재생하는 크로스플랫폼(macOS + Windows) 데스크톱 앱.
Charles/Proxyman처럼 로컬 MITM 프록시로 동작하며, 녹화된 세션을 mock 서버로 재생하고
HAR/curl/Markdown으로 내보낼 수 있다.

### 핵심 용도 (3가지 모두 지원)

1. **디버깅 프록시** — 앱/브라우저/CLI 트래픽을 경유시켜 요청·응답을 실시간으로 보고 기록
2. **녹화 + 재생 (record & replay)** — 녹화한 세션을 서버 없이 mock 서버로 재생
3. **증거 수집** — 기록한 요청/응답을 HAR, curl, Markdown으로 문서화

### 대상 트래픽

- **맥/PC 전체**: 시스템 프록시 원클릭 등록 (macOS `networksetup` / Windows 레지스트리)
- **개발 서버/CLI**: `HTTP_PROXY`/`HTTPS_PROXY` 환경변수로 특정 프로세스만 경유

### HTTPS 처리

- 자체 루트 CA 생성 후 시스템 신뢰 저장소에 설치 (사용자 승인 흐름)
- 도메인별 leaf 인증서를 동적 발급해 TLS MITM 복호화 — 요청/응답 본문까지 기록

## 기술 스택

| 영역 | 선택 | 이유 |
|------|------|------|
| 앱 프레임워크 | Electron + electron-builder | macOS dmg + Windows nsis 동시 배포 |
| UI | React + TypeScript + antd + Vite | 사용자 주력 스택, 데이터 밀집 UI에 적합 |
| 프록시 엔진 | Node.js 기본 모듈(`http`/`tls`/`net`) + `node-forge`로 직접 구현 | MITM 핵심 로직을 직접 소유해 수정 용이. 구현 플랜 단계에서 `http-mitm-proxy` 라이브러리의 유지보수 상태를 검증해 사용 가능하면 엔진 기반으로 채택(직접 구현 코드 감소) |
| 저장소 | better-sqlite3 | 대용량 트래픽 기록, 세션 단위 관리 |
| 테스트 | vitest + 로컬 echo 서버 통합 테스트 | |
| 품질 | ESLint + Prettier + pre-commit hook | swagger-man과 동일한 워크플로우 |

### 검토했던 대안

- **순수 Swift 네이티브 (SwiftNIO)**: Windows 미지원으로 제외
- **Kotlin Compose Desktop**: MITM 라이브러리는 성숙하나 UI 프레임워크 학습 비용
- **Tauri + Rust**: 가장 가볍지만 프록시 엔진 직접 수정이 어려움

## 전체 아키텍처

```
┌─────────────────────────────────────────────────┐
│ Electron App (HttpProxyRecord.app / .exe)       │
│                                                  │
│  ┌──────────────────┐    ┌────────────────────┐ │
│  │ Main Process     │    │ Renderer (React)   │ │
│  │ (Node.js)        │◄──►│                    │ │
│  │                  │IPC │ · 트래픽 목록(실시간)│ │
│  │ · ProxyEngine    │    │ · 요청/응답 상세    │ │
│  │ · CertManager    │    │ · 세션 관리         │ │
│  │ · RecordStore    │    │ · 필터/검색         │ │
│  │ · ReplayServer   │    │ · 설정              │ │
│  │ · SystemProxy    │    │                    │ │
│  │ · Exporter       │    │                    │ │
│  └──────────────────┘    └────────────────────┘ │
└─────────────────────────────────────────────────┘
        ▲ :8888 (프록시)        ▲ :8889 (재생 mock)
        │                       │
   브라우저/앱/CLI          테스트 대상 앱
```

- **Main Process**: 프록시 엔진, 인증서, 저장, 재생 등 모든 엔진 로직
- **Renderer**: React UI — 트래픽 뷰어, 세션 관리, 설정
- **IPC**: 실시간 트래픽 스트리밍(Main→Renderer), 제어 명령(Renderer→Main)

## 핵심 컴포넌트 (Main Process)

| 컴포넌트 | 역할 |
|---------|------|
| **ProxyEngine** | HTTP/HTTPS MITM 프록시 (기본 포트 8888). HTTP는 직접 중계, HTTPS는 CONNECT 터널을 가로채 동적 인증서로 TLS 복호화 후 중계 |
| **CertManager** | 루트 CA 생성(`node-forge`), 도메인별 leaf 인증서 발급/메모리 캐시, 시스템 신뢰 설치 가이드(macOS Keychain / Windows 인증서 저장소) |
| **RecordStore** | 트래픽을 SQLite(`better-sqlite3`)에 저장. 세션 생성/조회/삭제, 트래픽 페이지네이션 조회 |
| **ReplayServer** | 선택한 세션을 mock 서버(기본 포트 8889)로 재생. URL+메서드 매칭(정확/패턴)으로 녹화된 응답 반환, 미매칭 시 404 + 로그 |
| **SystemProxyManager** | 시스템 프록시 등록/해제. macOS: `networksetup -setwebproxy/-setsecurewebproxy`, Windows: `WinINET` 레지스트리 |
| **Exporter** | HAR 1.2 / curl 명령어 / Markdown 표 형식 내보내기 |

## 데이터 모델

```typescript
type Session = {
  id: number;
  name: string;
  createdAt: string;       // ISO 8601
  endedAt: string | null;
  recordCount: number;
};

type TrafficRecord = {
  id: number;
  sessionId: number;
  timestamp: string;        // ISO 8601
  method: string;
  url: string;              // 전체 URL
  host: string;
  path: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;     // base64 (바이너리) 또는 텍스트
  statusCode: number;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  durationMs: number;
  requestSize: number;      // bytes
  responseSize: number;
  isHttps: boolean;
  clientIp: string;
};
```

## 주요 화면 (React + antd, UI 텍스트는 한국어)

1. **메인 화면** (3분할 레이아웃)
   - 좌측: 세션 목록 (생성/이름변경/삭제/재생 시작)
   - 중앙: 트래픽 테이블 — 실시간 추가, 가상 스크롤, 컬럼: 시각/메서드/상태/호스트/경로/크기/소요시간
   - 우측: 상세 패널 — 요청/응답 탭, 헤더 테이블, 바디 뷰어(JSON pretty/raw 전환), 타이밍
2. **상단 툴바**: 녹화 시작/중지, 시스템 프록시 on/off 토글, 필터(도메인/메서드/상태코드), 텍스트 검색
3. **재생 모드**: 세션 선택 → "Mock 서버로 재생" → 매칭 규칙(URL 정확 일치/경로 패턴) 설정 → 재생 중 히트/미스 로그
4. **내보내기**: 선택 항목 또는 세션 전체 → HAR / curl / Markdown
5. **설정**: 프록시 포트, mock 포트, 인증서 설치/재발급/내보내기, 캡처 제외 도메인 목록

## 에러 처리 & 보안

| 상황 | 처리 |
|------|------|
| 인증서 미신뢰 | HTTPS 접속 실패 감지 → 설치 가이드 모달 표시 |
| 포트 충돌 | 시작 시 점유 확인 → 대체 포트 제안 |
| 대용량 바디 | 10MB 초과 시 truncate 저장 (원본 크기는 기록) |
| 루트 CA 개인키 | OS 사용자 데이터 디렉터리에 권한 600 저장, 외부 유출 금지 |
| 앱 비정상 종료 | 다음 실행 시 시스템 프록시 잔류 감지 → 자동 해제 제안 |
| 앱 정상 종료 | 시스템 프록시 자동 해제 (인터넷 끊김 사고 방지) |

## 테스트 & 품질

- **단위 테스트** (vitest): 인증서 생성/서명, HAR 변환, curl 생성, 재생 매칭 규칙, 필터 로직
- **통합 테스트**: 로컬 echo 서버를 띄우고 프록시 경유 HTTP/HTTPS 요청 → 기록 검증
- **lint**: ESLint + Prettier, pre-commit hook (swagger-man 방식)
- **빌드**: electron-builder → macOS dmg(arm64/x64) + Windows nsis(x64)

## 프로젝트 구조

```
HttpProxyRecord/
├── package.json
├── electron-builder.yml
├── tsconfig.json
├── vite.config.ts
├── electron/                 # Main process (TypeScript)
│   ├── main.ts               # 앱 진입점, 윈도우/IPC 등록
│   ├── preload.ts            # contextBridge API 노출
│   ├── proxy/
│   │   ├── proxyEngine.ts    # MITM 프록시 서버
│   │   └── certManager.ts    # 루트 CA / leaf 인증서
│   ├── store/
│   │   └── recordStore.ts    # SQLite 세션/트래픽 저장
│   ├── replay/
│   │   └── replayServer.ts   # mock 재생 서버
│   ├── system/
│   │   └── systemProxy.ts    # OS 시스템 프록시 등록/해제
│   └── export/
│       └── exporter.ts       # HAR / curl / Markdown
├── src/                      # Renderer (React)
│   ├── App.tsx
│   ├── pages/
│   ├── components/
│   └── services/             # IPC 클라이언트 래퍼
├── tests/
├── scripts/                  # pre-commit hook, 빌드 스크립트
└── docs/
    └── superpowers/specs/    # 이 문서
```

## 구현 순서 (큰 그림)

1. 프로젝트 스캐폴딩 (Electron + Vite + React + TS + lint/hook)
2. ProxyEngine — HTTP 프록시 + 기록 (HTTPS 제외)
3. CertManager + HTTPS MITM
4. RecordStore (SQLite) + 세션 관리
5. React UI — 트래픽 뷰어/상세/필터
6. SystemProxyManager (macOS/Windows)
7. ReplayServer (mock 재생)
8. Exporter (HAR/curl/Markdown)
9. 패키징 (electron-builder) + 인증서 설치 UX 다듬기
