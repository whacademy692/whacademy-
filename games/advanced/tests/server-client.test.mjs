import test from 'node:test';
import assert from 'node:assert/strict';
import { jwtPayload, findStudentToken, GameServer, answersFromLog, isAuthCode } from '../engine/net/server.js';

const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (o) => `${b({ alg: 'HS256' })}.${b(o)}.sig`;
const NOW = 1_800_000_000;
const store = (obj) => ({ get length() { return Object.keys(obj).length; }, key: (i) => Object.keys(obj)[i], getItem: (k) => (k in obj ? obj[k] : null) });

test('jwtPayload parses JWTs and rejects junk', () => {
  assert.equal(jwtPayload(jwt({ sub: 'S1', role: 'Student' })).sub, 'S1');
  for (const bad of [null, '', 'abc', 'a.b', 'a.b.c.d', 'a b.c.d', 123]) assert.equal(jwtPayload(bad), null);
});

test('findStudentToken: any storage key, JSON-wrapped values, newest valid Student token wins, expired/admin ignored', () => {
  const good = jwt({ sub: 'S1', role: 'Student', exp: NOW + 500 });
  const newer = jwt({ sub: 'S1', role: 'Student', exp: NOW + 900 });
  const admin = jwt({ sub: 'a@x', role: 'Administrator', exp: NOW + 9000 });
  const old = jwt({ sub: 'S1', role: 'Student', exp: NOW - 5 });
  assert.equal(findStudentToken([store({ x: good })], NOW), good);
  assert.equal(findStudentToken([store({ session_token: JSON.stringify(good) })], NOW), good);
  assert.equal(findStudentToken([store({ s: JSON.stringify({ token: good }) })], NOW), good);
  assert.equal(findStudentToken([store({ a: good, b: newer })], NOW), newer);
  assert.equal(findStudentToken([store({ a: admin })], NOW), null);
  assert.equal(findStudentToken([store({ a: old })], NOW), null);
  assert.equal(findStudentToken([store({ a: 'hello', b: '{"x":1}' }), null, { get length() { throw new Error('blocked'); } }], NOW), null);
  assert.equal(findStudentToken([store({ a: admin }), store({ b: good })], NOW), good);   // sessionStorage fallback
});

test('GameServer: wire format, envelope handling, error kinds', async () => {
  const sent = [];
  const mk = (reply, token = 'T') => new GameServer({ game: 'racer', getToken: () => token, fetchImpl: async (url, init) => { sent.push({ url, init }); return typeof reply === 'function' ? reply() : { text: async () => reply }; } });
  const ok = mk(JSON.stringify({ success: true, data: { hello: 1 } }));
  assert.deepEqual(await ok.profile(), { hello: 1 });
  assert.equal(sent[0].init.headers['Content-Type'], 'text/plain;charset=utf-8');
  const body = JSON.parse(sent[0].init.body);
  assert.equal(body.operation, 'game/profile'); assert.equal(body.token, 'T'); assert.ok(body.apiKey);
  await ok.startRun('ranked'); assert.deepEqual([JSON.parse(sent[1].init.body).game, JSON.parse(sent[1].init.body).mode], ['racer', 'ranked']);
  await ok.submitRun({ runId: 'R', runToken: 'K' }, [{ qid: 'q', tier: 'E', correct: true, ms: 3000 }], { trafficHits: 2, healsUsed: 1, score: 99 });
  const sub = JSON.parse(sent[2].init.body);
  assert.deepEqual([sub.runId, sub.runToken, sub.trafficHits, sub.healsUsed, sub.score, sub.answers.length], ['R', 'K', 2, 1, 99, 1]);

  await assert.rejects(mk('{}', null).profile(), (e) => e.noToken && e.auth === undefined && e.code === 'AUTH_004');
  await assert.rejects(mk(JSON.stringify({ success: false, error: { code: 'AUTH_003', message: 'expired' } })).profile(), (e) => e.auth === true && e.code === 'AUTH_003');
  await assert.rejects(mk(JSON.stringify({ success: false, error: { code: 'VAL_003', message: 'Advanced Games are part of the Max plan.' } })).profile(), (e) => !e.auth && !e.network && /Max plan/.test(e.message));
  await assert.rejects(mk('<html>cold start</html>').profile(), (e) => e.network === true);
  await assert.rejects(new GameServer({ game: 'racer', getToken: () => 'T', fetchImpl: async () => { throw new Error('offline'); } }).profile(), (e) => e.network === true);
  assert.ok(isAuthCode('AUTH_001') && !isAuthCode('VAL_003'));
});

test('answersFromLog drops skips and non-answers, rounds ms', () => {
  const log = [{ id: 'a', tier: 'E', correct: true, ms: 2500.6 }, { id: 'b', tier: 'M', skipped: true }, { id: 'c', tier: 'H', correct: false, ms: 8000, timeout: true }, { id: 'd', tier: 'H', pick: 1 }];
  assert.deepEqual(answersFromLog(log), [{ qid: 'a', tier: 'E', correct: true, ms: 2501 }, { qid: 'c', tier: 'H', correct: false, ms: 8000 }]);
  assert.deepEqual(answersFromLog(null), []);
});
