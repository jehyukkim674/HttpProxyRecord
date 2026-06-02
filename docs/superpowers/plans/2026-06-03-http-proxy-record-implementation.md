# HttpProxyRecord Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HTTP/HTTPS 트래픽을 캡처·기록·재생하는 크로스플랫폼(macOS + Windows) Electron 데스크톱 앱을 만든다.

**Architecture:** Electron Main 프로세스가 MITM 프록시 엔진·인증서·SQLite 저장·재생·내보내기를 담당하고, React Renderer가 트래픽 뷰어 UI를 담당한다. 둘은 IPC(contextBridge)로 통신한다.

**Tech Stack:** Electron + electron-vite + React 19 + TypeScript + antd 6 + better-sqlite3 + node-forge + vitest

**Spec:** `docs/superpowers/specs/2026-06-03-http-proxy-record-design.md`

**작업 디렉터리:** `~/Dev/HttpProxyRecord` (이미 git init 됨, main 브랜치)

**검증된 패키지 버전 (2026-06-03 npm 기준):** electron 42.x, electron-vite 5.x, vite 7.x(electron-vite 5는 vite 8 미지원), react 19.2.x, antd 6.4.x, better-sqlite3 12.10.x, node-forge 1.4.x, electron-builder 26.x, vitest 4.1.x

---

## Task 1: 프로젝트 스캐폴딩

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- Create: `eslint.config.mjs`, `.prettierrc`, `.gitignore`
- Create: `vitest.config.ts`
- Create: `src/main/index.ts`, `src/preload/index.ts`
- Create: `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`
- Create: `scripts/pre-commit`, `scripts/install-hooks.sh`, `Makefile`

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "http-proxy-record",
  "version": "0.1.0",
  "description": "HTTP/HTTPS 트래픽 캡처·기록·재생 데스크톱 앱",
  "main": "./out/main/index.js",
  "author": "jehyuk.kim",
  "license": "MIT",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src tests",
    "format": "prettier --write \"src/**/*.{ts,tsx}\" \"tests/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.{ts,tsx}\" \"tests/**/*.ts\"",
    "postinstall": "electron-builder install-app-deps",
    "package:mac": "electron-vite build && electron-builder --mac",
    "package:win": "electron-vite build && electron-builder --win"
  },
  "dependencies": {
    "antd": "^6.4.0",
    "better-sqlite3": "^12.10.0",
    "node-forge": "^1.4.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^25.0.0",
    "@types/node-forge": "^1.3.14",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^5.0.0",
    "electron": "^42.0.0",
    "electron-builder": "^26.0.0",
    "electron-vite": "^5.0.0",
    "eslint": "^9.39.0",
    "prettier": "^3.8.0",
    "typescript": "~5.9.0",
    "typescript-eslint": "^8.60.0",
    "vite": "^7.0.0",
    "vitest": "^4.1.0"
  }
}
```

> 주의: `vite`는 8.x가 최신이지만 electron-vite 5.x의 peerDependencies가 `^5||^6||^7`이므로 7.x로 고정한다.

- [ ] **Step 2: electron.vite.config.ts 작성**

```typescript
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
  },
});
```

- [ ] **Step 3: tsconfig 3종 작성**

`tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }]
}
```

`tsconfig.node.json` (main/preload/테스트용):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "composite": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*", "tests/**/*", "electron.vite.config.ts", "vitest.config.ts"]
}
```

`tsconfig.web.json` (renderer용):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "composite": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "useDefineForClassFields": true
  },
  "include": ["src/renderer/src/**/*", "src/shared/**/*", "src/preload/index.d.ts"]
}
```

- [ ] **Step 4: lint/format/git 설정 작성**

`eslint.config.mjs`:

```javascript
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'build/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
);
```

`.prettierrc`:

```json
{
  "singleQuote": true,
  "semi": true,
  "printWidth": 110,
  "trailingComma": "all"
}
```

`.gitignore`:

```
node_modules/
out/
dist/
build/
*.log
.DS_Store
*.local
coverage/
```

- [ ] **Step 5: vitest.config.ts 작성**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
```

> 인증서 생성(RSA 키 생성)과 프록시 통합 테스트는 수 초가 걸릴 수 있어 타임아웃을 30초로 늘린다.

- [ ] **Step 6: Electron main/preload/renderer 최소 코드 작성**

`src/main/index.ts`:

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'node:path';

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'HttpProxyRecord',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
};

void app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

`src/preload/index.ts`:

```typescript
import { contextBridge } from 'electron';

// Task 6에서 IPC API를 채운다
contextBridge.exposeInMainWorld('api', {});
```

`src/renderer/index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>HttpProxyRecord</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/renderer/src/main.tsx`:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/renderer/src/App.tsx`:

```typescript
const App = () => {
  return <h1>HttpProxyRecord</h1>;
};

export default App;
```

- [ ] **Step 7: pre-commit hook + Makefile 작성 (swagger-man 방식)**

`scripts/pre-commit`:

```bash
#!/bin/bash
set -e
echo "▶ lint 검사..."
npm run lint
echo "▶ 포맷 검사..."
npm run format:check
echo "✅ pre-commit 통과"
```

`scripts/install-hooks.sh`:

```bash
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cp "$SCRIPT_DIR/pre-commit" "$REPO_ROOT/.git/hooks/pre-commit"
chmod +x "$REPO_ROOT/.git/hooks/pre-commit"
echo "✅ pre-commit hook installed"
```

`Makefile`:

```makefile
.PHONY: setup dev test lint format build

setup:
	npm install
	bash scripts/install-hooks.sh

dev:
	npm run dev

test:
	npm run test

lint:
	npm run lint

format:
	npm run format

build:
	npm run build
```

- [ ] **Step 8: 의존성 설치 및 빈 창 실행 확인**

```bash
cd ~/Dev/HttpProxyRecord && npm install
```

Expected: 설치 성공. `electron-builder install-app-deps`가 better-sqlite3를 Electron용으로 리빌드.

설치 중 peer dependency 충돌이 나면: vite를 `^7.0.0`으로 고정했는지 확인. eslint 충돌 시 `eslint@^9` 유지.

```bash
cd ~/Dev/HttpProxyRecord && npm run build && npm run lint
```

Expected: 빌드 성공 (out/ 디렉터리 생성), lint 통과

```bash
cd ~/Dev/HttpProxyRecord && timeout 20 npm run dev || true
```

Expected: Electron 창이 떴다가 20초 후 종료됨 (수동 확인용 — CI에서는 build 성공으로 갈음)

- [ ] **Step 9: 커밋**

```bash
cd ~/Dev/HttpProxyRecord && bash scripts/install-hooks.sh && git add -A && git commit -m "기능: Electron + React + TypeScript 프로젝트 스캐폴딩"
```

---

## Task 2: 공유 타입 + CertManager (인증서 관리)

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/main/proxy/certManager.ts`
- Test: `tests/certManager.test.ts`

- [ ] **Step 1: 공유 타입 정의**

`src/shared/types.ts` — Main/Renderer가 공유하는 모든 타입:

```typescript
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
  installed: boolean | null; // null = 확인 불가
};
```

- [ ] **Step 2: CertManager 실패 테스트 작성**

`tests/certManager.test.ts`:

```typescript
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import forge from 'node-forge';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CertManager } from '../src/main/proxy/certManager';

describe('CertManager', () => {
  let tempDir: string;
  let certManager: CertManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpr-cert-test-'));
    certManager = new CertManager(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('루트 CA를 생성하고 파일로 저장한다', () => {
    const rootCa = certManager.loadOrCreateRootCa();

    expect(rootCa.cert).toContain('-----BEGIN CERTIFICATE-----');
    expect(rootCa.key).toContain('-----BEGIN RSA PRIVATE KEY-----');
    expect(fs.existsSync(path.join(tempDir, 'root-ca.cert.pem'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'root-ca.key.pem'))).toBe(true);

    const parsed = forge.pki.certificateFromPem(rootCa.cert);
    expect(parsed.subject.getField('CN').value).toBe('HttpProxyRecord Root CA');
    // CA 플래그 확인
    const basicConstraints = parsed.getExtension('basicConstraints') as { cA: boolean };
    expect(basicConstraints.cA).toBe(true);
  });

  it('두 번째 호출에는 저장된 루트 CA를 다시 로드한다', () => {
    const first = certManager.loadOrCreateRootCa();
    const second = certManager.loadOrCreateRootCa();

    expect(second.cert).toBe(first.cert);

    // 새 인스턴스로도 동일 인증서 로드
    const newManager = new CertManager(tempDir);
    const reloaded = newManager.loadOrCreateRootCa();
    expect(reloaded.cert).toBe(first.cert);
  });

  it('도메인용 leaf 인증서를 루트 CA로 서명해 발급한다', () => {
    certManager.loadOrCreateRootCa();

    const leaf = certManager.getCertForHost('example.com');

    const leafCert = forge.pki.certificateFromPem(leaf.cert);
    expect(leafCert.subject.getField('CN').value).toBe('example.com');

    // SAN 확인
    const san = leafCert.getExtension('subjectAltName') as { altNames: Array<{ value: string }> };
    expect(san.altNames.map((alternativeName) => alternativeName.value)).toContain('example.com');

    // 루트 CA로 서명되었는지 검증
    const rootCert = forge.pki.certificateFromPem(certManager.loadOrCreateRootCa().cert);
    expect(rootCert.verify(leafCert)).toBe(true);
  });

  it('같은 도메인의 leaf 인증서는 캐시에서 재사용한다', () => {
    certManager.loadOrCreateRootCa();

    const first = certManager.getCertForHost('example.com');
    const second = certManager.getCertForHost('example.com');

    expect(second.cert).toBe(first.cert);
  });

  it('루트 CA 초기화 전에 leaf 발급을 요청하면 에러를 던진다', () => {
    expect(() => certManager.getCertForHost('example.com')).toThrow('루트 CA가 초기화되지 않았습니다');
  });
});
```

- [ ] **Step 3: 테스트 실행 — 실패 확인**

```bash
cd ~/Dev/HttpProxyRecord && npx vitest run tests/certManager.test.ts
```

Expected: FAIL — `certManager.ts` 모듈 없음

- [ ] **Step 4: CertManager 구현**

`src/main/proxy/certManager.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import forge from 'node-forge';

export type CertPair = {
  key: string;
  cert: string;
};

const ROOT_CA_COMMON_NAME = 'HttpProxyRecord Root CA';
const ROOT_CA_VALID_YEARS = 10;
const LEAF_VALID_YEARS = 1;
const RSA_KEY_BITS = 2048;

/**
 * MITM용 인증서 관리자.
 * - 루트 CA 생성/저장/로드
 * - 도메인별 leaf 인증서 발급 (루트 CA 서명) + 메모리 캐시
 * - leaf 키쌍은 1회 생성 후 재사용 (RSA 생성이 느리므로)
 */
export class CertManager {
  private rootCa: CertPair | null = null;
  private leafKeys: forge.pki.rsa.KeyPair | null = null;
  private readonly leafCache = new Map<string, CertPair>();

  constructor(private readonly storageDir: string) {}

  get rootCaCertPath(): string {
    return path.join(this.storageDir, 'root-ca.cert.pem');
  }

  private get rootCaKeyPath(): string {
    return path.join(this.storageDir, 'root-ca.key.pem');
  }

  loadOrCreateRootCa(): CertPair {
    if (this.rootCa) return this.rootCa;

    if (fs.existsSync(this.rootCaKeyPath) && fs.existsSync(this.rootCaCertPath)) {
      this.rootCa = {
        key: fs.readFileSync(this.rootCaKeyPath, 'utf-8'),
        cert: fs.readFileSync(this.rootCaCertPath, 'utf-8'),
      };
      return this.rootCa;
    }

    const created = this.createRootCa();
    fs.mkdirSync(this.storageDir, { recursive: true });
    fs.writeFileSync(this.rootCaKeyPath, created.key, { mode: 0o600 });
    fs.writeFileSync(this.rootCaCertPath, created.cert);
    this.rootCa = created;
    return created;
  }

  getCertForHost(hostname: string): CertPair {
    const cached = this.leafCache.get(hostname);
    if (cached) return cached;

    if (!this.rootCa) {
      throw new Error('루트 CA가 초기화되지 않았습니다. loadOrCreateRootCa()를 먼저 호출하세요.');
    }

    const pair = this.createLeafCert(hostname);
    this.leafCache.set(hostname, pair);
    return pair;
  }

  private createRootCa(): CertPair {
    const keys = forge.pki.rsa.generateKeyPair(RSA_KEY_BITS);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = `01${Date.now().toString(16)}`;
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + ROOT_CA_VALID_YEARS);

    const attrs = [
      { name: 'commonName', value: ROOT_CA_COMMON_NAME },
      { name: 'organizationName', value: 'HttpProxyRecord' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([
      { name: 'basicConstraints', cA: true, critical: true },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true, digitalSignature: true, critical: true },
      { name: 'subjectKeyIdentifier' },
    ]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    return {
      key: forge.pki.privateKeyToPem(keys.privateKey),
      cert: forge.pki.certificateToPem(cert),
    };
  }

  private createLeafCert(hostname: string): CertPair {
    if (!this.rootCa) throw new Error('루트 CA가 초기화되지 않았습니다.');

    const rootKey = forge.pki.privateKeyFromPem(this.rootCa.key);
    const rootCert = forge.pki.certificateFromPem(this.rootCa.cert);

    if (!this.leafKeys) {
      this.leafKeys = forge.pki.rsa.generateKeyPair(RSA_KEY_BITS);
    }

    const cert = forge.pki.createCertificate();
    cert.publicKey = this.leafKeys.publicKey;
    cert.serialNumber = `02${Date.now().toString(16)}${Math.floor(Math.random() * 0xffff).toString(16)}`;
    cert.validity.notBefore = new Date();
    cert.validity.notBefore.setDate(cert.validity.notBefore.getDate() - 1);
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + LEAF_VALID_YEARS);

    cert.setSubject([{ name: 'commonName', value: hostname }]);
    cert.setIssuer(rootCert.subject.attributes);
    cert.setExtensions([
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames: [{ type: 2, value: hostname }] },
    ]);
    cert.sign(rootKey, forge.md.sha256.create());

    return {
      key: forge.pki.privateKeyToPem(this.leafKeys.privateKey),
      cert: forge.pki.certificateToPem(cert),
    };
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd ~/Dev/HttpProxyRecord && npx vitest run tests/certManager.test.ts
```

Expected: PASS (5개 테스트)

- [ ] **Step 6: 커밋**

```bash
cd ~/Dev/HttpProxyRecord && git add src/shared/types.ts src/main/proxy/certManager.ts tests/certManager.test.ts && git commit -m "기능: MITM용 루트 CA 및 도메인 인증서 발급 CertManager 추가"
```

---

## Task 3: RecordStore (SQLite 세션/트래픽 저장)

