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
    const basicConstraints = parsed.getExtension('basicConstraints') as { cA: boolean };
    expect(basicConstraints.cA).toBe(true);
  });

  it('두 번째 호출에는 저장된 루트 CA를 다시 로드한다', () => {
    const first = certManager.loadOrCreateRootCa();
    const second = certManager.loadOrCreateRootCa();

    expect(second.cert).toBe(first.cert);

    const newManager = new CertManager(tempDir);
    const reloaded = newManager.loadOrCreateRootCa();
    expect(reloaded.cert).toBe(first.cert);
  });

  it('도메인용 leaf 인증서를 루트 CA로 서명해 발급한다', () => {
    certManager.loadOrCreateRootCa();

    const leaf = certManager.getCertForHost('example.com');

    const leafCert = forge.pki.certificateFromPem(leaf.cert);
    expect(leafCert.subject.getField('CN').value).toBe('example.com');

    const san = leafCert.getExtension('subjectAltName') as { altNames: Array<{ value: string }> };
    expect(san.altNames.map((alternativeName) => alternativeName.value)).toContain('example.com');

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
