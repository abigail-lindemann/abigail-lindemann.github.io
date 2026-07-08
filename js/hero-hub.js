/* Interactive hub-and-spoke nav: headshot bubble branching to page nodes. */

function initHeroHub(containerId, profile) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  container.classList.toggle('no-motion', reduceMotion);

  const nodes = [
    { label: 'Projects', href: '/projects.html', angle: -100 },
    { label: 'Experience', href: '/experience.html', angle: -15 },
    { label: 'Blog', href: '/blog.html', angle: 60 },
    { label: 'Contact', href: '#contact', angle: 155 },
  ];

  function layout() {
    const rect = container.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const cx = w / 2, cy = h / 2;
    const radius = Math.min(w, h) * 0.42;

    const points = nodes.map(n => {
      const rad = (n.angle * Math.PI) / 180;
      return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
    });

    const edges = points.map((p, i) => `
      <line class="hub-edge" x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" style="animation-delay:${i * 0.2}s"></line>
    `).join('');

    const centerHTML = profile.photo
      ? `<img src="${escapeHTML(profile.photo)}" alt="${escapeHTML(profile.name || 'Abigail Lindemann')}">`
      : `<span class="hub-monogram">${escapeHTML((profile.name || 'A L').split(' ').map(w => w[0]).join('').slice(0, 2))}</span>`;

    const nodeHTML = nodes.map((n, i) => `
      <a class="hub-node" href="${n.href}" style="left:${points[i].x}px; top:${points[i].y}px;" aria-label="Go to ${escapeHTML(n.label)}">
        <span class="hub-dot"></span>
        <span class="hub-tooltip" aria-hidden="true">${escapeHTML(n.label)}</span>
      </a>
    `).join('');

    container.innerHTML = `
      <svg class="hub-svg" aria-hidden="true">${edges}</svg>
      <div class="hub-center" style="left:${cx}px; top:${cy}px;">${centerHTML}</div>
      ${nodeHTML}
    `;
  }

  layout();
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 150);
  });
}
