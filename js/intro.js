/* Full-screen intro journey: plays once per session before revealing the
   explorable site. Always skippable — first scroll, click, keypress, or the
   explicit button dismisses it. Reduced motion or a repeat visit this
   session skips straight to the real page. */

(function () {
  const overlay = document.getElementById('intro-overlay');
  if (!overlay) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const alreadySeen = sessionStorage.getItem('introSeen') === '1';

  if (reduceMotion || alreadySeen) {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    return;
  }

  document.body.style.overflow = 'hidden';
  const INTRO_BASE_SPEED = 3.2;
  const tunnel = initIntroTunnel('intro-canvas');
  let dismissed = false;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    overlay.removeEventListener('wheel', onWheel);
    overlay.removeEventListener('touchstart', dismiss);
    overlay.removeEventListener('click', dismiss);
    window.removeEventListener('keydown', dismiss);
    decelerateThenReveal();
  }

  /* Ease the tunnel down to a stop before fading, so arriving feels like
     slowing down rather than the motion being cut off mid-flight. */
  function decelerateThenReveal() {
    const duration = 550;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      if (tunnel) tunnel.setBaseSpeed(INTRO_BASE_SPEED * (1 - eased));
      if (t < 1) requestAnimationFrame(tick);
      else reveal();
    }
    requestAnimationFrame(tick);
  }

  function reveal() {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    sessionStorage.setItem('introSeen', '1');
    if (tunnel) tunnel.stop();
  }

  function onWheel(e) {
    e.preventDefault();
    dismiss();
  }

  overlay.addEventListener('wheel', onWheel, { passive: false });
  overlay.addEventListener('touchstart', dismiss, { passive: true });
  overlay.addEventListener('click', dismiss);
  window.addEventListener('keydown', dismiss);
  document.getElementById('intro-skip').addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss();
  });
})();
