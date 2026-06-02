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
