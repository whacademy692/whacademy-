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

  // Operations that mutate state — queued for retry if the network is
  // down, per the PendingSyncQueue design (Software Architecture §9).
  const MUTATING_OPERATIONS = new Set([
    'progress/sessionStart', 'progress/sessionEnd', 'progress/recordAttempt',
    'progress/markStageComplete', 'bookmarks/add', 'bookmarks/remove',
    'favorites/add', 'favorites/remove', 'coins/spend'
  ]);

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
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(buildBody(operation, params))
    });
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
    login: (studentId, pin, rememberMe) => request('auth/login', { studentId, pin, rememberMe }),
    logout: (token) => request('auth/logout', { token }),
    // Public by necessity — a student who forgot their PIN has no session.
    // The backend refuses this unless otp/verify has just succeeded for this
    // Student ID with the PasswordReset purpose (Auth.resetPin).
    resetPin: (studentId, pin, confirmPin) => request('auth/resetPin', { studentId, pin, confirmPin }),
    adminLogin: (email, sharedSecret) => request('admin/login', { email, sharedSecret })
  };

  const otp = {
    request: (studentId, email, fullName, purpose) => request('otp/request', { studentId, email, fullName, purpose }),
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
    local: (profileIds) => request('leaderboard/local', { profileIds })
  };

  const analytics = {
    weekly: () => request('analytics/weekly', {}),
    monthly: () => request('analytics/monthly', {}),
    lifetime: () => request('analytics/lifetime', {})
  };

  const notificationsApi = {
    list: () => request('notifications/list', {})
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
    leaderboard, analytics, notifications: notificationsApi, admin
  };
})();