**Files:**
- Create: `src/main/store/recordStore.ts`
- Test: `tests/recordStore.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/recordStore.test.ts`:

```typescript
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecordStore } from '../src/main/store/recordStore';
import type { CapturedTraffic } from '../src/shared/types';

const sampleTraffic = (overrides: Partial<CapturedTraffic> = {}): CapturedTraffic => ({
  timestamp: '2026-06-03T10:00:00.000Z',
  method: 'GET',
  url: 'https://api.example.com/users?page=1',
  host: 'api.example.com',
  path: '/users?page=1',
  requestHeaders: { host: 'api.example.com', accept: 'application/json' },
  requestBody: null,
  statusCode: 200,
  responseHeaders: { 'content-type': 'application/json' },
  responseBody: '{"users":[]}',
  durationMs: 42,
  requestSize: 120,
  responseSize: 13,
  isHttps: true,
  clientIp: '127.0.0.1',
  ...overrides,
});

describe('RecordStore', () => {
  let tempDir: string;
  let store: RecordStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpr-store-test-'));
    store = new RecordStore(path.join(tempDir, 'test.db'));
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('세션을 생성하고 목록을 조회한다', () => {
    const session = store.createSession('테스트 세션');

    expect(session.id).toBeGreaterThan(0);
    expect(session.name).toBe('테스트 세션');
    expect(session.endedAt).toBeNull();
    expect(session.recordCount).toBe(0);

    const sessions = store.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(session.id);
  });

  it('세션을 종료하면 endedAt이 기록된다', () => {
    const session = store.createSession('세션');

    store.endSession(session.id);

    const sessions = store.listSessions();
    expect(sessions[0].endedAt).not.toBeNull();
  });

  it('트래픽을 저장하고 세션별로 조회한다', () => {
    const session = store.createSession('세션');

    const record = store.insertTraffic(session.id, sampleTraffic());

    expect(record.id).toBeGreaterThan(0);
    expect(record.sessionId).toBe(session.id);
    expect(record.requestHeaders).toEqual({ host: 'api.example.com', accept: 'application/json' });

    const records = store.listTraffic(session.id);
    expect(records).toHaveLength(1);
    expect(records[0].url).toBe('https://api.example.com/users?page=1');
    expect(records[0].responseBody).toBe('{"users":[]}');
  });

  it('세션 목록의 recordCount는 저장된 트래픽 수를 반영한다', () => {
    const session = store.createSession('세션');
    store.insertTraffic(session.id, sampleTraffic());
    store.insertTraffic(session.id, sampleTraffic({ method: 'POST', statusCode: 201 }));

    const sessions = store.listSessions();
    expect(sessions[0].recordCount).toBe(2);
  });

  it('세션을 삭제하면 트래픽도 함께 삭제된다', () => {
    const session = store.createSession('세션');
    store.insertTraffic(session.id, sampleTraffic());

    store.deleteSession(session.id);

    expect(store.listSessions()).toHaveLength(0);
    expect(store.listTraffic(session.id)).toHaveLength(0);
  });

  it('10MB를 초과하는 바디는 잘라서 저장한다', () => {
    const session = store.createSession('세션');
    const bigBody = 'x'.repeat(11 * 1024 * 1024);

    const record = store.insertTraffic(session.id, sampleTraffic({ responseBody: bigBody }));

    const stored = store.listTraffic(session.id)[0];
    expect(stored.responseBody!.length).toBe(10 * 1024 * 1024);
    expect(record.responseSize).toBe(13); // responseSize는 원본 캡처 값 유지
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd ~/Dev/HttpProxyRecord && npx vitest run tests/recordStore.test.ts
```

Expected: FAIL — `recordStore.ts` 모듈 없음

- [ ] **Step 3: RecordStore 구현**

`src/main/store/recordStore.ts`:

```typescript
import Database from 'better-sqlite3';
import type { CapturedTraffic, Session, TrafficRecord } from '../../shared/types';

const MAX_BODY_BYTES = 10 * 1024 * 1024;

type SessionRow = {
  id: number;
  name: string;
  created_at: string;
  ended_at: string | null;
  record_count: number;
};

type TrafficRow = {
  id: number;
  session_id: number;
  timestamp: string;
  method: string;
  url: string;
  host: string;
  path: string;
  request_headers: string;
  request_body: string | null;
  status_code: number;
  response_headers: string;
  response_body: string | null;
  duration_ms: number;
  request_size: number;
  response_size: number;
  is_https: number;
  client_ip: string;
};

export class RecordStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        ended_at TEXT
      );
      CREATE TABLE IF NOT EXISTS traffic_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        timestamp TEXT NOT NULL,
        method TEXT NOT NULL,
        url TEXT NOT NULL,
        host TEXT NOT NULL,
        path TEXT NOT NULL,
        request_headers TEXT NOT NULL,
        request_body TEXT,
        status_code INTEGER NOT NULL,
        response_headers TEXT NOT NULL,
        response_body TEXT,
        duration_ms INTEGER NOT NULL,
        request_size INTEGER NOT NULL,
        response_size INTEGER NOT NULL,
        is_https INTEGER NOT NULL,
        client_ip TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_traffic_session ON traffic_records(session_id);
    `);
  }

  createSession(name: string): Session {
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare('INSERT INTO sessions (name, created_at) VALUES (?, ?)')
      .run(name, createdAt);

    return {
      id: Number(result.lastInsertRowid),
      name,
      createdAt,
      endedAt: null,
      recordCount: 0,
    };
  }

  listSessions(): Session[] {
    const rows = this.db
      .prepare(
        `SELECT s.*, (SELECT COUNT(*) FROM traffic_records t WHERE t.session_id = s.id) AS record_count
         FROM sessions s ORDER BY s.id DESC`,
      )
      .all() as SessionRow[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      endedAt: row.ended_at,
      recordCount: row.record_count,
    }));
  }

  endSession(id: number): void {
    this.db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  }

  deleteSession(id: number): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  insertTraffic(sessionId: number, traffic: CapturedTraffic): TrafficRecord {
    const truncate = (body: string | null): string | null =>
      body !== null && body.length > MAX_BODY_BYTES ? body.slice(0, MAX_BODY_BYTES) : body;

    const result = this.db
      .prepare(
        `INSERT INTO traffic_records (
          session_id, timestamp, method, url, host, path,
          request_headers, request_body, status_code, response_headers, response_body,
          duration_ms, request_size, response_size, is_https, client_ip
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sessionId,
        traffic.timestamp,
        traffic.method,
        traffic.url,
        traffic.host,
        traffic.path,
        JSON.stringify(traffic.requestHeaders),
        truncate(traffic.requestBody),
        traffic.statusCode,
        JSON.stringify(traffic.responseHeaders),
        truncate(traffic.responseBody),
        traffic.durationMs,
        traffic.requestSize,
        traffic.responseSize,
        traffic.isHttps ? 1 : 0,
        traffic.clientIp,
      );

    return {
      ...traffic,
      requestBody: truncate(traffic.requestBody),
      responseBody: truncate(traffic.responseBody),
      id: Number(result.lastInsertRowid),
      sessionId,
    };
  }

  listTraffic(sessionId: number): TrafficRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM traffic_records WHERE session_id = ? ORDER BY id ASC')
      .all(sessionId) as TrafficRow[];

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      method: row.method,
      url: row.url,
      host: row.host,
      path: row.path,
      requestHeaders: JSON.parse(row.request_headers) as Record<string, string>,
      requestBody: row.request_body,
      statusCode: row.status_code,
      responseHeaders: JSON.parse(row.response_headers) as Record<string, string>,
      responseBody: row.response_body,
      durationMs: row.duration_ms,
      requestSize: row.request_size,
      responseSize: row.response_size,
      isHttps: row.is_https === 1,
      clientIp: row.client_ip,
    }));
  }

  getTrafficById(recordId: number): TrafficRecord | null {
    const row = this.db.prepare('SELECT * FROM traffic_records WHERE id = ?').get(recordId) as
      | TrafficRow
      | undefined;
    if (!row) return null;

    return {
      id: row.id,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      method: row.method,
      url: row.url,
      host: row.host,
      path: row.path,
      requestHeaders: JSON.parse(row.request_headers) as Record<string, string>,
      requestBody: row.request_body,
      statusCode: row.status_code,
      responseHeaders: JSON.parse(row.response_headers) as Record<string, string>,
      responseBody: row.response_body,
      durationMs: row.duration_ms,
      requestSize: row.request_size,
      responseSize: row.response_size,
      isHttps: row.is_https === 1,
      clientIp: row.client_ip,
    };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd ~/Dev/HttpProxyRecord && npx vitest run tests/recordStore.test.ts
```

Expected: PASS (6개 테스트)

> better-sqlite3 NODE_MODULE_VERSION 에러가 나면: vitest는 시스템 Node로 도는데 better-sqlite3가 Electron용으로 리빌드된 상태라서 발생.
> 해결: `npm rebuild better-sqlite3` 후 vitest 실행. Electron 실행 전에는 다시 `npm run postinstall`.
> 이 전환이 번거로우므로 `package.json` scripts에 추가:
> ```json
> "test": "npm rebuild better-sqlite3 > /dev/null 2>&1; vitest run",
> "dev": "electron-builder install-app-deps > /dev/null 2>&1; electron-vite dev",
> ```

- [ ] **Step 5: 커밋**

```bash
cd ~/Dev/HttpProxyRecord && git add src/main/store/recordStore.ts tests/recordStore.test.ts package.json && git commit -m "기능: SQLite 세션/트래픽 저장소 RecordStore 추가"
```

---

## Task 4: ProxyEngine — HTTP 프록시 + 트래픽 캡처

**Files:**
- Create: `src/main/proxy/proxyEngine.ts`
- Test: `tests/proxyEngine.http.test.ts`

- [ ] **Step 1: 실패 테스트 작성 (HTTP 프록시 경유 + 캡처 검증)**

`tests/proxyEngine.http.test.ts`:

```typescript
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CertManager } from '../src/main/proxy/certManager';
import { ProxyEngine } from '../src/main/proxy/proxyEngine';
import type { CapturedTraffic } from '../src/shared/types';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** 테스트용 echo 서버: 요청 메서드/경로/바디를 JSON으로 돌려준다 */
const startEchoServer = (): Promise<{ server: http.Server; port: number }> =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json', 'x-echo': 'true' });
        res.end(
          JSON.stringify({
            method: req.method,
            url: req.url,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as AddressInfo).port });
    });
  });

/** 프록시를 경유해 HTTP 요청을 보낸다 (절대 URL 방식) */
const requestViaProxy = (
  proxyPort: number,
  targetUrl: string,
  options: { method?: string; body?: string } = {},
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> =>
  new Promise((resolve, reject) => {
    const target = new URL(targetUrl);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: proxyPort,
        path: targetUrl,
        method: options.method ?? 'GET',
        headers: { host: target.host, 'content-type': 'application/json' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString(),
            headers: res.headers,
          }),
        );
      },
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });

describe('ProxyEngine - HTTP', () => {
  let tempDir: string;
  let engine: ProxyEngine;
  let echoServer: http.Server;
  let echoPort: number;
  let proxyPort: number;
  let captured: CapturedTraffic[];

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpr-proxy-test-'));
    const certManager = new CertManager(tempDir);
    certManager.loadOrCreateRootCa();

    const echo = await startEchoServer();
    echoServer = echo.server;
    echoPort = echo.port;

    captured = [];
    engine = new ProxyEngine(certManager);
    engine.onTraffic((traffic) => captured.push(traffic));
    proxyPort = await engine.start(0);
  });

  afterEach(async () => {
    await engine.stop();
    echoServer.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('GET 요청을 중계하고 응답을 그대로 돌려준다', async () => {
    const result = await requestViaProxy(proxyPort, `http://127.0.0.1:${echoPort}/users?page=1`);

    expect(result.status).toBe(200);
    expect(result.headers['x-echo']).toBe('true');
    const parsed = JSON.parse(result.body) as { method: string; url: string };
    expect(parsed.method).toBe('GET');
    expect(parsed.url).toBe('/users?page=1');
  });

  it('POST 바디를 그대로 전달한다', async () => {
    const result = await requestViaProxy(proxyPort, `http://127.0.0.1:${echoPort}/items`, {
      method: 'POST',
      body: '{"name":"테스트"}',
    });

    expect(result.status).toBe(200);
    const parsed = JSON.parse(result.body) as { body: string };
    expect(parsed.body).toBe('{"name":"테스트"}');
  });

  it('요청/응답을 캡처해 리스너에 전달한다', async () => {
    await requestViaProxy(proxyPort, `http://127.0.0.1:${echoPort}/capture-me`, {
      method: 'POST',
      body: '{"k":"v"}',
    });

    expect(captured).toHaveLength(1);
    const traffic = captured[0];
    expect(traffic.method).toBe('POST');
    expect(traffic.host).toBe(`127.0.0.1:${echoPort}`);
    expect(traffic.path).toBe('/capture-me');
    expect(traffic.url).toBe(`http://127.0.0.1:${echoPort}/capture-me`);
    expect(traffic.statusCode).toBe(200);
    expect(traffic.requestBody).toBe('{"k":"v"}');
    expect(traffic.responseBody).toContain('"k\\":\\"v\\"'.replace('\\\\', '\\') /* echo 응답에 바디 포함 */);
    expect(traffic.isHttps).toBe(false);
    expect(traffic.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('연결할 수 없는 대상이면 502를 반환한다', async () => {
    const result = await requestViaProxy(proxyPort, 'http://127.0.0.1:1/unreachable');

    expect(result.status).toBe(502);
  });
});
```

> 참고: 세 번째 테스트의 `responseBody` 검증은 echo 서버가 바디를 JSON 안에 되돌려주므로 단순히 `expect(traffic.responseBody).toContain('k')`로 작성해도 충분하다. 구현 시 위 라인이 어색하면 `expect(JSON.parse(traffic.responseBody!).body).toBe('{"k":"v"}')`로 바꾼다.

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd ~/Dev/HttpProxyRecord && npx vitest run tests/proxyEngine.http.test.ts
```

Expected: FAIL — `proxyEngine.ts` 모듈 없음

- [ ] **Step 3: ProxyEngine 구현 (HTTP 중계 + 캡처, HTTPS는 Task 5)**

`src/main/proxy/proxyEngine.ts`:

```typescript
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import type { AddressInfo } from 'node:net';
import type { CapturedTraffic } from '../../shared/types';
import type { CertManager } from './certManager';

export type TrafficListener = (traffic: CapturedTraffic) => void;

type ForwardTarget = {
  hostname: string;
  port: string;
  path: string;
  isHttps: boolean;
};

/** 클라이언트 요청에서 제거할 hop-by-hop 헤더 */
const HOP_BY_HOP_HEADERS = ['proxy-connection', 'connection', 'keep-alive', 'upgrade', 'te', 'trailer'];

export class ProxyEngine {
  private httpServer: http.Server | null = null;
  private mitmServer: https.Server | null = null;
  private mitmPort = 0;
  private readonly listeners: TrafficListener[] = [];

  constructor(private readonly certManager: CertManager) {}

  onTraffic(listener: TrafficListener): void {
    this.listeners.push(listener);
  }

  /** @returns 실제 리스닝 포트 (port=0이면 OS가 할당) */
  async start(port: number): Promise<number> {
    await this.startMitmServer();
    return this.startHttpServer(port);
  }

  async stop(): Promise<void> {
    await Promise.all([
      new Promise<void>((resolve) => {
        if (this.httpServer) this.httpServer.close(() => resolve());
        else resolve();
      }),
      new Promise<void>((resolve) => {
        if (this.mitmServer) this.mitmServer.close(() => resolve());
        else resolve();
      }),
    ]);
    this.httpServer = null;
    this.mitmServer = null;
  }

  get isRunning(): boolean {
    return this.httpServer !== null;
  }

  private emit(traffic: CapturedTraffic): void {
    for (const listener of this.listeners) listener(traffic);
  }

  // ─────────────────────────── HTTP 프록시 서버 ───────────────────────────

  private startHttpServer(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.handlePlainRequest(req, res));
      server.on('connect', (req, socket, head) => this.handleConnect(req, socket as net.Socket, head));
      server.on('error', reject);
      server.listen(port, () => {
        this.httpServer = server;
        resolve((server.address() as AddressInfo).port);
      });
    });
  }

  /** 평문 HTTP 프록시 요청 (요청 라인에 절대 URL이 들어옴) */
  private handlePlainRequest(clientReq: http.IncomingMessage, clientRes: http.ServerResponse): void {
    let url: URL;
    try {
      url = new URL(clientReq.url ?? '');
    } catch {
      clientRes.writeHead(400);
      clientRes.end('Invalid proxy request URL');
      return;
    }

    this.forwardRequest(clientReq, clientRes, {
      hostname: url.hostname,
      port: url.port || '80',
      path: `${url.pathname}${url.search}`,
      isHttps: false,
    });
  }

  // ─────────────────────────── HTTPS MITM (Task 5에서 CONNECT 연결) ───────────────────────────

  /** 내부 MITM HTTPS 서버: CONNECT 터널의 TLS를 종단해 복호화한다 */
  private startMitmServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const fallbackCert = this.certManager.getCertForHost('localhost');
      const server = https.createServer(
        {
          key: fallbackCert.key,
          cert: fallbackCert.cert,
          SNICallback: (servername, callback) => {
            try {
              const pair = this.certManager.getCertForHost(servername);
              callback(null, tls.createSecureContext({ key: pair.key, cert: pair.cert }));
            } catch (error) {
              callback(error as Error);
            }
          },
        },
        (req, res) => this.handleDecryptedRequest(req, res),
      );
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        this.mitmPort = (server.address() as AddressInfo).port;
        this.mitmServer = server;
        resolve();
      });
    });
  }

  /** MITM 서버에서 복호화된 HTTPS 요청 — 실제 서버로 다시 TLS로 전달 */
  private handleDecryptedRequest(clientReq: http.IncomingMessage, clientRes: http.ServerResponse): void {
    const hostHeader = clientReq.headers.host ?? '';
    const [hostname, portString] = hostHeader.split(':');

    this.forwardRequest(clientReq, clientRes, {
      hostname,
      port: portString || '443',
      path: clientReq.url ?? '/',
      isHttps: true,
    });
  }

  /** CONNECT 요청: 클라이언트 소켓을 내부 MITM 서버로 파이프 */
  private handleConnect(req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer): void {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

    const serverSocket = net.connect(this.mitmPort, '127.0.0.1', () => {
      if (head.length > 0) serverSocket.write(head);
      clientSocket.pipe(serverSocket);
      serverSocket.pipe(clientSocket);
    });

    serverSocket.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => serverSocket.destroy());
  }

  // ─────────────────────────── 공통 중계 + 캡처 ───────────────────────────

  private forwardRequest(
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
    target: ForwardTarget,
  ): void {
    const startedAt = Date.now();
    const requestChunks: Buffer[] = [];
    const responseChunks: Buffer[] = [];

    const outboundHeaders: Record<string, string | string[] | undefined> = { ...clientReq.headers };
    for (const headerName of HOP_BY_HOP_HEADERS) {
      delete outboundHeaders[headerName];
    }
    outboundHeaders.host = `${target.hostname}${this.isDefaultPort(target) ? '' : `:${target.port}`}`;

    const requestFn = target.isHttps ? https.request : http.request;
    const proxyReq = requestFn(
      {
        hostname: target.hostname,
        port: Number(target.port),
        path: target.path,
        method: clientReq.method,
        headers: outboundHeaders,
        // 디버깅 프록시 특성상 업스트림 인증서 검증은 끈다 (사설 인증서 API 대응)
        rejectUnauthorized: false,
      },
      (proxyRes) => {
        clientRes.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.on('data', (chunk: Buffer) => {
          responseChunks.push(chunk);
          clientRes.write(chunk);
        });
        proxyRes.on('end', () => {
          clientRes.end();
          this.emit(
            this.buildTraffic(clientReq, proxyRes.statusCode ?? 0, proxyRes.headers, target, {
              requestChunks,
              responseChunks,
              startedAt,
            }),
          );
        });
      },
    );

    proxyReq.on('error', (error: Error) => {
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      }
      clientRes.end(`프록시 중계 실패: ${error.message}`);
      this.emit(
        this.buildTraffic(clientReq, 502, {}, target, { requestChunks, responseChunks, startedAt }),
      );
    });

    clientReq.on('data', (chunk: Buffer) => {
      requestChunks.push(chunk);
      proxyReq.write(chunk);
    });
    clientReq.on('end', () => proxyReq.end());
    clientReq.on('error', () => proxyReq.destroy());
  }

  private isDefaultPort(target: ForwardTarget): boolean {
    return (target.isHttps && target.port === '443') || (!target.isHttps && target.port === '80');
  }

  private buildTraffic(
    clientReq: http.IncomingMessage,
    statusCode: number,
    responseHeaders: http.IncomingHttpHeaders,
    target: ForwardTarget,
    data: { requestChunks: Buffer[]; responseChunks: Buffer[]; startedAt: number },
  ): CapturedTraffic {
    const requestBodyBuffer = Buffer.concat(data.requestChunks);
    const responseBodyBuffer = Buffer.concat(data.responseChunks);
    const hostWithPort = `${target.hostname}${this.isDefaultPort(target) ? '' : `:${target.port}`}`;
    const scheme = target.isHttps ? 'https' : 'http';

    return {
      timestamp: new Date(data.startedAt).toISOString(),
      method: clientReq.method ?? 'GET',
      url: `${scheme}://${hostWithPort}${target.path}`,
      host: hostWithPort,
      path: target.path,
      requestHeaders: this.normalizeHeaders(clientReq.headers),
      requestBody: requestBodyBuffer.length > 0 ? requestBodyBuffer.toString('utf-8') : null,
      statusCode,
      responseHeaders: this.normalizeHeaders(responseHeaders),
      responseBody: responseBodyBuffer.length > 0 ? responseBodyBuffer.toString('utf-8') : null,
      durationMs: Date.now() - data.startedAt,
      requestSize: requestBodyBuffer.length,
      responseSize: responseBodyBuffer.length,
      isHttps: target.isHttps,
      clientIp: clientReq.socket.remoteAddress ?? '',
    };
  }

  private normalizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
      if (value === undefined) continue;
      normalized[name] = Array.isArray(value) ? value.join(', ') : value;
    }
    return normalized;
  }
}
```

- [ ] **Step 4: 테스트의 responseBody 검증 라인 정리**

Step 1 테스트 코드에서 어색했던 라인을 다음으로 교체:

```typescript
    expect(JSON.parse(traffic.responseBody!).body).toBe('{"k":"v"}');
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd ~/Dev/HttpProxyRecord && npx vitest run tests/proxyEngine.http.test.ts
```

Expected: PASS (4개 테스트)

- [ ] **Step 6: 커밋**

```bash
cd ~/Dev/HttpProxyRecord && git add src/main/proxy/proxyEngine.ts tests/proxyEngine.http.test.ts && git commit -m "기능: HTTP 프록시 중계 및 트래픽 캡처 ProxyEngine 추가"
```

---

## Task 5: ProxyEngine — HTTPS MITM 검증

Task 4에서 MITM 서버 코드(startMitmServer, handleConnect, handleDecryptedRequest)는 이미 구현됐다.
이 Task는 **HTTPS 복호화가 실제로 동작하는지 통합 테스트로 검증**한다.

**Files:**
- Test: `tests/proxyEngine.https.test.ts`

- [ ] **Step 1: HTTPS MITM 통합 테스트 작성**

`tests/proxyEngine.https.test.ts`:

```typescript
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import forge from 'node-forge';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CertManager } from '../src/main/proxy/certManager';
import { ProxyEngine } from '../src/main/proxy/proxyEngine';
import type { CapturedTraffic } from '../src/shared/types';

