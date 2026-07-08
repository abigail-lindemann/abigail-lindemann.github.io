/* Engine for the data-network depth/tunnel effect: nodes with real
   perspective drift toward the camera and respawn far away once passed.
   Runs as the fixed background on every page. */

function createNetworkTunnel(canvas, opts) {
  const options = Object.assign({
    density: 9000,        // px^2 per node
    minNodes: 60,
    maxNodes: 160,
    baseSpeed: 0.6,
    reactToScroll: false,
    reactToPointer: false,
    linkDist: 90,
  }, opts);

  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const Z_FAR = 1200;
  const Z_NEAR = 40;
  const FOCAL = 300;
  let width, height, nodes, rafId;

  function hexToRgb(hex) {
    const clean = hex.trim().replace('#', '');
    const bigint = parseInt(clean, 16);
    return `${(bigint >> 16) & 255}, ${(bigint >> 8) & 255}, ${bigint & 255}`;
  }
  const rootStyles = getComputedStyle(document.documentElement);
  const accentRgb = hexToRgb(rootStyles.getPropertyValue('--accent') || '#8b5cf6');
  const accent2Rgb = hexToRgb(rootStyles.getPropertyValue('--accent-2') || '#38bdf8');

  function makeNode() {
    return {
      x: (Math.random() - 0.5) * 900,
      y: (Math.random() - 0.5) * 900,
      z: Z_NEAR + Math.random() * (Z_FAR - Z_NEAR),
      accent2: Math.random() < 0.15,
    };
  }

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    const count = Math.max(options.minNodes, Math.min(options.maxNodes, Math.floor((width * height) / options.density)));
    nodes = Array.from({ length: count }, makeNode);
  }

  /* Pointer parallax: the vanishing point drifts toward the cursor, so the
     whole field leans as you move — nearer nodes shift more than distant
     ones because the offset is applied in world space before projection. */
  let targetPx = 0, targetPy = 0, px = 0, py = 0;
  if (options.reactToPointer && !reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', (e) => {
      targetPx = (e.clientX / window.innerWidth - 0.5) * 120;
      targetPy = (e.clientY / window.innerHeight - 0.5) * 120;
    }, { passive: true });
  }

  function project(n) {
    const scale = FOCAL / n.z;
    return { x: width / 2 + (n.x - px) * scale, y: height / 2 + (n.y - py) * scale, scale };
  }

  let scrollVelocity = 0;
  if (options.reactToScroll) {
    let lastScrollY = window.scrollY;
    window.addEventListener('scroll', () => {
      const dy = window.scrollY - lastScrollY;
      lastScrollY = window.scrollY;
      scrollVelocity = Math.min(scrollVelocity + Math.abs(dy) * 0.6, 45);
    }, { passive: true });
  }

  function drawFrame() {
    ctx.clearRect(0, 0, width, height);
    const projected = nodes.map(project);

    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      const a = projected[i];
      if (a.x < -80 || a.x > width + 80 || a.y < -80 || a.y > height + 80) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = projected[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < options.linkDist) {
          const depthFactor = Math.min(1, (a.scale + b.scale) / 6);
          const alpha = (1 - dist / options.linkDist) * 0.32 * depthFactor;
          if (alpha > 0.02) {
            ctx.strokeStyle = `rgba(${accentRgb}, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
    }

    nodes.forEach((n, i) => {
      const p = projected[i];
      if (p.x < -50 || p.x > width + 50 || p.y < -50 || p.y > height + 50) return;
      const alpha = Math.min(1, p.scale * 1.3);
      const radius = Math.max(0.6, p.scale * 1.6);
      const rgb = n.accent2 ? accent2Rgb : accentRgb;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
      ctx.fill();
    });
  }

  function step() {
    scrollVelocity *= 0.92;
    px += (targetPx - px) * 0.04;
    py += (targetPy - py) * 0.04;
    const speed = options.baseSpeed + scrollVelocity;
    nodes.forEach(n => {
      n.z -= speed;
      if (n.z < Z_NEAR) {
        n.z = Z_FAR;
        n.x = (Math.random() - 0.5) * 900;
        n.y = (Math.random() - 0.5) * 900;
      }
    });
    drawFrame();
    rafId = requestAnimationFrame(step);
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

  return {
    stop() { if (rafId) cancelAnimationFrame(rafId); },
    setBaseSpeed(v) { options.baseSpeed = v; },
  };
}

/* Ambient page background: the dense drifting field runs everywhere,
   scroll adds warp-speed bursts, the pointer steers the parallax. */
function initBgNetwork(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  return createNetworkTunnel(canvas, { baseSpeed: 1.1, reactToScroll: true, reactToPointer: true, density: 6000, minNodes: 90, maxNodes: 220, linkDist: 110 });
}
