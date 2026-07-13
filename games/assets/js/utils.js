/**
 * utils.js — W.H. Academy
 * Pure, reusable helper functions. No DOM access, no side effects.
 */

const Utils = (() => {

  /** Generates a RFC4122-ish UUID using crypto when available. */
  function generateId(prefix) {
    const uuid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    return prefix ? `${prefix}-${uuid}` : uuid;
  }

  /** ISO 8601 UTC timestamp, matching the backend's storage convention. */
  function nowIso() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function formatDateOnly(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().slice(0, 10);
  }

  /** Friendly relative-ish date for UI display (e.g. "Today", "Yesterday", "3 Jul"). */
  function formatFriendlyDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const today = new Date();
    const diffDays = Math.round((new Date(formatDateOnly(today)) - new Date(formatDateOnly(date))) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function debounce(fn, waitMs) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), waitMs);
    };
  }

  function throttle(fn, waitMs) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= waitMs) {
        last = now;
        fn(...args);
      }
    };
  }

  function isValidEmailFormat(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  function isValidStudentIdFormat(value) {
    // Accepts BOTH ID shapes. The stream segment (Class 9-12) is optional, so
    // every ID issued before the stream was introduced stays valid forever —
    // an ID is a permanent primary key and can never be rewritten.
    //   WHA-2026-C08-000001        Class 1-8
    //   WHA-2026-C09-BIO-000001    Class 9-12 (BIO | CS | PMED | PENG | ICS)
    return typeof value === 'string' && /^WHA-\d{4}-C\d{2}(-[A-Z]{2,4})?-\d{6}$/.test(value.trim());
  }

  /** Escapes HTML-sensitive characters before inserting user text into innerHTML. */
  function escapeHtml(value) {
    if (typeof value !== 'string') return '';
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function formatPercent(fraction, decimals = 0) {
    if (typeof fraction !== 'number' || Number.isNaN(fraction)) return '0%';
    return `${(fraction * 100).toFixed(decimals)}%`;
  }

  function pluralize(count, singular, plural) {
    return count === 1 ? singular : (plural || `${singular}s`);
  }

  /** Fisher–Yates shuffle, returns a new array. Used for option/question order randomization. */
  function shuffle(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function qs(selector, scope) { return (scope || document).querySelector(selector); }
  function qsa(selector, scope) { return Array.from((scope || document).querySelectorAll(selector)); }

  function createEl(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'html') el.innerHTML = value;
      else if (key.startsWith('data-') || key.startsWith('aria-') || key === 'role') el.setAttribute(key, value);
      else el[key] = value;
    });
    (Array.isArray(children) ? children : [children]).forEach((child) => {
      if (child == null) return;
      el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return el;
  }

  function getSubjectFromChapterRef(chapterRef) {
    if (!chapterRef) return 'science';
    const match = String(chapterRef).match(/subjects\/([a-z_]+)/i);
    return match ? match[1].replace(/_/g, '') : 'science';
  }

  return {
    generateId, nowIso, formatDateOnly, formatFriendlyDate,
    debounce, throttle, isValidEmailFormat, isValidStudentIdFormat,
    escapeHtml, clamp, formatPercent, pluralize, shuffle,
    qs, qsa, createEl, getSubjectFromChapterRef
  };
})();