/** 테스트용 자가서명 인증서 생성 (대상 HTTPS echo 서버용) */
const createSelfSignedCert = (commonName: string): { key: string; cert: string } => {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);
  const attrs = [{ name: 'commonName', value: commonName }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([{ name: 'subjectAltName', altNames: [{ type: 2, value: commonName }] }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert),
  };
};

/** HTTPS echo 서버 */
const startHttpsEchoServer = (): Promise<{ server: https.Server; port: number }> =>
  new Promise((resolve) => {
    const selfSigned = createSelfSignedCert('localhost');
    const server = https.createServer({ key: selfSigned.key, cert: selfSigned.cert }, (req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ method: req.method, url: req.url, secure: true }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as AddressInfo).port });
    });
  });

/**
 * 프록시에 CONNECT를 보낸 뒤, 그 터널 위에서 TLS 핸드셰이크를 하고 HTTPS 요청을 보낸다.
 * 클라이언트는 프록시의 루트 CA를 신뢰한다 (MITM 인증서 검증).
 */
const requestHttpsViaProxy = (
  proxyPort: number,
  targetHost: string,
  targetPort: number,
  requestPath: string,
  rootCaPem: string,
): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    // 1. 프록시에 CONNECT
    const proxySocket = net.connect(proxyPort, '127.0.0.1', () => {
      proxySocket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`,
      );
    });

    proxySocket.once('data', (data: Buffer) => {
      if (!data.toString().startsWith('HTTP/1.1 200')) {
        reject(new Error(`CONNECT 실패: ${data.toString()}`));
        return;
      }

      // 2. 터널 위에서 TLS 핸드셰이크 — 프록시가 제시하는 인증서는 루트 CA로 검증돼야 한다
      const tlsSocket = tls.connect(
        {
          socket: proxySocket,
          servername: targetHost,
          ca: [rootCaPem],
          rejectUnauthorized: true,
        },
        () => {
          // 3. 복호화된 터널로 HTTP 요청 전송
          tlsSocket.write(
            `GET ${requestPath} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nConnection: close\r\n\r\n`,
          );
        },
      );

      const responseChunks: Buffer[] = [];
      tlsSocket.on('data', (chunk: Buffer) => responseChunks.push(chunk));
      tlsSocket.on('end', () => {
        const raw = Buffer.concat(responseChunks).toString();
        const [headerPart, ...bodyParts] = raw.split('\r\n\r\n');
        const statusLine = headerPart.split('\r\n')[0];
        const status = Number(statusLine.split(' ')[1]);
        resolve({ status, body: bodyParts.join('\r\n\r\n') });
      });
      tlsSocket.on('error', reject);
    });

    proxySocket.on('error', reject);
  });

describe('ProxyEngine - HTTPS MITM', () => {
  let tempDir: string;
  let engine: ProxyEngine;
  let rootCaPem: string;
  let echoServer: https.Server;
  let echoPort: number;
  let proxyPort: number;
  let captured: CapturedTraffic[];

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpr-mitm-test-'));
    const certManager = new CertManager(tempDir);
    rootCaPem = certManager.loadOrCreateRootCa().cert;

    const echo = await startHttpsEchoServer();
    echoServer = echo.server;
    echoPort = echo.port;

    captured = [];
    engine = new ProxyEngine(certManager);
    engine.onTraffic((traffic) => captured.push(traffic));
    proxyPort = await engine.start(0);
  });

  afterEach(async () => {
    await engine.stop();
    echoServer.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('CONNECT 터널을 MITM해 HTTPS 요청/응답을 복호화하고 중계한다', async () => {
    const result = await requestHttpsViaProxy(proxyPort, 'localhost', echoPort, '/secure-api', rootCaPem);

    expect(result.status).toBe(200);
    expect(result.body).toContain('"secure":true');
  });

  it('복호화된 HTTPS 트래픽을 캡처한다', async () => {
    await requestHttpsViaProxy(proxyPort, 'localhost', echoPort, '/secure-capture', rootCaPem);

    // 캡처는 비동기로 끝나므로 잠시 대기
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(captured.length).toBeGreaterThanOrEqual(1);
    const traffic = captured[0];
    expect(traffic.isHttps).toBe(true);
    expect(traffic.path).toBe('/secure-capture');
    expect(traffic.statusCode).toBe(200);
    expect(traffic.responseBody).toContain('"secure":true');
  });
});
```

- [ ] **Step 2: 테스트 실행**

```bash
cd ~/Dev/HttpProxyRecord && npx vitest run tests/proxyEngine.https.test.ts
```

Expected: PASS — Task 4에서 MITM 코드가 이미 구현돼 있으므로 통과해야 한다.
FAIL이면 다음을 점검:
1. `handleDecryptedRequest`에서 host 헤더 파싱 (포트 포함 형태 `localhost:54321`)
2. MITM 서버로 향하는 요청의 대상 포트 — 복호화된 요청은 host 헤더의 포트로 다시 나가야 한다 (`localhost:${echoPort}`)
3. `rejectUnauthorized: false`가 업스트림 요청에 설정됐는지 (echo 서버가 자가서명이므로)

- [ ] **Step 3: 전체 테스트 회귀 확인**

```bash
cd ~/Dev/HttpProxyRecord && npm run test
```

Expected: PASS (certManager 5개 + recordStore 6개 + proxy http 4개 + proxy https 2개)

- [ ] **Step 4: 커밋**

```bash
cd ~/Dev/HttpProxyRecord && git add tests/proxyEngine.https.test.ts && git commit -m "테스트: HTTPS MITM 복호화 통합 테스트 추가"
```

---

## Task 6: Main 프로세스 통합 + IPC + 녹화 제어

**Files:**
- Create: `src/main/appContext.ts`
- Create: `src/main/ipcHandlers.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Create: `src/preload/index.d.ts`

- [ ] **Step 1: AppContext 작성 (엔진/저장소 수명주기 관리)**

`src/main/appContext.ts`:

```typescript
import { app } from 'electron';
import path from 'node:path';
import { CertManager } from './proxy/certManager';
import { ProxyEngine } from './proxy/proxyEngine';
import { RecordStore } from './store/recordStore';
import type { CapturedTraffic, ProxyStatus } from '../shared/types';

export type TrafficBroadcaster = (record: unknown) => void;

/**
 * Main 프로세스의 전역 컨텍스트.
 * 프록시/저장소/인증서를 초기화하고 녹화 상태를 관리한다.
 */
export class AppContext {
  readonly certManager: CertManager;
  readonly recordStore: RecordStore;
  readonly proxyEngine: ProxyEngine;

  private proxyPort: number | null = null;
  private recordingSessionId: number | null = null;
  private broadcaster: TrafficBroadcaster | null = null;

  constructor() {
    const userDataDir = app.getPath('userData');
    this.certManager = new CertManager(path.join(userDataDir, 'certs'));
    this.recordStore = new RecordStore(path.join(userDataDir, 'records.db'));
    this.proxyEngine = new ProxyEngine(this.certManager);

    this.certManager.loadOrCreateRootCa();
    this.proxyEngine.onTraffic((traffic) => this.handleTraffic(traffic));
  }

  /** Renderer로 실시간 트래픽을 보낼 콜백 등록 */
  setBroadcaster(broadcaster: TrafficBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  private handleTraffic(traffic: CapturedTraffic): void {
    if (this.recordingSessionId === null) return;

    const record = this.recordStore.insertTraffic(this.recordingSessionId, traffic);
    this.broadcaster?.(record);
  }

  /** 녹화 시작: 새 세션 생성 + 프록시 시작 */
  async startRecording(sessionName: string, port: number): Promise<ProxyStatus> {
    if (this.proxyEngine.isRunning) {
      throw new Error('이미 녹화가 진행 중입니다. 먼저 중지해 주세요.');
    }

    const session = this.recordStore.createSession(sessionName);
    const actualPort = await this.proxyEngine.start(port);
    this.proxyPort = actualPort;
    this.recordingSessionId = session.id;

    return this.getProxyStatus();
  }

  /** 녹화 중지: 프록시 중지 + 세션 종료 */
  async stopRecording(): Promise<ProxyStatus> {
    if (this.recordingSessionId !== null) {
      this.recordStore.endSession(this.recordingSessionId);
    }
    await this.proxyEngine.stop();
    this.proxyPort = null;
    this.recordingSessionId = null;

    return this.getProxyStatus();
  }

  getProxyStatus(): ProxyStatus {
    return {
      running: this.proxyEngine.isRunning,
      port: this.proxyPort,
      recordingSessionId: this.recordingSessionId,
    };
  }

  async dispose(): Promise<void> {
    await this.proxyEngine.stop();
    this.recordStore.close();
  }
}
```

- [ ] **Step 2: IPC 핸들러 작성**

`src/main/ipcHandlers.ts`:

```typescript
import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import type { AppContext } from './appContext';

/** 모든 IPC 채널을 등록한다. 채널 이름은 preload의 api와 1:1 대응 */
export const registerIpcHandlers = (context: AppContext, getWindow: () => BrowserWindow | null): void => {
  context.setBroadcaster((record) => {
    getWindow()?.webContents.send('traffic:new', record);
  });

  // ── 프록시/녹화 제어 ──
  ipcMain.handle('proxy:start-recording', async (_event, sessionName: string, port: number) => {
    return context.startRecording(sessionName, port);
  });

  ipcMain.handle('proxy:stop-recording', async () => {
    return context.stopRecording();
  });

  ipcMain.handle('proxy:status', () => {
    return context.getProxyStatus();
  });

  // ── 세션 ──
  ipcMain.handle('session:list', () => {
    return context.recordStore.listSessions();
  });

  ipcMain.handle('session:delete', (_event, sessionId: number) => {
    context.recordStore.deleteSession(sessionId);
    return context.recordStore.listSessions();
  });

  ipcMain.handle('session:traffic', (_event, sessionId: number) => {
    return context.recordStore.listTraffic(sessionId);
  });
};
```

- [ ] **Step 3: main/index.ts에 통합**

`src/main/index.ts` 전체 교체:

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { AppContext } from './appContext';
import { registerIpcHandlers } from './ipcHandlers';

let mainWindow: BrowserWindow | null = null;
let appContext: AppContext | null = null;

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'HttpProxyRecord',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

void app.whenReady().then(() => {
  appContext = new AppContext();
  registerIpcHandlers(appContext, () => mainWindow);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  void appContext?.dispose();
});
```

- [ ] **Step 4: preload API + 타입 선언 작성**

`src/preload/index.ts` 전체 교체:

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import type { ProxyStatus, Session, TrafficRecord } from '../shared/types';

const api = {
  // 프록시/녹화
  startRecording: (sessionName: string, port: number): Promise<ProxyStatus> =>
    ipcRenderer.invoke('proxy:start-recording', sessionName, port),
  stopRecording: (): Promise<ProxyStatus> => ipcRenderer.invoke('proxy:stop-recording'),
  getProxyStatus: (): Promise<ProxyStatus> => ipcRenderer.invoke('proxy:status'),

  // 실시간 트래픽 구독
  onTraffic: (callback: (record: TrafficRecord) => void): (() => void) => {
    const listener = (_event: unknown, record: TrafficRecord): void => callback(record);
    ipcRenderer.on('traffic:new', listener);
    return () => ipcRenderer.removeListener('traffic:new', listener);
  },

  // 세션
  listSessions: (): Promise<Session[]> => ipcRenderer.invoke('session:list'),
  deleteSession: (sessionId: number): Promise<Session[]> => ipcRenderer.invoke('session:delete', sessionId),
  getSessionTraffic: (sessionId: number): Promise<TrafficRecord[]> =>
    ipcRenderer.invoke('session:traffic', sessionId),
};

export type RendererApi = typeof api;

contextBridge.exposeInMainWorld('api', api);
```

`src/preload/index.d.ts`:

```typescript
import type { RendererApi } from './index';

declare global {
  interface Window {
    api: RendererApi;
  }
}

export {};
```

- [ ] **Step 5: 빌드/lint 확인**

```bash
cd ~/Dev/HttpProxyRecord && npm run build && npm run lint && npm run test
```

Expected: 빌드/lint/테스트 전부 PASS

- [ ] **Step 6: 커밋**

```bash
cd ~/Dev/HttpProxyRecord && git add src/main src/preload && git commit -m "기능: Main 프로세스 통합(AppContext)과 IPC 핸들러/preload API 추가"
```

---

## Task 7: UI — 앱 레이아웃 + 세션 사이드바 + 녹화 제어

**Files:**
- Create: `src/renderer/src/services/ipc.ts`
- Create: `src/renderer/src/hooks/useProxyControl.ts`
- Create: `src/renderer/src/hooks/useSessions.ts`
- Create: `src/renderer/src/components/TopToolbar.tsx`
- Create: `src/renderer/src/components/SessionSidebar.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: IPC 서비스 래퍼 작성**

`src/renderer/src/services/ipc.ts`:

```typescript
import type { ProxyStatus, Session, TrafficRecord } from '../../../shared/types';

/** preload가 노출한 window.api 래퍼 — 컴포넌트는 이 모듈만 사용한다 */
export const ipc = {
  startRecording: (sessionName: string, port: number): Promise<ProxyStatus> =>
    window.api.startRecording(sessionName, port),
  stopRecording: (): Promise<ProxyStatus> => window.api.stopRecording(),
  getProxyStatus: (): Promise<ProxyStatus> => window.api.getProxyStatus(),
  onTraffic: (callback: (record: TrafficRecord) => void): (() => void) => window.api.onTraffic(callback),
  listSessions: (): Promise<Session[]> => window.api.listSessions(),
  deleteSession: (sessionId: number): Promise<Session[]> => window.api.deleteSession(sessionId),
  getSessionTraffic: (sessionId: number): Promise<TrafficRecord[]> => window.api.getSessionTraffic(sessionId),
};
```

> `tsconfig.web.json`의 include에 `src/preload/index.d.ts`가 들어 있어 `window.api` 타입이 인식된다.

- [ ] **Step 2: 훅 작성**

`src/renderer/src/hooks/useProxyControl.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { ipc } from '../services/ipc';
import type { ProxyStatus } from '../../../shared/types';

const DEFAULT_PROXY_PORT = 8888;

type UseProxyControlResult = {
  status: ProxyStatus;
  startRecording: (sessionName: string) => Promise<void>;
  stopRecording: () => Promise<void>;
  error: string | null;
};

export const useProxyControl = (onRecordingChanged: () => void): UseProxyControlResult => {
  const [status, setStatus] = useState<ProxyStatus>({ running: false, port: null, recordingSessionId: null });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void ipc.getProxyStatus().then(setStatus);
  }, []);

  const startRecording = useCallback(
    async (sessionName: string) => {
      setError(null);
      try {
        const nextStatus = await ipc.startRecording(sessionName, DEFAULT_PROXY_PORT);
        setStatus(nextStatus);
        onRecordingChanged();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '녹화 시작에 실패했어요');
      }
    },
    [onRecordingChanged],
  );

  const stopRecording = useCallback(async () => {
    setError(null);
    try {
      const nextStatus = await ipc.stopRecording();
      setStatus(nextStatus);
      onRecordingChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '녹화 중지에 실패했어요');
    }
  }, [onRecordingChanged]);

  return { status, startRecording, stopRecording, error };
};
```

`src/renderer/src/hooks/useSessions.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { ipc } from '../services/ipc';
import type { Session } from '../../../shared/types';

type UseSessionsResult = {
  sessions: Session[];
  reload: () => Promise<void>;
  remove: (sessionId: number) => Promise<void>;
};

export const useSessions = (): UseSessionsResult => {
  const [sessions, setSessions] = useState<Session[]>([]);

  const reload = useCallback(async () => {
    setSessions(await ipc.listSessions());
  }, []);

  const remove = useCallback(async (sessionId: number) => {
    setSessions(await ipc.deleteSession(sessionId));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { sessions, reload, remove };
};
```

- [ ] **Step 3: TopToolbar / SessionSidebar 컴포넌트 작성**

`src/renderer/src/components/TopToolbar.tsx`:

```typescript
import { useState } from 'react';
import { Alert, Button, Input, Space, Tag } from 'antd';
import { PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import type { ProxyStatus } from '../../../shared/types';

type TopToolbarProps = {
  status: ProxyStatus;
  error: string | null;
  onStart: (sessionName: string) => void;
  onStop: () => void;
};

export const TopToolbar = ({ status, error, onStart, onStop }: TopToolbarProps) => {
  const [sessionName, setSessionName] = useState('');

  const handleStart = () => {
    const name = sessionName.trim() || `세션 ${new Date().toLocaleString('ko-KR')}`;
    onStart(name);
    setSessionName('');
  };

  return (
    <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0' }}>
      <Space>
        {status.running ? (
          <Button danger icon={<StopOutlined />} onClick={onStop}>
            녹화 중지
          </Button>
        ) : (
          <>
            <Input
              placeholder="세션 이름 (비우면 자동 생성)"
              value={sessionName}
              onChange={(event) => setSessionName(event.target.value)}
              style={{ width: 260 }}
              onPressEnter={handleStart}
            />
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStart}>
              녹화 시작
            </Button>
          </>
        )}
        {status.running && status.port !== null && (
          <Tag color="green">프록시 실행 중 — 127.0.0.1:{status.port}</Tag>
        )}
      </Space>
      {error && <Alert type="error" message={error} style={{ marginTop: 8 }} showIcon closable />}
    </div>
  );
};
```

`src/renderer/src/components/SessionSidebar.tsx`:

```typescript
import { List, Button, Popconfirm, Typography, Tag } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { Session } from '../../../shared/types';

type SessionSidebarProps = {
  sessions: Session[];
  selectedSessionId: number | null;
  recordingSessionId: number | null;
  onSelect: (sessionId: number) => void;
  onDelete: (sessionId: number) => void;
};

export const SessionSidebar = ({
  sessions,
  selectedSessionId,
  recordingSessionId,
  onSelect,
  onDelete,
}: SessionSidebarProps) => {
  return (
    <div style={{ width: 280, borderRight: '1px solid #f0f0f0', overflow: 'auto' }}>
      <Typography.Title level={5} style={{ padding: '12px 16px', margin: 0 }}>
        세션
      </Typography.Title>
      <List
        dataSource={sessions}
        locale={{ emptyText: '녹화된 세션이 없어요' }}
        renderItem={(session) => (
          <List.Item
            onClick={() => onSelect(session.id)}
            style={{
              cursor: 'pointer',
              padding: '8px 16px',
              background: session.id === selectedSessionId ? '#e6f4ff' : undefined,
            }}
            actions={[
              <Popconfirm
                key="delete"
                title="이 세션을 삭제할까요?"
                onConfirm={(event) => {
                  event?.stopPropagation();
                  onDelete(session.id);
                }}
                onCancel={(event) => event?.stopPropagation()}
              >
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(event) => event.stopPropagation()}
                />
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={
                <span>
                  {session.name}{' '}
                  {session.id === recordingSessionId && <Tag color="red">녹화 중</Tag>}
                </span>
              }
              description={`${session.recordCount}건 · ${new Date(session.createdAt).toLocaleString('ko-KR')}`}
            />
          </List.Item>
        )}
      />
    </div>
  );
};
```

- [ ] **Step 4: App.tsx 조립**

`src/renderer/src/App.tsx` 전체 교체:

```typescript
import { useCallback, useState } from 'react';
import { ConfigProvider } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { TopToolbar } from './components/TopToolbar';
import { SessionSidebar } from './components/SessionSidebar';
import { useProxyControl } from './hooks/useProxyControl';
import { useSessions } from './hooks/useSessions';

const App = () => {
  const { sessions, reload, remove } = useSessions();
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  const handleRecordingChanged = useCallback(() => {
    void reload();
  }, [reload]);

  const { status, startRecording, stopRecording, error } = useProxyControl(handleRecordingChanged);

  const handleStart = useCallback(
    (sessionName: string) => {
      void startRecording(sessionName).then(() => {
        void reload();
      });
    },
    [startRecording, reload],
  );

  const handleStop = useCallback(() => {
    void stopRecording();
  }, [stopRecording]);

  const handleDelete = useCallback(
    (sessionId: number) => {
      void remove(sessionId);
      if (selectedSessionId === sessionId) setSelectedSessionId(null);
    },
    [remove, selectedSessionId],
  );

  return (
    <ConfigProvider locale={koKR}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <TopToolbar status={status} error={error} onStart={handleStart} onStop={handleStop} />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <SessionSidebar
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            recordingSessionId={status.recordingSessionId}
            onSelect={setSelectedSessionId}
            onDelete={handleDelete}
          />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
            {/* Task 8에서 트래픽 테이블로 교체 */}
            세션을 선택하거나 녹화를 시작하세요
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
};

export default App;
```

antd 아이콘 패키지 설치:

```bash
cd ~/Dev/HttpProxyRecord && npm install @ant-design/icons
```

- [ ] **Step 5: 빌드/lint 확인 + 수동 실행**

```bash
cd ~/Dev/HttpProxyRecord && npm run build && npm run lint
```

Expected: PASS

```bash
cd ~/Dev/HttpProxyRecord && timeout 30 npm run dev || true
```

수동 확인: 앱 창에 툴바(녹화 시작 버튼)와 빈 세션 사이드바가 보인다. "녹화 시작" 클릭 → 세션이 생기고 "프록시 실행 중 — 127.0.0.1:8888" 태그 표시 → "녹화 중지" 클릭 → 정상 중지.

- [ ] **Step 6: 커밋**

```bash
cd ~/Dev/HttpProxyRecord && git add src/renderer package.json package-lock.json && git commit -m "기능: 앱 레이아웃/세션 사이드바/녹화 제어 UI 추가"
```

---

## Task 8: UI — 트래픽 테이블 + 상세 패널

**Files:**
- Create: `src/renderer/src/hooks/useTraffic.ts`
- Create: `src/renderer/src/components/TrafficTable.tsx`
- Create: `src/renderer/src/components/TrafficDetail.tsx`
- Create: `src/renderer/src/components/BodyViewer.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: useTraffic 훅 작성 (실시간 + 세션 조회)**

`src/renderer/src/hooks/useTraffic.ts`:

```typescript
import { useEffect, useState } from 'react';
import { ipc } from '../services/ipc';
import type { TrafficRecord } from '../../../shared/types';

type UseTrafficResult = {
  records: TrafficRecord[];
};

/**
 * 선택된 세션의 트래픽 목록.
 * - 세션 선택 시 저장된 기록을 로드
 * - 그 세션이 녹화 중이면 실시간 트래픽을 이어서 append
 */
export const useTraffic = (selectedSessionId: number | null): UseTrafficResult => {
  const [records, setRecords] = useState<TrafficRecord[]>([]);

  useEffect(() => {
    if (selectedSessionId === null) {
      setRecords([]);
      return;
    }

    let cancelled = false;
    void ipc.getSessionTraffic(selectedSessionId).then((loaded) => {
      if (!cancelled) setRecords(loaded);
    });

    const unsubscribe = ipc.onTraffic((record) => {
      if (record.sessionId === selectedSessionId) {
        setRecords((previous) => [...previous, record]);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [selectedSessionId]);

  return { records };
};
```

- [ ] **Step 2: TrafficTable 작성**

`src/renderer/src/components/TrafficTable.tsx`:

```typescript
import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TrafficRecord } from '../../../shared/types';

const statusColor = (statusCode: number): string => {
  if (statusCode >= 500) return 'red';
  if (statusCode >= 400) return 'orange';
  if (statusCode >= 300) return 'blue';
  return 'green';
};

const methodColor = (method: string): string => {
  const colors: Record<string, string> = {
    GET: 'blue',
    POST: 'green',
    PUT: 'orange',
    PATCH: 'gold',
    DELETE: 'red',
  };
  return colors[method] ?? 'default';
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const columns: ColumnsType<TrafficRecord> = [
  {
    title: '시각',
    dataIndex: 'timestamp',
    width: 90,
    render: (timestamp: string) => new Date(timestamp).toLocaleTimeString('ko-KR', { hour12: false }),
  },
  {
    title: '메서드',
    dataIndex: 'method',
    width: 80,
    render: (method: string) => <Tag color={methodColor(method)}>{method}</Tag>,
  },
  {
    title: '상태',
    dataIndex: 'statusCode',
    width: 70,
    render: (statusCode: number) => <Tag color={statusColor(statusCode)}>{statusCode}</Tag>,
  },
  {
    title: '호스트',
    dataIndex: 'host',
    width: 200,
    ellipsis: true,
  },
  {
    title: '경로',
    dataIndex: 'path',
    ellipsis: true,
  },
  {
    title: '크기',
    dataIndex: 'responseSize',
    width: 80,
    render: (size: number) => formatBytes(size),
  },
  {
    title: '소요',
    dataIndex: 'durationMs',
    width: 80,
    render: (durationMs: number) => `${durationMs}ms`,
  },
];

type TrafficTableProps = {
  records: TrafficRecord[];
  selectedRecordId: number | null;
  onSelect: (record: TrafficRecord) => void;
};

export const TrafficTable = ({ records, selectedRecordId, onSelect }: TrafficTableProps) => {
  return (
    <Table<TrafficRecord>
      rowKey="id"
      dataSource={records}
      columns={columns}
      size="small"
      pagination={false}
      scroll={{ y: 'calc(100vh - 180px)' }}
      virtual
      onRow={(record) => ({
        onClick: () => onSelect(record),
        style: { cursor: 'pointer', background: record.id === selectedRecordId ? '#e6f4ff' : undefined },
      })}
    />
  );
};
```

- [ ] **Step 3: BodyViewer + TrafficDetail 작성**

`src/renderer/src/components/BodyViewer.tsx`:

```typescript
import { useMemo, useState } from 'react';
import { Radio, Typography } from 'antd';

type BodyViewerProps = {
  body: string | null;
  contentType: string | undefined;
};

/** 응답/요청 바디 뷰어 — JSON이면 pretty 모드 지원 */
export const BodyViewer = ({ body, contentType }: BodyViewerProps) => {
  const [mode, setMode] = useState<'pretty' | 'raw'>('pretty');

  const isJson = (contentType ?? '').includes('json');

  const prettyBody = useMemo(() => {
    if (body === null) return null;
    if (!isJson) return body;
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }, [body, isJson]);

  if (body === null || body.length === 0) {
    return <Typography.Text type="secondary">바디 없음</Typography.Text>;
  }

  return (
    <div>
      {isJson && (
        <Radio.Group
          size="small"
          value={mode}
          onChange={(event) => setMode(event.target.value as 'pretty' | 'raw')}
          style={{ marginBottom: 8 }}
        >
          <Radio.Button value="pretty">Pretty</Radio.Button>
          <Radio.Button value="raw">Raw</Radio.Button>
        </Radio.Group>
      )}
      <pre
        style={{
          background: '#fafafa',
          padding: 12,
          borderRadius: 4,
          maxHeight: 400,
          overflow: 'auto',
          fontSize: 12,
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {mode === 'pretty' ? prettyBody : body}
      </pre>
    </div>
  );
};
```

`src/renderer/src/components/TrafficDetail.tsx`:

```typescript
import { Descriptions, Empty, Table, Tabs, Typography } from 'antd';
import type { TrafficRecord } from '../../../shared/types';
import { BodyViewer } from './BodyViewer';

type TrafficDetailProps = {
  record: TrafficRecord | null;
};

const HeaderTable = ({ headers }: { headers: Record<string, string> }) => (
  <Table
    rowKey={(row) => row.name}
    dataSource={Object.entries(headers).map(([name, value]) => ({ name, value }))}
    columns={[
      { title: '이름', dataIndex: 'name', width: 220 },
      { title: '값', dataIndex: 'value', ellipsis: true },
    ]}
    size="small"
    pagination={false}
  />
);

export const TrafficDetail = ({ record }: TrafficDetailProps) => {
  if (!record) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Empty description="트래픽을 선택하세요" />
      </div>
    );
  }

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
      <Typography.Title level={5} style={{ wordBreak: 'break-all' }}>
        {record.method} {record.url}
      </Typography.Title>
      <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="상태">{record.statusCode}</Descriptions.Item>
        <Descriptions.Item label="소요시간">{record.durationMs}ms</Descriptions.Item>
        <Descriptions.Item label="프로토콜">{record.isHttps ? 'HTTPS' : 'HTTP'}</Descriptions.Item>
        <Descriptions.Item label="클라이언트">{record.clientIp}</Descriptions.Item>
      </Descriptions>

      <Tabs
        items={[
          {
            key: 'response',
            label: '응답',
            children: (
              <>
                <Typography.Title level={5}>헤더</Typography.Title>
                <HeaderTable headers={record.responseHeaders} />
                <Typography.Title level={5} style={{ marginTop: 16 }}>
                  바디
                </Typography.Title>
                <BodyViewer body={record.responseBody} contentType={record.responseHeaders['content-type']} />
              </>
            ),
          },
          {
            key: 'request',
            label: '요청',
            children: (
              <>
                <Typography.Title level={5}>헤더</Typography.Title>
                <HeaderTable headers={record.requestHeaders} />
                <Typography.Title level={5} style={{ marginTop: 16 }}>
                  바디
                </Typography.Title>
                <BodyViewer body={record.requestBody} contentType={record.requestHeaders['content-type']} />
              </>
            ),
          },
        ]}
      />
    </div>
  );
};
```

- [ ] **Step 4: App.tsx에 테이블/상세 패널 연결**

`src/renderer/src/App.tsx`에서 placeholder 영역을 교체. import 추가:

```typescript
import { TrafficTable } from './components/TrafficTable';
import { TrafficDetail } from './components/TrafficDetail';
import { useTraffic } from './hooks/useTraffic';
import type { TrafficRecord } from '../../shared/types';
```

컴포넌트 본문에 상태 추가 (`selectedSessionId` 아래):

```typescript
  const { records } = useTraffic(selectedSessionId);
  const [selectedRecord, setSelectedRecord] = useState<TrafficRecord | null>(null);
```

placeholder `<div>` (Task 7에서 "Task 8에서 트래픽 테이블로 교체" 주석이 있는 부분)를 다음으로 교체:

```typescript
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
              <TrafficTable
                records={records}
                selectedRecordId={selectedRecord?.id ?? null}
                onSelect={setSelectedRecord}
              />
            </div>
            <div style={{ width: 480, borderLeft: '1px solid #f0f0f0', overflow: 'hidden' }}>
              <TrafficDetail record={selectedRecord} />
            </div>
          </div>
```

녹화 시작 시 새 세션을 자동 선택하도록 `handleStart` 교체:

```typescript
  const handleStart = useCallback(
    (sessionName: string) => {
      void startRecording(sessionName).then(async () => {
        await reload();
        const currentStatus = await ipc.getProxyStatus();
        if (currentStatus.recordingSessionId !== null) {
          setSelectedSessionId(currentStatus.recordingSessionId);
        }
      });
    },
    [startRecording, reload],
  );
```

`ipc` import 추가:

```typescript
import { ipc } from './services/ipc';
```

- [ ] **Step 5: 빌드/lint + 수동 E2E 확인**

```bash
cd ~/Dev/HttpProxyRecord && npm run build && npm run lint
```

Expected: PASS

수동 확인 (앱 실행 후):

```bash
cd ~/Dev/HttpProxyRecord && npm run dev &
sleep 15
# 앱에서 "녹화 시작" 클릭 후 아래 명령으로 프록시 경유 요청
curl -x http://127.0.0.1:8888 http://httpbin.org/get
curl -x http://127.0.0.1:8888 -k https://httpbin.org/json --proxy-insecure
```

Expected: 앱 트래픽 테이블에 2건이 실시간으로 나타나고, 클릭하면 상세 패널에 헤더/바디 표시.
(HTTPS 요청은 `-k`로 클라이언트 검증을 끄고 테스트 — 시스템에 루트 CA를 설치하기 전이므로)

- [ ] **Step 6: 커밋**

```bash
cd ~/Dev/HttpProxyRecord && git add src/renderer && git commit -m "기능: 트래픽 테이블(실시간)과 요청/응답 상세 패널 추가"
```

---

## Task 9: SystemProxyManager — 시스템 프록시 + 인증서 설치

**Files:**
- Create: `src/main/system/systemProxy.ts`
- Create: `src/main/system/certInstaller.ts`
- Modify: `src/main/ipcHandlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/components/TopToolbar.tsx`
- Modify: `src/renderer/src/App.tsx`
- Test: `tests/systemProxy.test.ts`

- [ ] **Step 1: SystemProxyManager 실패 테스트 작성 (명령어 빌드 로직만 단위 테스트)**

`tests/systemProxy.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildProxyCommands } from '../src/main/system/systemProxy';

describe('buildProxyCommands', () => {
  it('macOS 활성화 명령을 네트워크 서비스별로 만든다', () => {
    const commands = buildProxyCommands('darwin', 'enable', {
      host: '127.0.0.1',
      port: 8888,
      networkServices: ['Wi-Fi', 'Thunderbolt Ethernet'],
    });

    expect(commands).toEqual([
      ['networksetup', ['-setwebproxy', 'Wi-Fi', '127.0.0.1', '8888']],
      ['networksetup', ['-setsecurewebproxy', 'Wi-Fi', '127.0.0.1', '8888']],
      ['networksetup', ['-setwebproxy', 'Thunderbolt Ethernet', '127.0.0.1', '8888']],
      ['networksetup', ['-setsecurewebproxy', 'Thunderbolt Ethernet', '127.0.0.1', '8888']],
    ]);
  });

  it('macOS 비활성화 명령을 만든다', () => {
    const commands = buildProxyCommands('darwin', 'disable', {
      host: '127.0.0.1',
      port: 8888,
      networkServices: ['Wi-Fi'],
    });

    expect(commands).toEqual([
      ['networksetup', ['-setwebproxystate', 'Wi-Fi', 'off']],
      ['networksetup', ['-setsecurewebproxystate', 'Wi-Fi', 'off']],
    ]);
  });

  it('Windows 활성화 명령을 만든다', () => {
    const commands = buildProxyCommands('win32', 'enable', { host: '127.0.0.1', port: 8888, networkServices: [] });

    expect(commands).toEqual([
      [
        'reg',
        [
          'add',
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
          '/v',
          'ProxyEnable',
          '/t',
          'REG_DWORD',
          '/d',
          '1',
          '/f',
        ],
      ],
      [
        'reg',
        [
          'add',
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
          '/v',
          'ProxyServer',
          '/t',
          'REG_SZ',
          '/d',
          '127.0.0.1:8888',
          '/f',
        ],
      ],
    ]);
  });

  it('Windows 비활성화 명령을 만든다', () => {
    const commands = buildProxyCommands('win32', 'disable', { host: '127.0.0.1', port: 8888, networkServices: [] });

    expect(commands).toEqual([
      [
        'reg',
        [
          'add',
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
          '/v',
          'ProxyEnable',
          '/t',
          'REG_DWORD',
          '/d',
          '0',
          '/f',
        ],
      ],
    ]);
  });

  it('지원하지 않는 플랫폼이면 에러를 던진다', () => {
    expect(() =>
      buildProxyCommands('linux', 'enable', { host: '127.0.0.1', port: 8888, networkServices: [] }),
    ).toThrow('지원하지 않는 플랫폼입니다: linux');
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd ~/Dev/HttpProxyRecord && npx vitest run tests/systemProxy.test.ts
```

Expected: FAIL — `systemProxy.ts` 모듈 없음

- [ ] **Step 3: SystemProxyManager 구현**

`src/main/system/systemProxy.ts`:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type ProxyCommandOptions = {
  host: string;
  port: number;
  networkServices: string[];
};

export type ProxyCommand = [command: string, args: string[]];

const WINDOWS_INTERNET_SETTINGS_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

/** 플랫폼별 시스템 프록시 설정/해제 명령어 목록을 만든다 (테스트 가능한 순수 함수) */
export const buildProxyCommands = (
  platform: string,
  action: 'enable' | 'disable',
  options: ProxyCommandOptions,
): ProxyCommand[] => {
  if (platform === 'darwin') {
    return options.networkServices.flatMap((service): ProxyCommand[] =>
      action === 'enable'
        ? [
            ['networksetup', ['-setwebproxy', service, options.host, String(options.port)]],
            ['networksetup', ['-setsecurewebproxy', service, options.host, String(options.port)]],
          ]
        : [
            ['networksetup', ['-setwebproxystate', service, 'off']],
            ['networksetup', ['-setsecurewebproxystate', service, 'off']],
          ],
    );
  }

  if (platform === 'win32') {
    if (action === 'enable') {
      return [
        ['reg', ['add', WINDOWS_INTERNET_SETTINGS_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f']],
        [
          'reg',
          [
            'add',
            WINDOWS_INTERNET_SETTINGS_KEY,
            '/v',
            'ProxyServer',
            '/t',
            'REG_SZ',
            '/d',
            `${options.host}:${options.port}`,
            '/f',
          ],
        ],
      ];
    }
    return [
      ['reg', ['add', WINDOWS_INTERNET_SETTINGS_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f']],
    ];
  }

  throw new Error(`지원하지 않는 플랫폼입니다: ${platform}`);
};

/** 시스템 프록시를 실제로 등록/해제한다 */
export class SystemProxyManager {
  private enabled = false;

  get isEnabled(): boolean {
    return this.enabled;
  }

  async enable(host: string, port: number): Promise<void> {
    const networkServices = process.platform === 'darwin' ? await this.getActiveNetworkServices() : [];
    const commands = buildProxyCommands(process.platform, 'enable', { host, port, networkServices });
    for (const [command, args] of commands) {
      await execFileAsync(command, args);
    }
    this.enabled = true;
  }

  async disable(): Promise<void> {
    const networkServices = process.platform === 'darwin' ? await this.getActiveNetworkServices() : [];
    const commands = buildProxyCommands(process.platform, 'disable', {
      host: '',
      port: 0,
      networkServices,
    });
    for (const [command, args] of commands) {
      await execFileAsync(command, args);
    }
    this.enabled = false;
  }

  /** macOS: 사용 가능한 네트워크 서비스 목록 (비활성 * 표시 제외) */
  private async getActiveNetworkServices(): Promise<string[]> {
    const { stdout } = await execFileAsync('networksetup', ['-listallnetworkservices']);
    return stdout
      .split('\n')
      .slice(1) // 첫 줄은 안내 문구
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('*'));
  }
}
```

`src/main/system/certInstaller.ts`:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { shell } from 'electron';

const execFileAsync = promisify(execFile);

/**
 * 루트 CA를 OS 신뢰 저장소에 설치한다.
 * - macOS: osascript 관리자 권한 프롬프트로 system keychain에 추가
 * - Windows: certutil 사용자 저장소 추가 (확인 다이얼로그 표시됨)
 * - 실패 시: 인증서 파일을 열어 사용자가 수동 설치하도록 안내
 */
export const installRootCa = async (certPath: string): Promise<{ ok: boolean; message: string }> => {
  try {
    if (process.platform === 'darwin') {
      const script = `do shell script "security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain '${certPath}'" with administrator privileges`;
      await execFileAsync('osascript', ['-e', script]);
      return { ok: true, message: '루트 인증서를 시스템 키체인에 설치했어요.' };
    }

    if (process.platform === 'win32') {
      await execFileAsync('certutil', ['-addstore', '-user', 'Root', certPath]);
      return { ok: true, message: '루트 인증서를 사용자 신뢰 저장소에 설치했어요.' };
    }

    return { ok: false, message: `지원하지 않는 플랫폼입니다: ${process.platform}` };
  } catch (error) {
    // 사용자가 암호 입력을 취소했거나 권한 부족 — 인증서 파일을 열어 수동 설치 유도
    await shell.openPath(certPath);
    return {
      ok: false,
      message: `자동 설치에 실패했어요 (${error instanceof Error ? error.message : '알 수 없는 오류'}). 인증서 파일을 열었으니 수동으로 신뢰 설정해 주세요.`,
    };
  }
};
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd ~/Dev/HttpProxyRecord && npx vitest run tests/systemProxy.test.ts
```

Expected: PASS (5개 테스트)

- [ ] **Step 5: IPC + preload + UI 연결**

`src/main/ipcHandlers.ts`에 추가. import 추가:

```typescript
import { SystemProxyManager } from './system/systemProxy';
import { installRootCa } from './system/certInstaller';
```

`registerIpcHandlers` 함수 안에 추가 (세션 핸들러 아래):

```typescript
  // ── 시스템 프록시 / 인증서 ──
  const systemProxyManager = new SystemProxyManager();

  ipcMain.handle('system-proxy:enable', async () => {
    const status = context.getProxyStatus();
    if (!status.running || status.port === null) {
      throw new Error('프록시가 실행 중이 아니에요. 먼저 녹화를 시작해 주세요.');
    }
    await systemProxyManager.enable('127.0.0.1', status.port);
    return { enabled: true };
  });

  ipcMain.handle('system-proxy:disable', async () => {
    await systemProxyManager.disable();
    return { enabled: false };
  });

  ipcMain.handle('system-proxy:status', () => {
    return { enabled: systemProxyManager.isEnabled };
  });

  ipcMain.handle('cert:install', async () => {
    return installRootCa(context.certManager.rootCaCertPath);
  });
```

앱 종료 시 시스템 프록시 자동 해제 — `src/main/index.ts`의 `before-quit` 핸들러를 다음으로 교체:

```typescript
app.on('before-quit', async (event) => {
  event.preventDefault();
  try {
    await appContext?.dispose();
  } finally {
    app.exit(0);
  }
});
```

그리고 `AppContext.dispose()`에서 시스템 프록시도 해제하도록, `appContext.ts`를 수정:

```typescript
  // 클래스 필드 추가
  readonly systemProxyManager = new SystemProxyManager();

  // dispose() 교체
  async dispose(): Promise<void> {
    if (this.systemProxyManager.isEnabled) {
      await this.systemProxyManager.disable().catch(() => undefined);
    }
    await this.proxyEngine.stop();
    this.recordStore.close();
  }
```

(import 추가: `import { SystemProxyManager } from './system/systemProxy';`)

`ipcHandlers.ts`에서는 `const systemProxyManager = new SystemProxyManager();` 대신 `context.systemProxyManager`를 사용하도록 교체.

`src/preload/index.ts`의 api 객체에 추가:

```typescript
  // 시스템 프록시 / 인증서
  enableSystemProxy: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke('system-proxy:enable'),
  disableSystemProxy: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke('system-proxy:disable'),
  getSystemProxyStatus: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke('system-proxy:status'),
  installCert: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('cert:install'),
```

`src/renderer/src/services/ipc.ts`에 추가:

```typescript
  enableSystemProxy: (): Promise<{ enabled: boolean }> => window.api.enableSystemProxy(),
  disableSystemProxy: (): Promise<{ enabled: boolean }> => window.api.disableSystemProxy(),
  getSystemProxyStatus: (): Promise<{ enabled: boolean }> => window.api.getSystemProxyStatus(),
  installCert: (): Promise<{ ok: boolean; message: string }> => window.api.installCert(),
```

`src/renderer/src/components/TopToolbar.tsx`에 시스템 프록시 토글 + 인증서 설치 버튼 추가.
import에 `Switch, message` 추가, props에 콜백 추가:

```typescript
import { Alert, Button, Input, Space, Switch, Tag, message } from 'antd';
import { PlayCircleOutlined, SafetyCertificateOutlined, StopOutlined } from '@ant-design/icons';
```

props 타입에 추가:

```typescript
type TopToolbarProps = {
  status: ProxyStatus;
  error: string | null;
  systemProxyEnabled: boolean;
  onStart: (sessionName: string) => void;
  onStop: () => void;
  onToggleSystemProxy: (enabled: boolean) => void;
  onInstallCert: () => void;
};
```

컴포넌트 props 받는 부분과 JSX의 `<Space>` 안에 추가 (프록시 실행 중 Tag 다음):

```typescript
        <Switch
          checkedChildren="시스템 프록시 ON"
          unCheckedChildren="시스템 프록시 OFF"
          checked={systemProxyEnabled}
          disabled={!status.running}
          onChange={onToggleSystemProxy}
        />
        <Button icon={<SafetyCertificateOutlined />} onClick={onInstallCert}>
          인증서 설치
        </Button>
```

`src/renderer/src/App.tsx`에 상태/핸들러 추가:

```typescript
  const [systemProxyEnabled, setSystemProxyEnabled] = useState(false);

  const handleToggleSystemProxy = useCallback(async (enabled: boolean) => {
    try {
      if (enabled) {
        await ipc.enableSystemProxy();
        setSystemProxyEnabled(true);
      } else {
        await ipc.disableSystemProxy();
        setSystemProxyEnabled(false);
      }
    } catch (caught) {
      void messageApi.error(caught instanceof Error ? caught.message : '시스템 프록시 설정 실패');
    }
  }, [messageApi]);

  const handleInstallCert = useCallback(async () => {
    const result = await ipc.installCert();
    if (result.ok) {
      void messageApi.success(result.message);
    } else {
      void messageApi.warning(result.message);
    }
  }, [messageApi]);
```

antd v6의 message는 hook 방식 사용 — App 컴포넌트 상단에:

```typescript
  const [messageApi, messageContextHolder] = message.useMessage();
```

JSX 최상단 (`<ConfigProvider>` 바로 안)에 `{messageContextHolder}` 추가.
`message` import: `import { ConfigProvider, message } from 'antd';`

TopToolbar 호출부 교체:

```typescript
        <TopToolbar
          status={status}
          error={error}
          systemProxyEnabled={systemProxyEnabled}
          onStart={handleStart}
          onStop={handleStop}
          onToggleSystemProxy={(enabled) => void handleToggleSystemProxy(enabled)}
          onInstallCert={() => void handleInstallCert()}
        />
```

녹화 중지 시 시스템 프록시도 함께 꺼지므로 `handleStop`도 교체:

```typescript
  const handleStop = useCallback(() => {
    void stopRecording().then(() => {
      if (systemProxyEnabled) {
        void ipc.disableSystemProxy().then(() => setSystemProxyEnabled(false));
      }
    });
  }, [stopRecording, systemProxyEnabled]);
```

- [ ] **Step 6: 빌드/lint/테스트 확인**

```bash
cd ~/Dev/HttpProxyRecord && npm run build && npm run lint && npm run test
```

Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
cd ~/Dev/HttpProxyRecord && git add src tests && git commit -m "기능: 시스템 프록시 원클릭 등록/해제와 루트 인증서 설치 추가"
```

---

## Task 10: ReplayServer — 녹화 세션 mock 재생

**Files:**
- Create: `src/main/replay/replayServer.ts`
- Modify: `src/main/appContext.ts`
- Modify: `src/main/ipcHandlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/services/ipc.ts`
- Modify: `src/renderer/src/components/SessionSidebar.tsx`
- Modify: `src/renderer/src/App.tsx`
- Test: `tests/replayServer.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/replayServer.test.ts`:

```typescript
import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { ReplayServer } from '../src/main/replay/replayServer';
import type { TrafficRecord } from '../src/shared/types';

const sampleRecord = (overrides: Partial<TrafficRecord> = {}): TrafficRecord => ({
  id: 1,
  sessionId: 1,
  timestamp: '2026-06-03T10:00:00.000Z',
  method: 'GET',
  url: 'https://api.example.com/users',
  host: 'api.example.com',
  path: '/users',
  requestHeaders: {},
  requestBody: null,
  statusCode: 200,
  responseHeaders: { 'content-type': 'application/json', 'content-length': '12' },
  responseBody: '{"users":[]}',
  durationMs: 10,
  requestSize: 0,
  responseSize: 12,
  isHttps: true,
  clientIp: '127.0.0.1',
  ...overrides,
});

const fetchLocal = (
  port: number,
  requestPath: string,
  method = 'GET',
): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: requestPath, method }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }),
      );
    });
    req.on('error', reject);
    req.end();
  });

describe('ReplayServer', () => {
  let replayServer: ReplayServer;

  afterEach(async () => {
    await replayServer.stop();
  });

  it('녹화된 응답을 메서드+경로 매칭으로 재생한다', async () => {
    replayServer = new ReplayServer();
    const port = await replayServer.start([sampleRecord()], 0);

    const result = await fetchLocal(port, '/users');

    expect(result.status).toBe(200);
    expect(result.body).toBe('{"users":[]}');
  });

  it('같은 경로의 다른 메서드는 각각 매칭된다', async () => {
    replayServer = new ReplayServer();
    const port = await replayServer.start(
      [
        sampleRecord({ id: 1, method: 'GET', responseBody: '{"action":"list"}' }),
        sampleRecord({ id: 2, method: 'POST', statusCode: 201, responseBody: '{"action":"create"}' }),
      ],
      0,
    );

    const getResult = await fetchLocal(port, '/users', 'GET');
    const postResult = await fetchLocal(port, '/users', 'POST');

    expect(getResult.body).toBe('{"action":"list"}');
    expect(postResult.status).toBe(201);
    expect(postResult.body).toBe('{"action":"create"}');
  });

  it('매칭되는 기록이 없으면 404와 안내 메시지를 반환한다', async () => {
    replayServer = new ReplayServer();
    const port = await replayServer.start([sampleRecord()], 0);

    const result = await fetchLocal(port, '/unknown-path');

    expect(result.status).toBe(404);
    expect(JSON.parse(result.body)).toEqual({
      error: '녹화된 응답이 없습니다',
      method: 'GET',
      path: '/unknown-path',
    });
  });

  it('히트/미스 카운트를 집계한다', async () => {
    replayServer = new ReplayServer();
    const port = await replayServer.start([sampleRecord()], 0);

    await fetchLocal(port, '/users');
    await fetchLocal(port, '/users');
    await fetchLocal(port, '/missing');

    const status = replayServer.getStatus();
    expect(status.hitCount).toBe(2);
    expect(status.missCount).toBe(1);
  });

  it('쿼리 스트링이 다른 요청도 경로가 같으면 매칭한다', async () => {
    replayServer = new ReplayServer();
    const port = await replayServer.start([sampleRecord({ path: '/users?page=1' })], 0);

    const result = await fetchLocal(port, '/users?page=2');

    expect(result.status).toBe(200);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd ~/Dev/HttpProxyRecord && npx vitest run tests/replayServer.test.ts
```

Expected: FAIL — `replayServer.ts` 모듈 없음

- [ ] **Step 3: ReplayServer 구현**

`src/main/replay/replayServer.ts`:

```typescript
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { TrafficRecord } from '../../shared/types';

/** 재생 응답에서 제거할 헤더 (재계산되거나 의미 없는 것들) */
const STRIP_RESPONSE_HEADERS = ['content-length', 'transfer-encoding', 'content-encoding', 'connection'];

type ReplayStatusInternal = {
  running: boolean;
  port: number | null;
  hitCount: number;
  missCount: number;
};

/**
 * 녹화된 세션을 mock 서버로 재생한다.
 * 매칭 규칙: "METHOD 경로(쿼리 제외)" 정확 일치 → 쿼리가 다른 요청도 경로가 같으면 매칭
 */
export class ReplayServer {
  private server: http.Server | null = null;
  private port: number | null = null;
  private hitCount = 0;
  private missCount = 0;

  async start(records: TrafficRecord[], port: number): Promise<number> {
    const matchMap = this.buildMatchMap(records);

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const pathWithoutQuery = (req.url ?? '/').split('?')[0];
        const matched = matchMap.get(`${req.method} ${pathWithoutQuery}`);

        if (!matched) {
          this.missCount += 1;
          res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
          res.end(
            JSON.stringify({ error: '녹화된 응답이 없습니다', method: req.method, path: req.url }),
          );
          return;
        }

        this.hitCount += 1;
        const responseHeaders: Record<string, string> = {};
        for (const [name, value] of Object.entries(matched.responseHeaders)) {
          if (STRIP_RESPONSE_HEADERS.includes(name.toLowerCase())) continue;
          responseHeaders[name] = value;
        }
        res.writeHead(matched.statusCode, responseHeaders);
        res.end(matched.responseBody ?? '');
      });

      server.on('error', reject);
      server.listen(port, '127.0.0.1', () => {
        this.server = server;
        this.port = (server.address() as AddressInfo).port;
        this.hitCount = 0;
        this.missCount = 0;
        resolve(this.port);
      });
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (this.server) this.server.close(() => resolve());
      else resolve();
    });
    this.server = null;
    this.port = null;
  }

  getStatus(): ReplayStatusInternal {
    return {
      running: this.server !== null,
      port: this.port,
      hitCount: this.hitCount,
      missCount: this.missCount,
    };
  }

  /** 첫 번째로 기록된 응답이 우선한다 (같은 메서드+경로 중복 시) */
  private buildMatchMap(records: TrafficRecord[]): Map<string, TrafficRecord> {
    const matchMap = new Map<string, TrafficRecord>();
    for (const record of records) {
      const pathWithoutQuery = record.path.split('?')[0];
      const key = `${record.method} ${pathWithoutQuery}`;
      if (!matchMap.has(key)) {
        matchMap.set(key, record);
      }
    }
    return matchMap;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd ~/Dev/HttpProxyRecord && npx vitest run tests/replayServer.test.ts
```

Expected: PASS (5개 테스트)

- [ ] **Step 5: AppContext/IPC/preload/UI 연결**

`src/main/appContext.ts`에 추가:

```typescript
// import 추가
import { ReplayServer } from './replay/replayServer';
import type { ReplayStatus } from '../shared/types';

// 클래스 필드 추가
  readonly replayServer = new ReplayServer();
  private replaySessionId: number | null = null;

// 메서드 추가
  async startReplay(sessionId: number, port: number): Promise<ReplayStatus> {
    const records = this.recordStore.listTraffic(sessionId);
    if (records.length === 0) {
      throw new Error('이 세션에는 재생할 트래픽이 없어요.');
    }
    const actualPort = await this.replayServer.start(records, port);
    this.replaySessionId = sessionId;
    return this.getReplayStatus();
  }

  async stopReplay(): Promise<ReplayStatus> {
    await this.replayServer.stop();
    this.replaySessionId = null;
    return this.getReplayStatus();
  }

  getReplayStatus(): ReplayStatus {
    const internalStatus = this.replayServer.getStatus();
    return {
      running: internalStatus.running,
      port: internalStatus.port,
      sessionId: this.replaySessionId,
      hitCount: internalStatus.hitCount,
      missCount: internalStatus.missCount,
    };
  }

// dispose()에 추가 (proxyEngine.stop() 위)
    await this.replayServer.stop();
```

`src/main/ipcHandlers.ts`에 추가:

```typescript
  // ── 재생 ──
  ipcMain.handle('replay:start', async (_event, sessionId: number, port: number) => {
    return context.startReplay(sessionId, port);
  });

  ipcMain.handle('replay:stop', async () => {
    return context.stopReplay();
  });

  ipcMain.handle('replay:status', () => {
    return context.getReplayStatus();
  });
```

`src/preload/index.ts`의 api에 추가:

```typescript
  // 재생
  startReplay: (sessionId: number, port: number): Promise<ReplayStatus> =>
    ipcRenderer.invoke('replay:start', sessionId, port),
  stopReplay: (): Promise<ReplayStatus> => ipcRenderer.invoke('replay:stop'),
  getReplayStatus: (): Promise<ReplayStatus> => ipcRenderer.invoke('replay:status'),
```

(import에 `ReplayStatus` 추가)

`src/renderer/src/services/ipc.ts`에 추가:

```typescript
  startReplay: (sessionId: number, port: number): Promise<ReplayStatus> =>
    window.api.startReplay(sessionId, port),
  stopReplay: (): Promise<ReplayStatus> => window.api.stopReplay(),
  getReplayStatus: (): Promise<ReplayStatus> => window.api.getReplayStatus(),
```

(import에 `ReplayStatus` 추가)

`src/renderer/src/components/SessionSidebar.tsx` — 세션 항목에 재생 버튼 추가.

props 타입에 추가:

```typescript
  replaySessionId: number | null;
  onStartReplay: (sessionId: number) => void;
  onStopReplay: () => void;
```

import에 `PlayCircleOutlined, PauseCircleOutlined` 추가:

```typescript
import { DeleteOutlined, PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
```

`actions` 배열의 삭제 버튼 앞에 재생 토글 버튼 추가:

```typescript
              session.id === replaySessionId ? (
                <Button
                  key="stop-replay"
                  type="text"
                  size="small"
                  icon={<PauseCircleOutlined style={{ color: '#fa8c16' }} />}
                  onClick={(event) => {
                    event.stopPropagation();
                    onStopReplay();
                  }}
                />
              ) : (
                <Button
                  key="start-replay"
                  type="text"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  disabled={session.recordCount === 0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onStartReplay(session.id);
                  }}
                />
              ),
```

재생 중 표시 — `List.Item.Meta`의 title에 추가 (녹화 중 Tag 옆):

```typescript
                  {session.id === replaySessionId && <Tag color="orange">재생 중</Tag>}
```

`src/renderer/src/App.tsx`에 재생 상태/핸들러 추가:

```typescript
  const DEFAULT_REPLAY_PORT = 8889;
  const [replayStatus, setReplayStatus] = useState<ReplayStatus | null>(null);

  const handleStartReplay = useCallback(async (sessionId: number) => {
    try {
      const status = await ipc.startReplay(sessionId, DEFAULT_REPLAY_PORT);
      setReplayStatus(status);
      void messageApi.success(`Mock 서버 재생 시작 — 127.0.0.1:${status.port}`);
    } catch (caught) {
      void messageApi.error(caught instanceof Error ? caught.message : '재생 시작 실패');
    }
  }, [messageApi]);

  const handleStopReplay = useCallback(async () => {
    const status = await ipc.stopReplay();
    setReplayStatus(null);
    void messageApi.info(`재생 중지 (히트 ${status.hitCount} / 미스 ${status.missCount})`);
  }, [messageApi]);
```

(import에 `ReplayStatus` 타입 추가)

SessionSidebar 호출부에 props 추가:

```typescript
          <SessionSidebar
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            recordingSessionId={status.recordingSessionId}
            replaySessionId={replayStatus?.sessionId ?? null}
            onSelect={setSelectedSessionId}
            onDelete={handleDelete}
            onStartReplay={(sessionId) => void handleStartReplay(sessionId)}
            onStopReplay={() => void handleStopReplay()}
          />
```

- [ ] **Step 6: 빌드/lint/테스트 + 수동 확인**

```bash
cd ~/Dev/HttpProxyRecord && npm run build && npm run lint && npm run test
```

Expected: 전부 PASS

수동 확인: 녹화된 세션의 ▶ 버튼 클릭 → "Mock 서버 재생 시작 — 127.0.0.1:8889" → `curl http://127.0.0.1:8889/<녹화된 경로>` → 녹화된 응답 반환.

- [ ] **Step 7: 커밋**

```bash
cd ~/Dev/HttpProxyRecord && git add src tests && git commit -m "기능: 녹화 세션 mock 재생 ReplayServer 추가"
```

---

## Task 11: Exporter — HAR / curl / Markdown 내보내기

**Files:**
- Create: `src/main/export/exporter.ts`
- Modify: `src/main/ipcHandlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/services/ipc.ts`
- Modify: `src/renderer/src/components/TrafficDetail.tsx`
- Modify: `src/renderer/src/components/SessionSidebar.tsx`
- Modify: `src/renderer/src/App.tsx`
- Test: `tests/exporter.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/exporter.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { toCurl, toHar, toMarkdown } from '../src/main/export/exporter';
import type { TrafficRecord } from '../src/shared/types';

const sampleRecord = (overrides: Partial<TrafficRecord> = {}): TrafficRecord => ({
  id: 1,
  sessionId: 1,
  timestamp: '2026-06-03T10:00:00.000Z',
  method: 'POST',
  url: 'https://api.example.com/users',
  host: 'api.example.com',
  path: '/users',
  requestHeaders: { 'content-type': 'application/json', authorization: 'Bearer token123' },
  requestBody: '{"name":"홍길동"}',
  statusCode: 201,
  responseHeaders: { 'content-type': 'application/json' },
  responseBody: '{"id":1,"name":"홍길동"}',
  durationMs: 55,
  requestSize: 24,
  responseSize: 30,
  isHttps: true,
  clientIp: '127.0.0.1',
  ...overrides,
});

describe('toCurl', () => {
  it('메서드/헤더/바디를 포함한 curl 명령을 만든다', () => {
    const curl = toCurl(sampleRecord());

    expect(curl).toContain("curl -X POST 'https://api.example.com/users'");
    expect(curl).toContain("-H 'content-type: application/json'");
    expect(curl).toContain("-H 'authorization: Bearer token123'");
    expect(curl).toContain(`-d '{"name":"홍길동"}'`);
  });

  it('바디가 없으면 -d 옵션을 생략한다', () => {
    const curl = toCurl(sampleRecord({ requestBody: null, method: 'GET' }));

    expect(curl).toContain("curl -X GET");
    expect(curl).not.toContain('-d ');
  });

  it('호스트 헤더는 curl에서 제외한다', () => {
    const curl = toCurl(sampleRecord({ requestHeaders: { host: 'api.example.com', accept: '*/*' } }));

    expect(curl).not.toContain("-H 'host:");
    expect(curl).toContain("-H 'accept: */*'");
  });
});

describe('toHar', () => {
  it('HAR 1.2 형식으로 변환한다', () => {
    const har = toHar([sampleRecord()]) as {
      log: {
        version: string;
        creator: { name: string };
        entries: Array<{
          request: { method: string; url: string; postData?: { text: string } };
          response: { status: number; content: { text: string } };
          time: number;
        }>;
      };
    };

    expect(har.log.version).toBe('1.2');
    expect(har.log.creator.name).toBe('HttpProxyRecord');
    expect(har.log.entries).toHaveLength(1);

    const entry = har.log.entries[0];
    expect(entry.request.method).toBe('POST');
    expect(entry.request.url).toBe('https://api.example.com/users');
    expect(entry.request.postData?.text).toBe('{"name":"홍길동"}');
    expect(entry.response.status).toBe(201);
    expect(entry.response.content.text).toBe('{"id":1,"name":"홍길동"}');
    expect(entry.time).toBe(55);
  });

  it('헤더를 name/value 배열로 변환한다', () => {
    const har = toHar([sampleRecord()]) as {
      log: { entries: Array<{ request: { headers: Array<{ name: string; value: string }> } }> };
    };

    expect(har.log.entries[0].request.headers).toContainEqual({
      name: 'content-type',
      value: 'application/json',
    });
  });
});

describe('toMarkdown', () => {
  it('요약 테이블과 상세 섹션을 포함한 마크다운을 만든다', () => {
    const markdown = toMarkdown([sampleRecord()]);

    // 요약 테이블
    expect(markdown).toContain('| # | 시각 | 메서드 | 상태 | URL | 소요(ms) |');
    expect(markdown).toContain('| 1 |');
    expect(markdown).toContain('POST');
    expect(markdown).toContain('https://api.example.com/users');

    // 상세 섹션
    expect(markdown).toContain('## 1. POST https://api.example.com/users');
    expect(markdown).toContain('### 요청');
    expect(markdown).toContain('### 응답 (201, 55ms)');
    expect(markdown).toContain('{"name":"홍길동"}');
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd ~/Dev/HttpProxyRecord && npx vitest run tests/exporter.test.ts
```

Expected: FAIL — `exporter.ts` 모듈 없음

- [ ] **Step 3: Exporter 구현**

`src/main/export/exporter.ts`:

```typescript
import type { TrafficRecord } from '../../shared/types';

const APP_NAME = 'HttpProxyRecord';
const APP_VERSION = '0.1.0';

type HarHeader = { name: string; value: string };

const toHarHeaders = (headers: Record<string, string>): HarHeader[] =>
  Object.entries(headers).map(([name, value]) => ({ name, value }));

/** HAR 1.2 형식으로 변환 (Chrome DevTools에서 import 가능) */
export const toHar = (records: TrafficRecord[]): object => ({
  log: {
    version: '1.2',
    creator: { name: APP_NAME, version: APP_VERSION },
    entries: records.map((record) => ({
      startedDateTime: record.timestamp,
      time: record.durationMs,
      request: {
        method: record.method,
        url: record.url,
        httpVersion: 'HTTP/1.1',
        headers: toHarHeaders(record.requestHeaders),
        queryString: [],
        cookies: [],
        headersSize: -1,
        bodySize: record.requestSize,
        ...(record.requestBody !== null
          ? {
              postData: {
                mimeType: record.requestHeaders['content-type'] ?? 'application/octet-stream',
                text: record.requestBody,
              },
            }
          : {}),
      },
      response: {
        status: record.statusCode,
        statusText: '',
        httpVersion: 'HTTP/1.1',
        headers: toHarHeaders(record.responseHeaders),
        cookies: [],
        content: {
          size: record.responseSize,
          mimeType: record.responseHeaders['content-type'] ?? 'application/octet-stream',
          text: record.responseBody ?? '',
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: record.responseSize,
      },
      cache: {},
      timings: { send: 0, wait: record.durationMs, receive: 0 },
    })),
  },
});

/** 단일 기록을 curl 명령어로 변환 */
export const toCurl = (record: TrafficRecord): string => {
  const lines = [`curl -X ${record.method} '${record.url}'`];

  for (const [name, value] of Object.entries(record.requestHeaders)) {
    if (name.toLowerCase() === 'host') continue;
    lines.push(`  -H '${name}: ${value.replace(/'/g, "'\\''")}'`);
  }

  if (record.requestBody !== null && record.requestBody.length > 0) {
    lines.push(`  -d '${record.requestBody.replace(/'/g, "'\\''")}'`);
  }

  return lines.join(' \\\n');
};

/** 세션 전체를 Markdown 문서로 변환 (증거 수집용) */
export const toMarkdown = (records: TrafficRecord[]): string => {
  const lines: string[] = ['# HTTP 트래픽 기록', ''];

  // 요약 테이블
  lines.push('| # | 시각 | 메서드 | 상태 | URL | 소요(ms) |');
  lines.push('|---|------|--------|------|-----|----------|');
  records.forEach((record, index) => {
    const time = new Date(record.timestamp).toLocaleTimeString('ko-KR', { hour12: false });
    lines.push(
      `| ${index + 1} | ${time} | ${record.method} | ${record.statusCode} | ${record.url} | ${record.durationMs} |`,
    );
  });
  lines.push('');

  // 상세 섹션
  records.forEach((record, index) => {
    lines.push(`## ${index + 1}. ${record.method} ${record.url}`);
    lines.push('');
    lines.push('### 요청');
    lines.push('');
    lines.push('| 헤더 | 값 |');
    lines.push('|------|-----|');
    for (const [name, value] of Object.entries(record.requestHeaders)) {
      lines.push(`| ${name} | ${value.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
    if (record.requestBody !== null && record.requestBody.length > 0) {
      lines.push('```json');
      lines.push(record.requestBody);
      lines.push('```');
      lines.push('');
    }

    lines.push(`### 응답 (${record.statusCode}, ${record.durationMs}ms)`);
    lines.push('');
    lines.push('| 헤더 | 값 |');
    lines.push('|------|-----|');
    for (const [name, value] of Object.entries(record.responseHeaders)) {
      lines.push(`| ${name} | ${value.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
    if (record.responseBody !== null && record.responseBody.length > 0) {
      lines.push('```json');
      lines.push(record.responseBody);
      lines.push('```');
      lines.push('');
    }
  });

  return lines.join('\n');
};
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd ~/Dev/HttpProxyRecord && npx vitest run tests/exporter.test.ts
```

Expected: PASS (6개 테스트)

- [ ] **Step 5: IPC + UI 연결 (파일 저장 다이얼로그 + 클립보드)**

`src/main/ipcHandlers.ts`에 추가. import:

```typescript
import { dialog, clipboard } from 'electron';
import fs from 'node:fs';
import { toCurl, toHar, toMarkdown } from './export/exporter';
```

핸들러 추가:

```typescript
  // ── 내보내기 ──
  ipcMain.handle('export:har', async (_event, sessionId: number) => {
    const records = context.recordStore.listTraffic(sessionId);
    const result = await dialog.showSaveDialog({
      defaultPath: `session-${sessionId}.har`,
      filters: [{ name: 'HAR', extensions: ['har'] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };

    fs.writeFileSync(result.filePath, JSON.stringify(toHar(records), null, 2));
    return { saved: true, path: result.filePath };
  });

  ipcMain.handle('export:markdown', async (_event, sessionId: number) => {
    const records = context.recordStore.listTraffic(sessionId);
    const result = await dialog.showSaveDialog({
      defaultPath: `session-${sessionId}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };

    fs.writeFileSync(result.filePath, toMarkdown(records));
    return { saved: true, path: result.filePath };
  });

  ipcMain.handle('export:curl', (_event, recordId: number) => {
    const record = context.recordStore.getTrafficById(recordId);
    if (!record) throw new Error('기록을 찾을 수 없어요.');

    const curl = toCurl(record);
    clipboard.writeText(curl);
    return { copied: true };
  });
```

`src/preload/index.ts`의 api에 추가:

```typescript
  // 내보내기
  exportHar: (sessionId: number): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke('export:har', sessionId),
  exportMarkdown: (sessionId: number): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke('export:markdown', sessionId),
  copyCurl: (recordId: number): Promise<{ copied: boolean }> => ipcRenderer.invoke('export:curl', recordId),
```

`src/renderer/src/services/ipc.ts`에 추가:

```typescript
  exportHar: (sessionId: number): Promise<{ saved: boolean; path?: string }> => window.api.exportHar(sessionId),
  exportMarkdown: (sessionId: number): Promise<{ saved: boolean; path?: string }> =>
    window.api.exportMarkdown(sessionId),
  copyCurl: (recordId: number): Promise<{ copied: boolean }> => window.api.copyCurl(recordId),
```

`src/renderer/src/components/TrafficDetail.tsx` — 상세 패널 상단에 "curl 복사" 버튼 추가.

props에 콜백 추가:

```typescript
type TrafficDetailProps = {
  record: TrafficRecord | null;
  onCopyCurl: (recordId: number) => void;
};
```

import에 `Button`, `CopyOutlined` 추가:

```typescript
import { Button, Descriptions, Empty, Table, Tabs, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
```

`Typography.Title` 아래에 버튼 추가:

```typescript
      <Button
        size="small"
        icon={<CopyOutlined />}
        onClick={() => onCopyCurl(record.id)}
        style={{ marginBottom: 12 }}
      >
        curl 복사
      </Button>
```

`src/renderer/src/components/SessionSidebar.tsx` — 세션 항목에 내보내기 드롭다운 추가.

props에 추가:

```typescript
  onExportHar: (sessionId: number) => void;
  onExportMarkdown: (sessionId: number) => void;
```

import에 `Dropdown`, `ExportOutlined` 추가:

```typescript
import { Button, Dropdown, List, Popconfirm, Tag, Typography } from 'antd';
import { DeleteOutlined, ExportOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
```

`actions` 배열에 내보내기 버튼 추가 (재생 버튼 앞):

```typescript
              <Dropdown
                key="export"
                menu={{
                  items: [
                    { key: 'har', label: 'HAR로 내보내기' },
                    { key: 'markdown', label: 'Markdown으로 내보내기' },
                  ],
                  onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    if (key === 'har') onExportHar(session.id);
                    if (key === 'markdown') onExportMarkdown(session.id);
                  },
                }}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<ExportOutlined />}
                  disabled={session.recordCount === 0}
                  onClick={(event) => event.stopPropagation()}
                />
              </Dropdown>,
```

`src/renderer/src/App.tsx`에 핸들러 추가:

```typescript
  const handleExportHar = useCallback(async (sessionId: number) => {
    const result = await ipc.exportHar(sessionId);
    if (result.saved) void messageApi.success(`HAR 저장 완료: ${result.path}`);
  }, [messageApi]);

  const handleExportMarkdown = useCallback(async (sessionId: number) => {
    const result = await ipc.exportMarkdown(sessionId);
    if (result.saved) void messageApi.success(`Markdown 저장 완료: ${result.path}`);
  }, [messageApi]);

  const handleCopyCurl = useCallback(async (recordId: number) => {
    await ipc.copyCurl(recordId);
    void messageApi.success('curl 명령어를 클립보드에 복사했어요');
  }, [messageApi]);
```

SessionSidebar/TrafficDetail 호출부에 props 연결:

```typescript
            onExportHar={(sessionId) => void handleExportHar(sessionId)}
            onExportMarkdown={(sessionId) => void handleExportMarkdown(sessionId)}
```

```typescript
              <TrafficDetail record={selectedRecord} onCopyCurl={(recordId) => void handleCopyCurl(recordId)} />
```

- [ ] **Step 6: 빌드/lint/테스트 확인**

```bash
cd ~/Dev/HttpProxyRecord && npm run build && npm run lint && npm run test
```

Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
cd ~/Dev/HttpProxyRecord && git add src tests && git commit -m "기능: HAR/curl/Markdown 내보내기 추가"
```

---

## Task 12: 패키징 + 최종 검증

**Files:**
- Create: `electron-builder.yml`
- Create: `build/` (아이콘은 생략 — 기본 Electron 아이콘 사용)
- Modify: `README.md`

- [ ] **Step 1: electron-builder 설정 작성**

`electron-builder.yml`:

```yaml
appId: com.httpproxyrecord.app
productName: HttpProxyRecord
directories:
  output: dist
  buildResources: build
files:
  - out/**/*
  - package.json
asarUnpack:
  - "**/*.node"
mac:
  target:
    - target: dmg
      arch:
        - arm64
        - x64
  category: public.app-category.developer-tools
win:
  target:
    - target: nsis
      arch:
        - x64
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
npmRebuild: true
```

- [ ] **Step 2: README 작성**

`README.md`:

```markdown
# HttpProxyRecord

HTTP/HTTPS 트래픽을 캡처·기록·재생하는 크로스플랫폼(macOS + Windows) 데스크톱 앱.

## 주요 기능

- **디버깅 프록시**: 로컬 MITM 프록시(기본 포트 8888)로 HTTP/HTTPS 요청·응답을 실시간 캡처
- **HTTPS 복호화**: 자체 루트 CA로 TLS MITM — 요청/응답 본문까지 확인
- **세션 녹화**: 트래픽을 세션 단위로 SQLite에 저장
- **Mock 재생**: 녹화된 세션을 mock 서버(기본 포트 8889)로 재생 — 백엔드 없이 프론트 개발/테스트
- **내보내기**: HAR 1.2 / curl 명령어 / Markdown 문서
- **시스템 프록시 원클릭**: macOS/Windows 시스템 프록시 자동 등록·해제

## 개발 환경

\`\`\`bash
make setup      # 의존성 설치 + pre-commit hook
make dev        # 개발 모드 실행
make test       # 테스트
make lint       # lint
\`\`\`

## 사용 방법

1. **녹화 시작** — 세션 이름 입력 후 시작하면 프록시가 127.0.0.1:8888에 뜬다
2. **인증서 설치** — HTTPS 복호화를 위해 루트 CA를 시스템에 신뢰 등록 (최초 1회)
3. **트래픽 연결**
   - 맥 전체: "시스템 프록시 ON" 토글
   - 특정 프로세스만: `HTTP_PROXY=http://127.0.0.1:8888 HTTPS_PROXY=http://127.0.0.1:8888 <명령>`
   - curl 테스트: `curl -x http://127.0.0.1:8888 https://httpbin.org/get`
4. **재생** — 세션 옆 ▶ 버튼 → mock 서버가 127.0.0.1:8889에 뜬다
5. **내보내기** — 세션 옆 내보내기 버튼 → HAR/Markdown, 상세 패널에서 curl 복사

## 패키징

\`\`\`bash
npm run package:mac   # macOS dmg (dist/)
npm run package:win   # Windows nsis 인스톨러 (dist/)
\`\`\`
```

- [ ] **Step 3: macOS 패키지 빌드 확인**

```bash
cd ~/Dev/HttpProxyRecord && npm run package:mac 2>&1 | tail -20
```

Expected: `dist/HttpProxyRecord-0.1.0-arm64.dmg` 생성 (코드사이닝 경고는 무시 — 미서명 배포)

실패 시 점검:
1. better-sqlite3 네이티브 모듈 → `asarUnpack` 설정 확인
2. out/ 디렉터리 없음 → `npm run build` 먼저 실행

- [ ] **Step 4: 전체 테스트 + lint 최종 확인**

```bash
cd ~/Dev/HttpProxyRecord && npm run test && npm run lint && npm run typecheck
```

Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
cd ~/Dev/HttpProxyRecord && git add electron-builder.yml README.md && git commit -m "기능: electron-builder 패키징 설정과 README 추가"
```

---

## 수동 E2E 검증 시나리오 (구현 완료 후)

1. **HTTP 캡처**: 녹화 시작 → `curl -x http://127.0.0.1:8888 http://httpbin.org/get` → 테이블에 표시 ✓
2. **HTTPS 캡처**: 인증서 설치 → `curl -x http://127.0.0.1:8888 https://httpbin.org/json` → 본문까지 표시 ✓
3. **시스템 프록시**: 토글 ON → Safari/Chrome 접속 → 트래픽 캡처 ✓ → 토글 OFF → 정상 인터넷 ✓
4. **재생**: 세션 ▶ → `curl http://127.0.0.1:8889/get` → 녹화된 응답 반환 ✓
5. **내보내기**: HAR 저장 → Chrome DevTools에서 import ✓ / curl 복사 → 터미널 실행 ✓ / MD 저장 ✓
6. **종료 안전성**: 시스템 프록시 ON 상태로 앱 종료 → 프록시 자동 해제 → 인터넷 정상 ✓

## Self-Review 체크리스트 (플랜 작성자 확인 완료)

- [x] 스펙 커버리지: 디버깅 프록시(Task 4-5), HTTPS MITM(Task 2, 5), 세션 기록(Task 3, 6), 트래픽 뷰어 UI(Task 7-8), 시스템 프록시/인증서(Task 9), mock 재생(Task 10), HAR/curl/MD 내보내기(Task 11), 패키징(Task 12)
- [x] 플레이스홀더 없음 — 모든 코드 블록은 실제 구현 코드
- [x] 타입 일관성: `CapturedTraffic`/`TrafficRecord`/`Session`/`ProxyStatus`/`ReplayStatus`는 `src/shared/types.ts` 단일 정의를 Main/Renderer가 공유
- [x] 알려진 리스크: (1) better-sqlite3 Electron 네이티브 리빌드 ↔ vitest Node 리빌드 전환 — Task 3 Step 4에 해결책 명시, (2) electron-vite 5.x API 변경 가능성 — Task 1 Step 8에서 빌드로 검증, (3) antd v6 API 차이(message.useMessage 등) — Task 9에서 hook 방식 사용
- [x] 스펙과 다른 점: 디렉터리 구조를 electron-vite 컨벤션(`src/main`, `src/preload`, `src/renderer`)으로 적용 (스펙의 `electron/`, `src/` 구조 대신 — 프레임워크 표준 우선). 필터/검색 UI와 캡처 제외 도메인 설정은 MVP에서 제외 (YAGNI — 추후 필요 시 추가)
