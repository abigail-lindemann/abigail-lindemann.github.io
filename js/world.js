/* Panel layer + hash routing for the homepage graph world.
   Content stays plain and readable — the surreal stuff lives outside the
   panel. Every section also links to its full standalone page, so nothing
   is reachable only through the graph. */

const WORLD_SECTIONS = [
  { id: 'about', label: 'about' },
  { id: 'projects', label: 'projects' },
  { id: 'experience', label: 'experience & skills' },
  { id: 'blog', label: 'blog' },
  { id: 'contact', label: 'contact' },
];

let worldGraph = null;
let activePanel = null;
let lastFocused = null;

async function renderWorld() {
  const profile = await fetchJSON('profile');

  /* Legend block, not a hero: name, role, and the factual one-liner. */
  const idEl = document.getElementById('world-id');
  idEl.innerHTML = `
    <h1>Abigail Lindemann</h1>
    <p class="world-role">${escapeHTML(profile.kicker)}</p>
    <p>${escapeHTML(profile.heroSubline)}</p>
  `;

  worldGraph = initGraphWorld('bg-network', 'world-nodes', WORLD_SECTIONS, openSection);
  document.getElementById('world-center').addEventListener('click', () => openSection('about'));

  window.addEventListener('hashchange', syncFromHash);
  syncFromHash(true);
}

function syncFromHash(initial) {
  const id = window.location.hash.replace('#', '');
  if (WORLD_SECTIONS.some(s => s.id === id)) {
    showPanel(id, { instant: initial === true });
  } else if (activePanel) {
    closePanel({ fromHash: true });
  }
}

function openSection(id) {
  if (activePanel === id) return;
  history.pushState(null, '', `#${id}`);
  showPanel(id, {});
}

async function showPanel(id, { instant }) {
  lastFocused = document.activeElement;
  if (!instant && worldGraph) await worldGraph.flyTo(id);

  const backdrop = document.getElementById('world-backdrop');
  const panel = document.getElementById('world-panel');
  const section = WORLD_SECTIONS.find(s => s.id === id);

  let body = '<p class="text-muted">Could not load this section.</p>';
  try { body = await PANEL_RENDERERS[id](); } catch (e) { /* keep fallback */ }

  panel.innerHTML = `
    <div class="panel-head">
      <h2>${escapeHTML(section.label)}</h2>
      <button class="panel-close" id="panel-close" aria-label="Close and return to the graph">&times;</button>
    </div>
    <div class="panel-body">${body}</div>
  `;
  backdrop.classList.add('open');
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  activePanel = id;

  document.getElementById('panel-close').addEventListener('click', () => closePanel({}));
  backdrop.onclick = () => closePanel({});
  panel.querySelector('.panel-close').focus();
}

function closePanel({ fromHash }) {
  const backdrop = document.getElementById('world-backdrop');
  const panel = document.getElementById('world-panel');
  backdrop.classList.remove('open');
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  activePanel = null;
  if (!fromHash) history.pushState(null, '', window.location.pathname);
  if (worldGraph) worldGraph.flyBack();
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activePanel) closePanel({});
});

/* ---- Section content, rendered from the same JSON the subpages use ---- */

