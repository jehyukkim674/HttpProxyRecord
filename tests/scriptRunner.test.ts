import { describe, expect, it } from 'vitest';
import { ScriptRunner } from '../src/main/scripting/scriptRunner';
import type { ScriptRequest, ScriptResponse } from '../src/main/scripting/scriptRunner';

const noop = () => {};
const reqOf = (p: Partial<ScriptRequest> = {}): ScriptRequest => ({
  method: 'GET',
  url: 'http://x/a',
  host: 'x',
  path: '/a',
  headers: {},
  body: null,
  ...p,
});

describe('ScriptRunner', () => {
  it('onRequest로 요청 헤더를 변조한다', () => {
    const r = new ScriptRunner(noop);
    r.setScripts([
      { id: '1', name: 'h', enabled: true, code: `function onRequest(req){ req.headers['x-test']='1'; }` },
    ]);
    const req = reqOf();
    expect(r.runRequest(req)).toBeNull();
    expect(req.headers['x-test']).toBe('1');
  });

  it('onRequest가 {status,body} 반환 시 가짜응답 단락', () => {
    const r = new ScriptRunner(noop);
    r.setScripts([
      {
        id: '1',
        name: 'm',
        enabled: true,
        code: `function onRequest(){ return { status: 201, body: 'hi' }; }`,
      },
    ]);
    const sc = r.runRequest(reqOf());
    expect(sc?.status).toBe(201);
    expect(sc?.body).toBe('hi');
  });

  it('{block:true} 반환 시 403 단락', () => {
    const r = new ScriptRunner(noop);
    r.setScripts([
      { id: '1', name: 'b', enabled: true, code: `function onRequest(){ return { block: true }; }` },
    ]);
    expect(r.runRequest(reqOf())?.status).toBe(403);
  });

  it('onResponse로 응답 본문을 변조한다', () => {
    const r = new ScriptRunner(noop);
    r.setScripts([
      {
        id: '1',
        name: 'r',
        enabled: true,
        code: `function onResponse(req,res){ res.body = res.body.toUpperCase(); res.status = 202; }`,
      },
    ]);
    const res: ScriptResponse = { status: 200, headers: {}, body: 'abc' };
    r.runResponse(reqOf(), res);
    expect(res.body).toBe('ABC');
    expect(res.status).toBe(202);
  });

  it('런타임 throw는 fail-open(트래픽 무변조) + 로그', () => {
    const logs: unknown[] = [];
    const r = new ScriptRunner((e) => logs.push(e));
    r.setScripts([
      { id: '1', name: 'e', enabled: true, code: `function onRequest(){ throw new Error('boom'); }` },
    ]);
    const req = reqOf();
    expect(r.runRequest(req)).toBeNull();
    expect(logs.length).toBe(1);
  });

  it('무한루프는 타임아웃으로 중단된다', () => {
    const r = new ScriptRunner(noop);
    r.setScripts([{ id: '1', name: 'loop', enabled: true, code: `function onRequest(){ while(true){} }` }]);
    expect(r.runRequest(reqOf())).toBeNull();
  });

  it('store는 호출 간 유지된다', () => {
    const r = new ScriptRunner(noop);
    r.setScripts([
      {
        id: '1',
        name: 's',
        enabled: true,
        code: `function onRequest(req){ store.n=(store.n??0)+1; req.headers['n']=String(store.n); }`,
      },
    ]);
    const a = reqOf();
    r.runRequest(a);
    const b = reqOf();
    r.runRequest(b);
    expect(b.headers['n']).toBe('2');
  });

  it('비활성 스크립트는 실행되지 않는다', () => {
    const r = new ScriptRunner(noop);
    r.setScripts([
      { id: '1', name: 'off', enabled: false, code: `function onRequest(req){ req.headers['x']='1'; }` },
    ]);
    const req = reqOf();
    r.runRequest(req);
    expect(req.headers['x']).toBeUndefined();
  });

  it('컴파일 에러는 로그만 남기고 다른 스크립트는 동작', () => {
    const logs: unknown[] = [];
    const r = new ScriptRunner((e) => logs.push(e));
    r.setScripts([
      { id: 'bad', name: 'bad', enabled: true, code: `function onRequest({{{` },
      { id: 'ok', name: 'ok', enabled: true, code: `function onRequest(req){ req.headers['ok']='1'; }` },
    ]);
    const req = reqOf();
    r.runRequest(req);
    expect(req.headers['ok']).toBe('1');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it('hasRequestHooks/hasResponseHooks가 정확하다', () => {
    const r = new ScriptRunner(noop);
    r.setScripts([{ id: '1', name: 'q', enabled: true, code: `function onResponse(){}` }]);
    expect(r.hasRequestHooks()).toBe(false);
    expect(r.hasResponseHooks()).toBe(true);
  });
});
