/* Shared helpers: data fetching, nav/footer injection, hero animation. */

const DATA_BASE = '/data/';

async function fetchJSON(name) {
  const res = await fetch(`${DATA_BASE}${name}.json`);
  if (!res.ok) throw new Error(`Failed to load ${name}.json`);
  return res.json();
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

const NAV_LINKS = [
  { href: '/index.html', label: 'Home' },
  { href: '/projects.html', label: 'Projects' },
  { href: '/experience.html', label: 'Experience' },
  { href: '/blog.html', label: 'Blog' },
];

function currentPage() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  return path;
}

function renderNav() {
  const mount = document.getElementById('site-nav');
  if (!mount) return;
  const page = currentPage();
  const links = NAV_LINKS.map(link => {
    const active = link.href.endsWith(page) ? ' active' : '';
    return `<a href="${link.href}" class="${active.trim()}">${link.label}</a>`;
  }).join('');

  mount.innerHTML = `
    <div class="container">
      <a href="/index.html" class="brand">Abigail<span>.</span>Lindemann</a>
      <button class="nav-toggle" aria-expanded="false" aria-controls="nav-links" aria-label="Toggle navigation">Menu</button>
      <nav class="nav-links" id="nav-links">${links}</nav>
    </div>
  `;

  const toggle = mount.querySelector('.nav-toggle');
  const navList = mount.querySelector('.nav-links');
  toggle.addEventListener('click', () => {
    const open = navList.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
}

async function renderFooter() {
  const mount = document.getElementById('site-footer');
  if (!mount) return;
  let profile = {};
  try { profile = await fetchJSON('profile'); } catch (e) { /* footer still renders without links */ }
  const links = profile.links || {};
  const year = new Date().getFullYear();

  mount.innerHTML = `
    <div class="container">
      <div class="footer-links">
        ${links.email ? `<a href="mailto:${links.email}">Email</a>` : ''}
        ${links.linkedin ? `<a href="https://${links.linkedin}" target="_blank" rel="noopener">LinkedIn</a>` : ''}
        ${links.github ? `<a href="https://${links.github}" target="_blank" rel="noopener">GitHub</a>` : ''}
      </div>
      <p class="footer-note">&copy; ${year} Abigail Lindemann. Built with vanilla HTML/CSS/JS.</p>
    </div>
  `;
}

/* ---- Small abstract per-project motifs (data-viz flavor, not literal icons) ---- */
const PROJECT_MOTIFS = {
  /* Bexar County: an abstract county-boundary outline with scattered block-group dots inside it */
  map: `
    <svg viewBox="0 0 280 64" class="motif" aria-hidden="true">
      <path d="M30,20 L68,9 L118,17 L152,10 L192,21 L214,38 L182,55 L120,57 L68,52 L38,43 Z"
        style="fill:none; stroke:var(--accent); stroke-width:1.5; opacity:0.75;"/>
      <g style="fill:var(--accent-2);">
        <circle cx="72" cy="27" r="2.5"/>
        <circle cx="112" cy="30" r="2.5"/>
        <circle cx="150" cy="24" r="2.5"/>
        <circle cx="92" cy="41" r="2.5"/>
        <circle cx="168" cy="34" r="2.5"/>
        <circle cx="130" cy="43" r="2.5"/>
      </g>
    </svg>
  `,
  /* ITS benchmarking: two overlapping radar polygons — Trinity vs. the peer set */
  bars: `
    <svg viewBox="0 0 280 64" class="motif" aria-hidden="true">
      <polygon points="140,6 172,26 160,54 120,54 108,26"
        style="fill:none; stroke:var(--accent); stroke-width:1.5;"/>
      <polygon points="140,18 158,30 151,48 129,48 122,30"
        style="fill:var(--accent-2); opacity:0.25; stroke:var(--accent-2); stroke-width:1.5;"/>
    </svg>
  `,
  /* Swim & Dive: wavy pool-lane lines instead of a generic trend line */
  trend: `
    <svg viewBox="0 0 280 64" class="motif" aria-hidden="true">
      <g style="fill:none; stroke-width:1.5; opacity:0.75;">
        <path d="M10,16 Q30,9 50,16 T90,16 T130,16 T170,16 T210,16 T250,16" style="stroke:var(--accent);"/>
        <path d="M10,32 Q30,25 50,32 T90,32 T130,32 T170,32 T210,32 T250,32" style="stroke:var(--accent-2);"/>
        <path d="M10,48 Q30,41 50,48 T90,48 T130,48 T170,48 T210,48 T250,48" style="stroke:var(--accent);"/>
      </g>
    </svg>
  `,
  /* Publication pipeline: papers moving along a line toward an arrow */
  flow: `
    <svg viewBox="0 0 280 64" class="motif" aria-hidden="true">
      <line x1="20" y1="32" x2="248" y2="32" style="stroke:var(--accent); stroke-width:1.5; stroke-dasharray:3 5; opacity:0.5;"/>
      <g>
        <rect x="34" y="20" width="15" height="19" rx="2" style="fill:var(--accent-2);"/>
        <rect x="104" y="20" width="15" height="19" rx="2" style="fill:var(--accent);"/>
        <rect x="174" y="20" width="15" height="19" rx="2" style="fill:var(--accent-2);"/>
      </g>
      <path d="M228,22 L246,32 L228,42" style="fill:none; stroke:var(--accent); stroke-width:2;"/>
    </svg>
  `,
};

function projectMotifSVG(motif) {
  return PROJECT_MOTIFS[motif] || '';
}

document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  renderFooter();
});
