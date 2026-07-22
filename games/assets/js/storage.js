/**
 * storage.js — W.H. Academy
 * Storage Abstraction Layer (Software Architecture §7).
 * Frontend code never touches localStorage directly — everything goes
 * through this interface, so a future provider swap (e.g. IndexedDB for
 * high-volume caches) never requires touching call sites.
 */

const Storage = (() => {

  const NAMESPACE = 'wha';

  function key(k) { return `${NAMESPACE}:${k}`; }

  function get(k, fallback = null) {
    try {
      const raw = window.localStorage.getItem(key(k));
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Storage.get failed', k, e);
      return fallback;
    }
  }

  function set(k, value) {
    try {
      window.localStorage.setItem(key(k), JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage.set failed (quota exceeded or private mode?)', k, e);
      return false;
    }
  }

  function remove(k) {
    try {
      window.localStorage.removeItem(key(k));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearAll() {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith(`${NAMESPACE}:`))
      .forEach((k) => window.localStorage.removeItem(k));
  }

  /** Lists keys under a prefix (mirrors the Storage Provider Interface's list()). */
  function list(prefix = '') {
    return Object.keys(window.localStorage)
      .filter((k) => k.startsWith(key(prefix)))
      .map((k) => k.slice(NAMESPACE.length + 1));
  }

  // ---- Session token (short-lived, per Session.gs's JWT-style tokens) ----
  function getToken() { return get('session_token', null); }
  function setToken(token) { return set('session_token', token); }
  function clearToken() { return remove('session_token'); }

  // The admin session is kept in its own slot, NOT in session_token.
  //
  // They are different roles with different tokens, and sharing one slot would
  // break both directions: an admin token in session_token would satisfy
  // router.js's guard and let the admin walk into the student dashboard, where
  // every student route would then fail on a role mismatch; and logging in as a
  // student would silently end the admin session. Separate slots mean you can
  // be signed into both at once, which is genuinely useful when checking what a
  // student sees.
  function getAdminToken() { return get('admin_token', null); }
  function setAdminToken(token) { return set('admin_token', token); }
  function clearAdminToken() { return remove('admin_token'); }

  function getStudentId() { return get('student_id', null); }
  function setStudentId(id) { return set('student_id', id); }

  // ---- Dashboard cache (instant paint on return visits, refreshed after network read) ----
  function getCachedDashboard() { return get('dashboard_cache', null); }
  function setCachedDashboard(data) { return set('dashboard_cache', { data, cachedAt: Date.now() }); }

  // ---- Settings (theme, text size, motion, sound — mirrors Settings tab) ----
  // Default is LIGHT, deliberately — never 'auto'. 'auto' followed the
  // device's OS setting, which is why the platform appeared dark on
  // dark-mode devices. The main W.H. Academy website is light-only, so this
  // matches it. Dark stays available only as an explicit opt-in.
  const DEFAULT_SETTINGS = {
    theme: 'light',
    textSize: 'default',
    motionReduced: false,
    soundEnabled: true,
    teacherModeEnabled: false
  };
  function getSettings() { return Object.assign({}, DEFAULT_SETTINGS, get('settings', {})); }
  function setSettings(partial) {
    const merged = Object.assign({}, getSettings(), partial);
    set('settings', merged);
    return merged;
  }

  // ---- Offline write queue (Software Architecture §9's PendingSyncQueue) ----
  function queuePendingWrite(operation, params) {
    const queue = get('pending_queue', []);
    queue.push({ id: Utils.generateId('PEND'), operation, params, queuedAt: Utils.nowIso() });
    set('pending_queue', queue);
  }
  function getPendingQueue() { return get('pending_queue', []); }
  function clearPendingQueueItem(id) {
    const queue = getPendingQueue().filter((item) => item.id !== id);
    set('pending_queue', queue);
  }

  // ---- In-progress game session (resume support) ----
  function getActiveGameSession() { return get('active_game_session', null); }
  function setActiveGameSession(session) { return set('active_game_session', session); }
  function clearActiveGameSession() { return remove('active_game_session'); }

  return {
    get, set, remove, clearAll, list,
    getToken, setToken, clearToken,
    getAdminToken, setAdminToken, clearAdminToken,
    getStudentId, setStudentId,
    getCachedDashboard, setCachedDashboard,
    getSettings, setSettings,
    queuePendingWrite, getPendingQueue, clearPendingQueueItem,
    getActiveGameSession, setActiveGameSession, clearActiveGameSession
  };
})();
