/**
 * api.js — W.H. Academy
 * The ONLY file that talks to the backend. Matches the Apps Script
 * API.gs router exactly: one doPost endpoint, {operation, apiKey, ...,
 * token} request body, {success, data, error, timestamp} response
 * envelope (Software Architecture §9).
 *
 * Configuration: replace these two placeholders with your actual
 * deployed Web App URL and API key before going live (Step 15).
 */

const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbxjaqW5hmUk6B5gYW3hRjAfsPrbrdZB4a3B3VfJRvfKcfepz4WPYIX_aCVKS-STmiwQIA/exec';
const API_KEY = 'Jdb-iJByoQ-WA0UwlQrorQOH77buDQjepPH0y2SsDyo';

const Api = (() => {

  const MAX_RETRIES = 2;
  const RETRY_BASE_DELAY_MS = 800;
  // Hard ceiling per attempt. Apps Script can be slow on a cold start, so this
  // is generous — but without it a stalled request hangs a page's skeleton
  // forever (e.g. Boss Battle spinning with no error). On timeout we abort and
  // surface a clear, retryable error instead of waiting indefinitely.
  const REQUEST_TIMEOUT_MS = 25000;

  // Operations that mutate state — queued for retry if the network is
  // down, per the PendingSyncQueue design (Software Architecture §9).
  const MUTATING_OPERATIONS = new Set([
    'progress/sessionStart', 'progress/sessionEnd', 'progress/recordAttempt',
    'progress/markStageComplete', 'bookmarks/add', 'bookmarks/remove',
    'favorites/add', 'favorites/remove', 'coins/spend'
  ]);

  // A dead session — token expired (AUTH_003) or invalid/revoked/logged-out
  // (AUTH_004) — cannot be fixed by a retry or by staying on the page. When any
  // authenticated call returns one of these, we clear the token and send the
  // student to login ONCE, so an expired session prompts a clean re-login
  // EVERYWHERE. Without this, an expired token silently fell back to stale cache
  // on some pages (dashboard) while dead-ending with an error on others (Boss
  // Battle) — which is exactly the "Session has expired / Retry" wall we saw.
  // Login-time codes (AUTH_001 bad credentials, AUTH_002 inactive) are NOT here
  // — those belong to the login form, not a redirect.
  const SESSION_DEAD_CODES = new Set(['AUTH_003', 'AUTH_004']);
  let sessionDeathHandled = false;

  function handleSessionDeath() {
    if (sessionDeathHandled) return;          // one redirect, even if several calls fail at once
    sessionDeathHandled = true;
    try { Storage.clearToken(); } catch (e) {}
    const page = (window.location.pathname.split('/').pop()) || '';
    if (page !== 'login.html') {
      window.location.href = 'login.html?redirect=' + encodeURIComponent(page) + '&reason=expired';
    }
  }

  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  /**
   * Builds the standard request body every operation shares.
   */
  function buildBody(operation, params) {
    const body = Object.assign({ operation, apiKey: API_KEY }, params || {});
    const token = Storage.getToken();
    if (token && body.token === undefined) body.token = token;
    return body;
  }

  /**
   * The single low-level request function. Uses text/plain as the
   * declared Content-Type deliberately — Apps Script Web Apps read the
   * raw body via e.postData.contents regardless of declared type, and
   * text/plain avoids a CORS preflight (OPTIONS) request that Apps
   * Script's doPost does not handle, which would otherwise break every
   * call from a browser.
   */
  async function rawRequest(operation, params) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(buildBody(operation, params)),
        signal: controller.signal
      });
    } catch (err) {
      // Timeout (AbortError) or a genuine connection failure. Both are transient
      // and retryable — request() will back off and retry, then surface this.
      const msg = (err && err.name === 'AbortError')
        ? 'The server took too long to respond. Please try again.'
        : 'Could not reach the server. Check your connection and try again.';
      throw new ApiError('NETWORK_ERROR', msg, true);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new ApiError('NETWORK_ERROR', `Request failed with status ${response.status}.`, true);
    }
    const envelope = await response.json();
    if (!envelope || typeof envelope.success !== 'boolean') {
      throw new ApiError('MALFORMED_RESPONSE', 'The server returned an unexpected response.', false);
    }
    if (!envelope.success) {
      const code = envelope.error && envelope.error.code;
      const message = (envelope.error && envelope.error.message) || 'Something went wrong.';
      if (SESSION_DEAD_CODES.has(code)) handleSessionDeath();
      throw new ApiError(code, message, false);
    }
    return envelope.data;
  }

  class ApiError extends Error {
    constructor(code, message, isNetworkError) {
      super(message);
      this.code = code;
      this.isNetworkError = !!isNetworkError;
    }
  }

  /**
   * Retries transient network failures with exponential backoff.
   * Never retries a validation/auth failure — retrying cannot fix those.
   */
  async function request(operation, params) {
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await rawRequest(operation, params);
      } catch (err) {
        lastError = err;
        const isTransient = err instanceof ApiError ? err.isNetworkError : true;
        if (!isTransient || attempt === MAX_RETRIES) break;
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
      }
    }

    if (MUTATING_OPERATIONS.has(operation) && !navigator.onLine) {
      Storage.queuePendingWrite(operation, params);
      Notifications.toast('You are offline — this will sync once you reconnect.', 'info');
      return { queued: true };
    }

    throw lastError;
  }

  /** Flushes any writes queued while offline. Called on 'online' event and app init. */
  async function flushPendingQueue() {
    const queue = Storage.getPendingQueue();
    for (const item of queue) {
      try {
        await rawRequest(item.operation, item.params);
        Storage.clearPendingQueueItem(item.id);
      } catch (e) {
        break; // stop at the first failure, retry the rest next time
      }
    }
  }

  window.addEventListener('online', () => { flushPendingQueue(); });

  // ---- Resource-scoped convenience wrappers (mirrors API.gs's route table) ----

  const auth = {
    // captchaToken (audit S1) is optional — undefined when CAPTCHA is off, in
    // which case it is dropped from the body by JSON.stringify and the backend
    // (FLAG_CAPTCHA unset) ignores it. Sent only when the Turnstile widget is
    // configured and solved.
    login: (studentId, pin, rememberMe, captchaToken) => request('auth/login', { studentId, pin, rememberMe, captchaToken }),
    logout: (token) => request('auth/logout', { token }),
    // Public by necessity — a student who forgot their PIN has no session.
    // The backend refuses this unless otp/verify has just succeeded for this
    // Student ID with the PasswordReset purpose (Auth.resetPin).
    resetPin: (studentId, pin, confirmPin) => request('auth/resetPin', { studentId, pin, confirmPin }),
    // Change PIN (signed in), 2 steps. Step 1 verifies the current PIN and
    // emails a code; step 2 confirms the code and sets the new PIN. studentId
    // is taken from the session server-side.
    requestPinChange: (currentPin) => request('auth/requestPinChange', { currentPin }),
    confirmPinChange: (otpCode, newPin, confirmPin) => request('auth/confirmPinChange', { otpCode, newPin, confirmPin }),
    adminLogin: (email, sharedSecret) => request('admin/login', { email, sharedSecret })
  };

  const otp = {
    // captchaToken (audit S1) — see auth.login note above; optional and dropped when off.
    request: (studentId, email, fullName, purpose, captchaToken) => request('otp/request', { studentId, email, fullName, purpose, captchaToken }),
    // `purpose` is required for anything other than registration. OTP rows are
    // stored per studentId+purpose, so omitting it made every verification
    // look for a 'Registration' row — which is why a valid PIN-reset code
    // always came back as "No verification code was found".
    verify: (studentId, otpCode, purpose) => request('otp/verify', { studentId, otpCode, purpose })
  };

  const registration = {
    complete: (studentId, pin, confirmPin) => request('registration/complete', { studentId, pin, confirmPin })
  };

  const dashboard = {
    compose: () => request('dashboard/compose', {})
  };

  const progress = {
    sessionStart: (chapterRef, mechanicIds) => request('progress/sessionStart', { chapterRef, mechanicIds }),
    sessionEnd: (sessionId) => request('progress/sessionEnd', { sessionId }),
    recordAttempt: (sessionId, attemptData) => request('progress/recordAttempt', { sessionId, attemptData }),
    markStageComplete: (chapterRef, stage) => request('progress/markStageComplete', { chapterRef, stage })
  };

  const revision = {
    dueItems: () => request('revision/dueItems', {})
  };

  const wrongAnswers = {
    list: (filters) => request('wronganswers/list', { filters }),
    weakTopics: () => request('wronganswers/weakTopics', {})
  };

  const bookmarks = {
    add: (contentRef) => request('bookmarks/add', { contentRef }),
    remove: (contentRef) => request('bookmarks/remove', { contentRef }),
    list: () => request('bookmarks/list', {})
  };

  const favorites = {
    add: (scopeRef) => request('favorites/add', { scopeRef }),
    remove: (scopeRef) => request('favorites/remove', { scopeRef }),
    list: () => request('favorites/list', {})
  };

  const coins = {
    spend: (cost, itemId) => request('coins/spend', { cost, itemId }),
    balance: () => request('coins/balance', {})
  };

  const xp = {
    total: () => request('xp/total', {})
  };

  const achievements = {
    list: () => request('achievements/list', {})
  };

  const certificates = {
    list: () => request('certificates/list', {})
  };

  const leaderboard = {
    personalBest: () => request('leaderboard/personalBest', {}),
    local: (profileIds) => request('leaderboard/local', { profileIds }),
    // Per-game-type XP breakdown + overall average % for the Games/Rank tabs.
    // questionCounts is { mechanicId: questionCount, ... }.
    gameXpBreakdown: (chapterRef, questionCounts) => request('leaderboard/gameXpBreakdown', { chapterRef, questionCounts })
  };

  const analytics = {
    weekly: () => request('analytics/weekly', {}),
    monthly: () => request('analytics/monthly', {}),
    lifetime: () => request('analytics/lifetime', {})
  };

  const notificationsApi = {
    list: () => request('notifications/list', {})
  };

  // Boss Battle — the 3-level exam ladder (L1 chapter / L2 subject / L3 class).
  // The backend scopes everything to the signed-in student's class + subjects,
  // so no class/subject is ever passed from the client.
  const bossBattle = {
    activePapers: () => request('bossbattle/activePapers', {}),
    pastPapers: () => request('bossbattle/pastPapers', {}),
    // Opens one paper to attempt (or read-only if past / already submitted).
    paper: (paperId) => request('bossbattle/paper', { paperId }),
    // answers is a map { qId: answer } — MCQ answer is the chosen option index.
    submit: (paperId, answers) => request('bossbattle/submit', { paperId, answers }),
    mySubmission: (paperId) => request('bossbattle/mySubmission', { paperId })
  };

  // Every admin call carries the ADMIN token explicitly.
  //
  // buildBody() only falls back to Storage.getToken() when `token` is
  // undefined — passing it here (even as null) stops a student's token from
  // ever being attached to an admin route. Null is the correct thing to send
  // when not signed in as an admin: the backend answers with a clean auth
  // error, which admin.js turns into the sign-in screen.
  const adminToken = () => Storage.getAdminToken();

  const admin = {
    login: (email, sharedSecret) => request('admin/login', { email, sharedSecret }),
    searchStudents: (query) => request('admin/searchStudents', { query, token: adminToken() }),
    activateStudent: (enrollmentId) => request('admin/activateStudent', { enrollmentId, token: adminToken() }),
    // rowKey is a Student ID, or an enrollment ID for a row that has not been
    // activated yet and therefore has no Student ID to name it by.
    setStatus: (rowKey, status, reason) => request('admin/setStatus', { rowKey, status, reason, token: adminToken() }),
    suspendStudent: (studentId, reason) => request('admin/suspendStudent', { studentId, reason, token: adminToken() }),
    upgradePlan: (studentId, newPlanCode) => request('admin/upgradePlan', { studentId, newPlanCode, token: adminToken() }),
    downgradePlan: (studentId, newPlanCode) => request('admin/downgradePlan', { studentId, newPlanCode, token: adminToken() }),
    statistics: () => request('admin/statistics', { token: adminToken() }),
    broadcast: (message, targetScope) => request('admin/broadcast', { message, targetScope, token: adminToken() })
  };

  return {
    request, flushPendingQueue, ApiError,
    auth, otp, registration, dashboard, progress, revision, wrongAnswers,
    bookmarks, favorites, coins, xp, achievements, certificates,
    leaderboard, analytics, notifications: notificationsApi, admin, bossBattle
  };
})();
