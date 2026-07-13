/**
 * animations.js — W.H. Academy
 * Central Animation Engine. Checks prefers-reduced-motion in exactly
 * one place (Design System §11) so no individual component needs to
 * remember to check it.
 */

const Animations = (() => {

  function reducedMotionPreferred() {
    if (Storage.getSettings().motionReduced) return true;
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Applies a correct/incorrect feedback state to an element, respecting reduced motion. */
  function showAnswerFeedback(el, isCorrect) {
    el.dataset.feedback = isCorrect ? 'correct' : 'incorrect';
    if (!isCorrect && !reducedMotionPreferred()) {
      el.classList.add('anim-shake');
      el.addEventListener('animationend', () => el.classList.remove('anim-shake'), { once: true });
    }
  }

  function clearAnswerFeedback(el) {
    delete el.dataset.feedback;
  }

  /** Rare, celebration-tier moment — Boss Battle clear, Certificate earned, Mastery achievement. */
  function celebrate(targetEl) {
    if (reducedMotionPreferred()) {
      targetEl.classList.add('anim-fade-in');
      return;
    }
    targetEl.classList.add('anim-celebration');
    spawnConfetti(targetEl);
  }

  function spawnConfetti(anchorEl) {
    if (reducedMotionPreferred()) return;
    const colors = ['#1F3864', '#2E7D46', '#C4293C', '#F2A93B', '#4B4FCC'];
    const rect = anchorEl.getBoundingClientRect();
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.top}px`;
    container.style.width = `${rect.width}px`;
    container.style.pointerEvents = 'none';
    container.style.zIndex = '2100';
    document.body.appendChild(container);

    for (let i = 0; i < 24; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random() * 150}ms`;
      container.appendChild(piece);
    }
    setTimeout(() => container.remove(), 1200);
  }

  /** Fades a skeleton out and the real content in, once data has loaded. */
  function revealContent(skeletonEl, contentEl) {
    skeletonEl.style.display = 'none';
    contentEl.hidden = false;
    if (!reducedMotionPreferred()) contentEl.classList.add('anim-fade-in-up');
  }

  /** Animates a numeric counter (e.g. XP total) counting up rather than jumping. */
  function countUp(el, from, to, durationMs = 600) {
    if (reducedMotionPreferred() || from === to) {
      el.textContent = to.toLocaleString();
      return;
    }
    const start = performance.now();
    function step(now) {
      const progress = Utils.clamp((now - start) / durationMs, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(from + (to - from) * eased);
      el.textContent = value.toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function animateProgressRing(circleEl, fraction, circumference) {
    const offset = circumference * (1 - Utils.clamp(fraction, 0, 1));
    circleEl.style.strokeDasharray = `${circumference} ${circumference}`;
    circleEl.style.strokeDashoffset = reducedMotionPreferred() ? offset : circumference;
    if (!reducedMotionPreferred()) {
      requestAnimationFrame(() => { circleEl.style.strokeDashoffset = offset; });
    }
  }

  return {
    reducedMotionPreferred, showAnswerFeedback, clearAnswerFeedback,
    celebrate, spawnConfetti, revealContent, countUp, animateProgressRing
  };
})();
