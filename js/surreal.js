/* Surreal layer, shared by every page: aurora drift behind the network,
   a cursor glow, scroll-reveal on sections/cards, and 3D tilt on cards.
   Injects its own DOM so pages only need this one script tag. Everything
   is skipped or static under prefers-reduced-motion, and pointer effects
   are skipped on touch devices. */

(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  /* The graph-world homepage keeps a flat, technical backdrop — no aurora
     blobs there. Reading pages keep the subtle wash. */
  const isWorld = document.body.classList.contains('is-world');

  /* ---- Ambient network on pages that don't already have one ---- */
  if (typeof initBgNetwork === 'function' && !document.getElementById('bg-network')) {
    const canvas = document.createElement('canvas');
    canvas.className = 'bg-network';
    canvas.id = 'bg-network';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);
    initBgNetwork('bg-network');
  }

  /* ---- Aurora: drifting blobs, prepended last so they sit behind the canvas ---- */
  if (!isWorld) {
    const aurora = document.createElement('div');
    aurora.className = 'bg-aurora';
    aurora.setAttribute('aria-hidden', 'true');
    aurora.append(...[0, 1, 2].map(() => document.createElement('span')));
    document.body.prepend(aurora);
  }

  /* ---- Cursor glow: lerps toward the pointer so it trails dreamily ---- */
  if (finePointer && !reduceMotion) {
    const glow = document.createElement('div');
    glow.className = 'cursor-glow';
    glow.setAttribute('aria-hidden', 'true');
    document.body.append(glow);

    let tx = -600, ty = -600, x = -600, y = -600, raf = null;
    function tick() {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      glow.style.transform = `translate(${x}px, ${y}px)`;
      if (Math.abs(tx - x) + Math.abs(ty - y) > 0.5) raf = requestAnimationFrame(tick);
      else raf = null;
    }
    window.addEventListener('pointermove', (e) => {
      tx = e.clientX;
      ty = e.clientY;
      glow.classList.add('on');
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => glow.classList.remove('on'));
  }

  /* ---- Scroll reveal: sections and cards surface as they enter view.
     Skipped on the graph-world homepage — nothing scrolls there, and the
     reveal transforms would fight the panel's own positioning. ---- */
  const revealables = document.body.classList.contains('is-world')
    ? []
    : document.querySelectorAll('main section, .card');
  if (!reduceMotion && 'IntersectionObserver' in window && revealables.length > 0) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });
    revealables.forEach((el) => {
      el.classList.add('reveal');
      io.observe(el);
    });
    /* Cards are rendered async from JSON — catch ones added after load. */
    const mo = new MutationObserver((muts) => {
      muts.forEach((m) => m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        const cards = node.matches?.('.card') ? [node] : [...node.querySelectorAll?.('.card') ?? []];
        cards.forEach((card) => {
          if (card.classList.contains('reveal')) return;
          card.classList.add('reveal');
          io.observe(card);
        });
      }));
    });
    mo.observe(document.querySelector('main') || document.body, { childList: true, subtree: true });
  }

  /* ---- Card tilt: delegated so it works on async-rendered cards too ---- */
  if (finePointer && !reduceMotion) {
    const MAX_DEG = 5;
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest?.('.card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      card.classList.add('tilting');
      card.parentElement?.classList.add('tilt-wrap');
      card.style.transform = `rotateX(${(-ny * MAX_DEG).toFixed(2)}deg) rotateY(${(nx * MAX_DEG).toFixed(2)}deg)`;
      card.style.setProperty('--tilt-x', `${((nx + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty('--tilt-y', `${((ny + 0.5) * 100).toFixed(1)}%`);
    }, { passive: true });
    document.addEventListener('pointerout', (e) => {
      const card = e.target.closest?.('.card');
      if (!card || card.contains(e.relatedTarget)) return;
      card.style.transform = '';
      card.classList.remove('tilting');
    }, { passive: true });
  }
})();
