/* The homepage world: one living network graph filling the viewport.
   Section nodes are real graph nodes among the ambient ones — ambient nodes
   drift and link to whatever is near, so the sections read as organic hubs,
   not a diagram. The cursor is a light: nodes and edges brighten near it.
   Clicking (or keyboard-activating) a section dives the camera into the
   graph, then hands off to the panel layer via onSelect.

   Accessibility: each section is a real <button> tracking its node, so tab
   order, focus rings, and Enter all work. Reduced motion = static graph,
   instant transitions. */

function initGraphWorld(canvasId, nodeLayerId, sections, onSelect) {
  const canvas = document.getElementById(canvasId);
  const nodeLayer = document.getElementById(nodeLayerId);
  if (!canvas || !nodeLayer) return null;

  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  function hexToRgb(hex) {
    const clean = hex.trim().replace('#', '');
    const n = parseInt(clean, 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }
  const rootStyles = getComputedStyle(document.documentElement);
  const accentRgb = hexToRgb(rootStyles.getPropertyValue('--accent') || '#8b5cf6');
  const accent2Rgb = hexToRgb(rootStyles.getPropertyValue('--accent-2') || '#7d9bff');
  const textRgb = hexToRgb(rootStyles.getPropertyValue('--text') || '#e9eaf6');

  const LINK_DIST = 120;
  const SEC_LINK_DIST = 160;
  const CENTER_LINK_DIST = 190;
  const LIGHT_RADIUS = 210;
  const GRID = 90;

  const centerEl = document.getElementById('world-center');

  let W, H, ambient, secNodes, center, rafId;
  /* Smoothed cursor: physics reacts to this, so responses feel springy
     rather than snapping to every pointer jitter. */
  let smx = -9999, smy = -9999;
  let mx = -9999, my = -9999;
  let hoverId = null;

  /* Camera: pans/zooms during the dive-in. */
  const cam = { x: 0, y: 0, scale: 1, fade: 1 };

  /* Uneven, hand-picked anchors so the layout reads found, not generated.
     Narrow screens restack into a loose column. */
  function anchorsFor(w) {
    if (w < 700) {
      /* Keeps every node (and its rightward label) clear of two dead
         zones: the center headshot (~x:[0.39,0.61] y:[0.41,0.51]) and
         the bottom-left corner legend (~x:[0,0.73] y:[0.88,1]). */
      return [
        { x: 0.26, y: 0.12 }, { x: 0.68, y: 0.26 }, { x: 0.26, y: 0.60 },
        { x: 0.68, y: 0.72 }, { x: 0.44, y: 0.82 },
      ];
    }
    return [
      { x: 0.21, y: 0.26 }, { x: 0.71, y: 0.22 }, { x: 0.30, y: 0.71 },
      { x: 0.76, y: 0.64 }, { x: 0.53, y: 0.87 },
    ];
  }

  function resize() {
    W = canvas.width = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
    cam.x = W / 2; cam.y = H / 2;

    const count = Math.max(45, Math.min(130, Math.floor((W * H) / 11000)));
    ambient = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      d: 0.35 + Math.random() * 0.65,
      accent2: Math.random() < 0.18,
    }));

    center = { x: W / 2, y: H * 0.46 };

    const anchors = anchorsFor(W);
    secNodes = sections.map((s, i) => ({
      id: s.id, label: s.label,
      ax: anchors[i].x, ay: anchors[i].y,
      x: anchors[i].x * W, y: anchors[i].y * H,
      phase: Math.random() * Math.PI * 2,
      r: 6,
    }));
  }

  /* Section buttons: transparent hit targets that track their node. */
  nodeLayer.innerHTML = '';
  const buttons = {};
  sections.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'world-node';
    btn.dataset.section = s.id;
    btn.innerHTML = `<span class="world-node-label">${s.label}</span>`;
    btn.addEventListener('click', () => onSelect(s.id));
    btn.addEventListener('pointerenter', () => { hoverId = s.id; });
    btn.addEventListener('pointerleave', () => { hoverId = null; });
    btn.addEventListener('focus', () => { hoverId = s.id; });
    btn.addEventListener('blur', () => { hoverId = null; });
    nodeLayer.appendChild(btn);
    buttons[s.id] = btn;
  });

  if (finePointer) {
    window.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      mx = e.clientX - rect.left;
      my = e.clientY - rect.top;
      if (smx < -9000) { smx = mx; smy = my; }
    }, { passive: true });
  }

  function toScreen(x, y) {
    return {
      x: (x - cam.x) * cam.scale + W / 2,
      y: (y - cam.y) * cam.scale + H / 2,
    };
  }

  /* Magnetic lean: shifts a projected point toward the smoothed cursor.
     Mutates p in place; returns the pull strength (0..1). */
  function pullToward(p, radius, strength) {
    const dx = smx - p.x, dy = smy - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const k = Math.max(0, 1 - dist / radius);
    p.x += dx * k * strength;
    p.y += dy * k * strength;
    return k;
  }

  /* Cursor-light factor: 1 right under the pointer, 0 beyond the radius. */
  function light(sx, sy) {
    if (!finePointer) return 0;
    const dx = sx - mx, dy = sy - my;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return Math.max(0, 1 - dist / LIGHT_RADIUS);
  }

  function drawFrame() {
    ctx.clearRect(0, 0, W, H);

    /* Chart-paper grid: static, faint, behind everything. */
    ctx.strokeStyle = `rgba(${textRgb}, 0.045)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = (W / 2) % GRID; gx < W; gx += GRID) { ctx.moveTo(gx, 0); ctx.lineTo(gx, H); }
    for (let gy = (H / 2) % GRID; gy < H; gy += GRID) { ctx.moveTo(0, gy); ctx.lineTo(W, gy); }
    ctx.stroke();

    /* Motion is reactive, not ambient: small nodes bow away from the cursor
       (a wake), while section nodes and the headshot lean toward it (a
       magnet — which also makes them easier to hover). No idle wander. */
    const all = ambient.map(n => {
      const p = toScreen(n.x, n.y);
      const dx = p.x - smx, dy = p.y - smy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = Math.max(0, 1 - dist / 110);
      if (k > 0) { p.x += (dx / dist) * k * k * 28 * n.d; p.y += (dy / dist) * k * k * 28 * n.d; }
      return { ...p, d: n.d, accent2: n.accent2 };
    });
    const secs = secNodes.map(n => {
      const p = toScreen(n.x, n.y);
      const k = pullToward(p, 170, 0.24);
      return { ...p, n, lit: k };
    });
    const c = toScreen(center.x, center.y);
    pullToward(c, 220, 0.08);

    ctx.lineWidth = 1;
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LINK_DIST) {
          const lit = (light(a.x, a.y) + light(b.x, b.y)) / 2;
          const alpha = (1 - dist / LINK_DIST) * (0.10 + 0.45 * lit) * cam.fade;
          if (alpha > 0.015) {
            ctx.strokeStyle = `rgba(${accentRgb}, ${alpha})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      /* Ambient-to-center edges: the headshot is a node like any other. */
      {
        const dx = a.x - c.x, dy = a.y - c.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CENTER_LINK_DIST && dist > 44) {
          const lit = (light(a.x, a.y) + light(c.x, c.y)) / 2;
          const alpha = (1 - dist / CENTER_LINK_DIST) * (0.12 + 0.4 * lit) * cam.fade;
          if (alpha > 0.015) {
            ctx.strokeStyle = `rgba(${accentRgb}, ${alpha})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
          }
        }
      }
      /* Ambient-to-section edges: sections join the graph like any node. */
      for (const s of secs) {
        const dx = a.x - s.x, dy = a.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < SEC_LINK_DIST) {
          const lit = Math.max((light(a.x, a.y) + light(s.x, s.y)) / 2, s.n.id === hoverId ? 0.9 : 0);
          const alpha = (1 - dist / SEC_LINK_DIST) * (0.14 + 0.5 * lit) * cam.fade;
          if (alpha > 0.015) {
            ctx.strokeStyle = `rgba(${accent2Rgb}, ${alpha})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(s.x, s.y); ctx.stroke();
          }
        }
      }
    }

    all.forEach(p => {
      const lit = light(p.x, p.y);
      const alpha = (0.25 + 0.45 * p.d + 0.35 * lit) * cam.fade;
      const r = (0.8 + p.d * 1.4) * (1 + lit * 0.5);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.accent2 ? accent2Rgb : textRgb}, ${Math.min(1, alpha)})`;
      ctx.fill();
    });

    secs.forEach(s => {
      const lit = Math.max(light(s.x, s.y), s.n.id === hoverId ? 1 : 0);
      const r = s.n.r * (1 + lit * 0.35) * cam.scale;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${accentRgb}, ${(0.35 + 0.55 * lit) * cam.fade})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${accent2Rgb}, ${(0.75 + 0.25 * lit) * cam.fade})`;
      ctx.fill();
      ctx.lineWidth = 1;

      const btn = buttons[s.n.id];
      btn.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
      btn.style.opacity = cam.fade;
    });

    if (centerEl) {
      centerEl.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%, -50%) scale(${cam.scale})`;
      centerEl.style.opacity = cam.fade;
    }
  }

  function step() {
    if (canvas.offsetWidth !== W || canvas.offsetHeight !== H) resize();
    ambient.forEach(n => {
      n.x += n.vx * n.d; n.y += n.vy * n.d;
      if (n.x < -20) n.x = W + 20; if (n.x > W + 20) n.x = -20;
      if (n.y < -20) n.y = H + 20; if (n.y > H + 20) n.y = -20;
    });
    if (smx < -9000) { smx = mx; smy = my; }
    smx += (mx - smx) * 0.1;
    smy += (my - smy) * 0.1;
    drawFrame();
    rafId = requestAnimationFrame(step);
  }

  /* Dive into a node: camera pans to it and zooms while the rest fades. */
  function flyTo(id) {
    const node = secNodes.find(n => n.id === id);
    if (!node || reduceMotion) return Promise.resolve();
    return new Promise(resolve => {
      const from = { x: cam.x, y: cam.y, scale: 1 };
      const duration = 520;
      const start = performance.now();
      function tick(now) {
        const p = Math.min(1, (now - start) / duration);
        const e = 1 - Math.pow(1 - p, 3);
        cam.x = from.x + (node.x - from.x) * e;
        cam.y = from.y + (node.y - from.y) * e;
        cam.scale = 1 + 1.6 * e;
        cam.fade = 1 - 0.75 * e;
        if (p < 1) requestAnimationFrame(tick); else resolve();
      }
      requestAnimationFrame(tick);
    });
  }

  function flyBack() {
    if (reduceMotion) { cam.x = W / 2; cam.y = H / 2; cam.scale = 1; cam.fade = 1; drawFrame(); return; }
    const from = { x: cam.x, y: cam.y, scale: cam.scale, fade: cam.fade };
    const duration = 420;
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      cam.x = from.x + (W / 2 - from.x) * e;
      cam.y = from.y + (H / 2 - from.y) * e;
      cam.scale = from.scale + (1 - from.scale) * e;
      cam.fade = from.fade + (1 - from.fade) * e;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  resize();
  if (reduceMotion) {
    drawFrame();
  } else {
    step();
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      if (reduceMotion) drawFrame();
    }, 150);
  });

  return { flyTo, flyBack, stop() { if (rafId) cancelAnimationFrame(rafId); } };
}
