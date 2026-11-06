// Client for the Advanced Games backend (Supabase Edge Function `api`, routes game/*).
// Same wire format as the rest of the site: POST text/plain JSON { operation, apiKey, token, ...params } -> { success, data, error }.
// Pure ES module, no DOM needed (fetch + storages are injectable so it can be tested in Node).

export const API_BASE_URL = 'https://gbgcaonmdekumluwgwvn.supabase.co/functions/v1/api';
export const API_KEY = 'Jdb-iJByoQ-WA0UwlQrorQOH77buDQjepPH0y2SsDyo';   // public client key (same one api.js ships)

const b64urlDecode = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  return typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8');
};

/** Parse a JWT payload without verifying it (the server verifies). Returns null if it is not a JWT. */
export function jwtPayload(tok) {
  if (typeof tok !== 'string') return null;
  const parts = tok.split('.');
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) return null;
  try { const p = JSON.parse(b64urlDecode(parts[1])); return p && typeof p === 'object' ? p : null; } catch (e) { return null; }
}

/**
 * Find the logged-in STUDENT session token. We do not rely on one storage key: every value in
 * localStorage / sessionStorage is checked for "a JWT whose role is Student and which has not expired".
 * Values may be wrapped in JSON (a quoted string or {token:...}).
 */
export function findStudentToken(storages, nowSec = Math.floor(Date.now() / 1000)) {
  let best = null;
  for (const st of storages) {
    if (!st) continue;
    let keys = [];
    try { for (let i = 0; i < st.length; i++) keys.push(st.key(i)); } catch (e) { continue; }
    for (const k of keys) {
      let v; try { v = st.getItem(k); } catch (e) { continue; }
      if (typeof v !== 'string' || v.length < 40 || v.length > 4000) continue;
      const cands = [v];
      if (v[0] === '"' || v[0] === '{') { try { const j = JSON.parse(v); cands.push(typeof j === 'string' ? j : (j && (j.token || j.session_token || j.value))); } catch (e) { /* ignore */ } }
      for (const c of cands) {
        const p = jwtPayload(c);
        if (!p || p.role !== 'Student') continue;
        if (p.exp && p.exp < nowSec) continue;
        if (!best || (p.exp || 0) > best.exp) best = { token: c, exp: p.exp || 0, studentId: p.sub };
      }
    }
  }
  return best ? best.token : null;
}

export const isAuthCode = (code) => code === 'AUTH_001' || code === 'AUTH_002' || code === 'AUTH_003' || code === 'AUTH_004';

export class GameServer {
  /**
   * @param {object} o
   * @param {string} o.game               'racer' | 'defense'
   * @param {()=>string|null} o.getToken
   * @param {Function} [o.fetchImpl]
   */
  constructor({ game, getToken, fetchImpl, base = API_BASE_URL, apiKey = API_KEY } = {}) {
    this.game = game; this.getToken = getToken; this.base = base; this.apiKey = apiKey;
    this.fetch = fetchImpl || ((...a) => fetch(...a));
  }
  async call(operation, params = {}) {
    const token = this.getToken && this.getToken();
    if (!token) { const e = new Error('Please log in to your dashboard first.'); e.code = 'AUTH_004'; e.noToken = true; throw e; }
    let res, text;
    try {
      res = await this.fetch(this.base, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ operation, apiKey: this.apiKey, token, ...params }) });
      text = await res.text();
    } catch (err) { const e = new Error('No connection. Check your internet and try again.'); e.network = true; throw e; }
    let payload = null; try { payload = JSON.parse(text); } catch (err) { /* cold start returns HTML */ }
    if (!payload) { const e = new Error('The server is waking up. Please try again in a moment.'); e.network = true; throw e; }
    if (payload.success) return payload.data || {};
    const e = new Error((payload.error && payload.error.message) || 'Something went wrong.');
    e.code = payload.error && payload.error.code; e.auth = isAuthCode(e.code);
    throw e;
  }
  profile() { return this.call('game/profile'); }
  startRun(mode) { return this.call('game/startRun', { game: this.game, mode }); }
  /** log = [{qid,tier,correct,ms}] ; extra = {trafficHits, healsUsed, score} */
  submitRun(run, log, extra = {}) {
    return this.call('game/submitRun', { runId: run.runId, runToken: run.runToken, answers: log, trafficHits: extra.trafficHits || 0, healsUsed: extra.healsUsed || 0, score: extra.score || 0 });
  }
  saveSettings(settings, garage) { return this.call('game/saveSettings', { settings, garage }); }
  leaderboard(limit = 20) { return this.call('game/leaderboard', { game: this.game, limit }); }
}

/** Turn a rules.js run log into the submission answers (skips are not answers). */
export function answersFromLog(log) {
  return (log || []).filter((e) => !e.skipped && typeof e.correct === 'boolean').map((e) => ({ qid: String(e.id || ''), tier: e.tier, correct: e.correct, ms: Math.max(0, Math.round(e.ms || 0)) }));
}
