# HttpProxyRecord

HTTP/HTTPS 트래픽을 캡처·기록·재생하는 크로스플랫폼(macOS + Windows) 데스크톱 앱.

## 주요 기능

- **디버깅 프록시**: 로컬 MITM 프록시(기본 포트 8888)로 HTTP/HTTPS 요청·응답을 실시간 캡처
- **HTTPS 복호화**: 자체 루트 CA로 TLS MITM — 요청/응답 본문까지 확인
- **세션 녹화**: 트래픽을 세션 단위로 SQLite(Node 내장 node:sqlite)에 저장
- **Mock 재생**: 녹화된 세션을 mock 서버(기본 포트 8889)로 재생 — 백엔드 없이 프론트 개발/테스트
- **내보내기**: HAR 1.2 / curl 명령어 / Markdown 문서
- **시스템 프록시 원클릭**: macOS/Windows 시스템 프록시 자동 등록·해제 (앱 종료 시 자동 해제)

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
