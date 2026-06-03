# HttpProxyRecord

HTTP/HTTPS 트래픽을 캡처·기록·재생하는 크로스플랫폼(macOS + Windows) 데스크톱 앱.

## 주요 기능

**캡처/뷰어**
- **디버깅 프록시**: 로컬 MITM 프록시(기본 포트 8888)로 HTTP/HTTPS 요청·응답을 실시간 캡처
- **HTTPS 복호화**: 자체 루트 CA로 TLS MITM — 요청/응답 본문까지 확인
- **응답 압축 해제 + 이미지 미리보기**: gzip/brotli/deflate 자동 해제, 이미지 썸네일
- **필터 + 검색**: 도메인/메서드/상태코드/URL 검색, 워터폴 타임라인 뷰, 다크모드
- **JWT 디코더 / 쿠키 / GraphQL operation 표시**

**기록/재생/내보내기**
- **세션 녹화**: 트래픽을 세션 단위로 SQLite(Node 내장 node:sqlite)에 저장
- **Mock 재생**: 녹화 세션을 mock 서버(8889)로 재생 — 지연 반영·패스스루(하이브리드) 옵션
- **내보내기**: HAR 1.2 / curl / Markdown / Postman / OpenAPI(swagger-man) / k6, HAR 가져오기
- **민감정보 마스킹**: 내보낼 때 Authorization/Cookie/토큰 자동 가림
- **세션 비교 / 스냅샷 테스트 / 즐겨찾기 / 통계 대시보드**

**프록시 제어**
- **응답 오버라이드(Map Local) / 브레이크포인트 / 네트워크 throttle**
- **시스템 프록시 원클릭**: macOS/Windows 자동 등록·해제 (종료 시 자동 해제)
- **캡처 제외 도메인 / 조건부 데스크톱 알림 / WebSocket 기록**

**요청 작성·자동화**
- **요청 재전송(Composer) + 변수 체이닝**: 응답값 dot-path 추출 → `{{var}}` 주입
- **코드 스니펫**: curl / Python / JS fetch / Go
- **헤드리스 CLI**(`--headless`), **모바일 페어링 QR**

**AI (Claude API · 선택)**
- **AI 응답 설명 / 이상 탐지 / 자연어 검색 / 테스트 케이스 생성** — 설정에서 API 키 입력 시 활성화(미설정 시 자동 비활성). 전송 전 민감 헤더 마스킹

## 기술 스택

Electron 42 + electron-vite 5 + React 19 + TypeScript + antd 6 + node-forge + vitest

## 개발 환경

```bash
make setup      # 의존성 설치 + pre-commit hook
make dev        # 개발 모드 실행
make test       # 테스트 (vitest)
make lint       # ESLint
make format     # Prettier
make build      # electron-vite 빌드
```

## 사용 방법

1. **녹화 시작** — 세션 이름 입력 후 시작하면 프록시가 `127.0.0.1:8888`에 뜬다
2. **인증서 설치** — HTTPS 복호화를 위해 루트 CA를 시스템에 신뢰 등록 (최초 1회, 관리자 암호 필요)
3. **트래픽 연결**
   - 맥/PC 전체: "시스템 프록시 ON" 토글
   - 특정 프로세스만: `HTTP_PROXY=http://127.0.0.1:8888 HTTPS_PROXY=http://127.0.0.1:8888 <명령>`
   - curl 테스트: `curl -x http://127.0.0.1:8888 https://example.com/`
4. **재생** — 세션 옆 ▶ 버튼 → mock 서버가 `127.0.0.1:8889`에 뜬다 (메서드+경로 매칭)
5. **내보내기** — 세션 옆 내보내기 버튼 → HAR/Markdown 저장, 상세 패널에서 curl 복사

## 패키징

```bash
npm run package:mac   # macOS .app zip (dist/)
npm run package:win   # Windows nsis 인스톨러 (dist/)
```

## 프로젝트 구조

```
src/
├── main/               # Electron Main 프로세스
│   ├── index.ts        # 앱 진입점
│   ├── appContext.ts   # 엔진/저장소 수명주기
│   ├── ipcHandlers.ts  # IPC 채널 등록
│   ├── proxy/          # ProxyEngine(MITM) + CertManager
│   ├── store/          # RecordStore (node:sqlite)
│   ├── replay/         # ReplayServer (mock 재생)
│   ├── system/         # 시스템 프록시 + 인증서 설치
│   └── export/         # HAR/curl/Markdown 변환
├── preload/            # contextBridge API
├── renderer/           # React UI
└── shared/             # Main/Renderer 공유 타입

tests/                  # vitest 단위/통합 테스트 (34개)
docs/superpowers/       # 설계 스펙 + 구현 플랜
```