const PANEL_RENDERERS = {
  async about() {
    const profile = await fetchJSON('profile');
    const paragraphs = profile.about.paragraphs
      .map(p => escapeHTML(p).replace('[[projects]]', '<a class="text-link" href="#projects">projects</a>'))
      .map(p => `<p>${p}</p>`).join('');
    return `
      ${paragraphs}
      <p>${escapeHTML(profile.about.closing)}</p>
      <p class="lede">${escapeHTML(profile.about.aiNote)}</p>
      <div class="bits-list">${profile.personalBits.map(b => `<span class="bit">${escapeHTML(b)}</span>`).join('')}</div>
    `;
  },

  async projects() {
    const projects = await fetchJSON('projects');
    const sorted = [...projects].sort((a, b) => new Date(b.date) - new Date(a.date));
    return sorted.map(p => `
      <article class="panel-item">
        <span class="date">${escapeHTML(p.displayDate)}${p.status === 'ongoing' ? ' · <span class="badge-ongoing">Ongoing</span>' : ''}</span>
        <h3>${escapeHTML(p.title)}</h3>
        <p>${escapeHTML(p.summary)}</p>
        ${p.stat ? `<div class="card-stat"><span class="stat-value">${escapeHTML(p.stat.value)}</span><span class="stat-label">${escapeHTML(p.stat.label)}</span></div>` : ''}
        <ul>${p.detail.map(d => `<li>${escapeHTML(d)}</li>`).join('')}</ul>
        <div class="tags">${p.tags.map(t => `<span class="tag" data-cat="${t.cat}">${escapeHTML(t.label)}</span>`).join('')}</div>
        <div class="card-links">
          ${p.links.live ? `<a class="text-link" href="${p.links.live}" target="_blank" rel="noopener">Live site</a>` : ''}
          ${p.links.repo ? `<a class="text-link" href="${p.links.repo}" target="_blank" rel="noopener">Repo</a>` : ''}
        </div>
      </article>
    `).join('') + `<p class="panel-more"><a class="text-link" href="/projects.html">Open projects as a full page &rarr;</a></p>`;
  },

  async experience() {
    const [experience, skills] = await Promise.all([fetchJSON('experience'), fetchJSON('skills')]);
    const parseSortDate = (dates) => {
      const match = dates.match(/(\d{4})/g);
      return match ? Math.max(...match.map(Number)) : 0;
    };
    const sorted = [...experience].sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      return parseSortDate(b.dates) - parseSortDate(a.dates);
    });
    const timeline = sorted.map(item => `
      <div class="timeline-item">
        <div class="role">${escapeHTML(item.role)}</div>
        <div class="org">${escapeHTML(item.org)}</div>
        <div class="dates">${escapeHTML(item.dates)}</div>
        <ul>${item.bullets.map(b => `<li>${escapeHTML(b)}</li>`).join('')}</ul>
      </div>
    `).join('');
    return `
      <div class="timeline">${timeline}</div>
      <h3 class="panel-subhead">Technical skills</h3>
      <div class="skill-pills">${skills.technical.map(s => `<span class="skill-pill">${escapeHTML(s)}</span>`).join('')}</div>
      <h3 class="panel-subhead">Certifications</h3>
      <div class="cert-list">${skills.certifications.map(c => `<div class="cert-item"><span>${escapeHTML(c.name)}</span><span class="cert-date">${escapeHTML(c.displayDate)}</span></div>`).join('')}</div>
      <p class="panel-more"><a class="text-link" href="/experience.html">Open experience as a full page &rarr;</a></p>
    `;
  },

  async blog() {
    const posts = await fetchJSON('posts');
    const sorted = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!sorted.length) return '<p class="text-muted">No posts yet.</p>';
    return sorted.map(post => `
      <article class="panel-item">
        <span class="date">${escapeHTML(post.displayDate || post.date)}</span>
        <h3><a href="/post.html?slug=${encodeURIComponent(post.slug)}">${escapeHTML(post.title)}</a></h3>
        <p>${escapeHTML(post.summary)}</p>
      </article>
    `).join('') + `<p class="panel-more"><a class="text-link" href="/blog.html">Open the blog as a full page &rarr;</a></p>`;
  },

  async contact() {
    const profile = await fetchJSON('profile');
    const links = profile.links;
    return `
      <p class="lede">The inbox is the fastest way to reach me.</p>
      <div class="panel-contact">
        <a class="btn btn-primary" href="mailto:${links.email}">Email me</a>
        <a class="btn btn-ghost" href="https://${links.linkedin}" target="_blank" rel="noopener">LinkedIn</a>
        <a class="btn btn-ghost" href="https://${links.github}" target="_blank" rel="noopener">GitHub</a>
      </div>
    `;
  },
};

renderWorld();
