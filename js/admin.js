/* Admin console: form-based CRUD over /data/*.json and /posts/*.md.
   Publishing: GitHub Contents API (primary) or file download (fallback, no token needed). */

const TOKEN_KEY = 'admin_gh_token';
const GH_API = 'https://api.github.com';

let dirty = false;
function markDirty() { dirty = true; }
function clearDirty() { dirty = false; }
window.addEventListener('beforeunload', (e) => {
  if (dirty) { e.preventDefault(); e.returnValue = ''; }
});

/* ---- base64 <-> utf8 (Contents API requires base64; plain btoa/atob mangle multi-byte text) ---- */
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

function setStatus(container, kind, message) {
  container.innerHTML = `<span class="status-msg ${kind}">${escapeHTML(message)}</span>`;
}

/* ---- token + repo config ---- */
function getToken() { return sessionStorage.getItem(TOKEN_KEY) || ''; }
function setToken(t) { sessionStorage.setItem(TOKEN_KEY, t); updateTokenStatus(); }
function clearToken() { sessionStorage.removeItem(TOKEN_KEY); updateTokenStatus(); }
function updateTokenStatus() {
  const statusEl = document.getElementById('token-status');
  const input = document.getElementById('token-input');
  if (getToken()) {
    statusEl.textContent = 'Token active';
    statusEl.className = 'token-status active';
    input.value = '';
    input.placeholder = 'Token stored for this session';
  } else {
    statusEl.textContent = 'Token inactive — download mode only';
    statusEl.className = 'token-status inactive';
    input.placeholder = 'Fine-grained GitHub token (Contents r/w)';
  }
}
function getRepoConfig() {
  return {
    owner: document.getElementById('repo-owner').value.trim(),
    repo: document.getElementById('repo-name').value.trim(),
  };
}

/* ---- GitHub Contents API ---- */
function ghHeaders(token) {
  return token
    ? { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
    : { Accept: 'application/vnd.github+json' };
}

async function ghGetFile(path) {
  const { owner, repo } = getRepoConfig();
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${path}`, { headers: ghHeaders(getToken()) });
  if (res.status === 404) return { content: null, sha: null };
  if (!res.ok) throw new Error(`GitHub API error ${res.status} fetching ${path}: ${await res.text()}`);
  const data = await res.json();
  return { content: base64ToUtf8(data.content), sha: data.sha };
}

async function ghPutFile(path, content, message) {
  const token = getToken();
  if (!token) throw new Error('No token active');
  const { owner, repo } = getRepoConfig();
  // Refetch sha immediately before writing so a concurrent edit elsewhere can't be clobbered.
  const { sha } = await ghGetFile(path);
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: utf8ToBase64(content), ...(sha ? { sha } : {}) }),
  });
  if (res.status === 409) {
    throw Object.assign(new Error(`409 sha mismatch on ${path} — it changed on GitHub since this page loaded it.`), { conflict: true });
  }
  if (!res.ok) throw new Error(`GitHub API error ${res.status} writing ${path}: ${await res.text()}`);
  return res.json();
}

async function ghDeleteFile(path, message) {
  const token = getToken();
  if (!token) return; // download mode: nothing to delete remotely
  const { owner, repo } = getRepoConfig();
  const { sha } = await ghGetFile(path);
  if (!sha) return;
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${path}`, {
    method: 'DELETE',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha }),
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status} deleting ${path}: ${await res.text()}`);
}

function downloadFile(path, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = path.split('/').pop();
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function publishFile(path, content, message, statusEl) {
  if (getToken()) {
    try {
      await ghPutFile(path, content, message);
      setStatus(statusEl, 'ok', `Committed ${path}. GitHub Pages redeploys in about a minute.`);
      clearDirty();
      return true;
    } catch (e) {
      if (e.conflict && confirm(`${e.message}\n\nRetry the save with the latest version now?`)) {
        return publishFile(path, content, message, statusEl);
      }
      setStatus(statusEl, 'err', e.message);
      return false;
    }
  }
  downloadFile(path, content);
  setStatus(statusEl, 'ok', `Downloaded ${path.split('/').pop()} — commit it to ${path} manually.`);
  clearDirty();
  return true;
}

/* ---- tabs ---- */
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

/* ============================================================
   Profile
   ============================================================ */
async function initProfileTab() {
  const mount = document.getElementById('tab-profile');
  const profile = await fetchJSON('profile');

  mount.innerHTML = `
    <div class="field"><label>Headshot photo path (e.g. /images/headshot.jpg)</label><input id="p-photo" value="${escapeHTML(profile.photo || '')}"></div>
    <div class="field"><label>Tagline</label><input id="p-tagline" value="${escapeHTML(profile.tagline)}"></div>
    <div class="field"><label>Tagline alternates (one per line)</label><textarea id="p-alts">${escapeHTML((profile.taglineAlternates || []).join('\n'))}</textarea></div>
    <div class="field"><label>Hero subline</label><input id="p-focus" value="${escapeHTML(profile.heroSubline || '')}"></div>
    <div class="field"><label>Kicker</label><input id="p-kicker" value="${escapeHTML(profile.kicker)}"></div>
    <div class="field"><label>About paragraphs (one per line)</label><textarea id="p-about" rows="6">${escapeHTML((profile.about.paragraphs || []).join('\n'))}</textarea></div>
    <div class="field"><label>AI note</label><textarea id="p-ainote">${escapeHTML(profile.about.aiNote || '')}</textarea></div>
    <div class="field"><label>Closing line</label><input id="p-closing" value="${escapeHTML(profile.about.closing || '')}"></div>
    <div class="field"><label>Aspirations heading</label><input id="p-asp-h" value="${escapeHTML(profile.aspirations.heading)}"></div>
    <div class="field"><label>Aspirations body</label><textarea id="p-asp-b">${escapeHTML(profile.aspirations.body)}</textarea></div>
    <div class="field"><label>Personal bits (one per line)</label><textarea id="p-bits">${escapeHTML((profile.personalBits || []).join('\n'))}</textarea></div>
    <div class="field-row">
      <div class="field"><label>Email</label><input id="p-email" value="${escapeHTML(profile.links.email)}"></div>
      <div class="field"><label>LinkedIn</label><input id="p-linkedin" value="${escapeHTML(profile.links.linkedin)}"></div>
      <div class="field"><label>GitHub</label><input id="p-github" value="${escapeHTML(profile.links.github)}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Featured project slugs (comma separated)</label><input id="p-featured" value="${escapeHTML((profile.home.featuredProjectSlugs || []).join(', '))}"></div>
      <div class="field"><label>Latest posts count</label><input id="p-postcount" type="number" min="1" value="${profile.home.latestPostsCount || 3}"></div>
    </div>
    <div class="save-bar">
      <button class="btn btn-primary" id="p-save">Save profile</button>
      <div id="p-status"></div>
    </div>
  `;
  mount.addEventListener('input', markDirty);

  document.getElementById('p-save').addEventListener('click', async () => {
    const updated = {
      ...profile,
      photo: document.getElementById('p-photo').value,
      tagline: document.getElementById('p-tagline').value,
      taglineAlternates: document.getElementById('p-alts').value.split('\n').map(s => s.trim()).filter(Boolean),
      heroSubline: document.getElementById('p-focus').value,
      kicker: document.getElementById('p-kicker').value,
      about: {
        paragraphs: document.getElementById('p-about').value.split('\n').map(s => s.trim()).filter(Boolean),
        aiNote: document.getElementById('p-ainote').value,
        closing: document.getElementById('p-closing').value,
      },
      aspirations: {
        heading: document.getElementById('p-asp-h').value,
        body: document.getElementById('p-asp-b').value,
      },
      personalBits: document.getElementById('p-bits').value.split('\n').map(s => s.trim()).filter(Boolean),
      links: {
        email: document.getElementById('p-email').value,
        linkedin: document.getElementById('p-linkedin').value,
        github: document.getElementById('p-github').value,
      },
      home: {
        featuredProjectSlugs: document.getElementById('p-featured').value.split(',').map(s => s.trim()).filter(Boolean),
        latestPostsCount: Number(document.getElementById('p-postcount').value) || 3,
      },
    };
    await publishFile('data/profile.json', JSON.stringify(updated, null, 2), 'Update profile.json', document.getElementById('p-status'));
  });
}

/* ============================================================
   Generic array-of-objects editor (projects, experience, certifications)
   ============================================================ */
function arrayEditor({ mount, items, filePath, fileLabel, summarize, formFields, toObject, fromObject, idKey, serialize }) {
  let list = items;
  const toFileContent = serialize || (l => l);
  const listEl = el('<div class="collection-list"></div>');
  const topBar = el('<div class="item-actions-top"><button class="btn btn-primary" id="add-new">Add new</button></div>');
  const formHost = el('<div class="form-host"></div>');
  mount.append(topBar, listEl, formHost);

  function renderList() {
    listEl.innerHTML = '';
    list.forEach((item, idx) => {
      const row = el(`
        <div class="item-row">
          <div class="meta">${summarize(item)}</div>
          <div class="actions">
            <button class="btn btn-ghost" data-action="edit">Edit</button>
            <button class="btn btn-danger" data-action="delete">Delete</button>
          </div>
        </div>
      `);
      row.querySelector('[data-action="edit"]').addEventListener('click', () => openForm(item, idx));
      row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm(`Delete "${item[idKey] || summarize(item)}"? This can't be undone.`)) return;
        list.splice(idx, 1);
        renderList();
        markDirty();
        await publish();
      });
      listEl.appendChild(row);
    });
  }

  function openForm(item, idx) {
    formHost.innerHTML = '';
    const form = el(`<div class="editor-form">${formFields(item)}<div class="save-bar"><button class="btn btn-primary" data-action="save">Save item</button><button class="btn btn-ghost" data-action="cancel">Cancel</button><div class="form-status"></div></div></div>`);
    formHost.appendChild(form);
    form.addEventListener('input', markDirty);
    form.querySelector('[data-action="cancel"]').addEventListener('click', () => { formHost.innerHTML = ''; });
    form.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const obj = toObject(form, item);
      if (idx === undefined) list.push(obj);
      else list[idx] = obj;
      formHost.innerHTML = '';
      renderList();
      markDirty();
      await publish();
    });
  }

  topBar.querySelector('#add-new').addEventListener('click', () => openForm(fromObject ? fromObject({}) : {}, undefined));

  const statusHost = el('<div id="collection-status" class="mt-6"></div>');
  mount.appendChild(statusHost);

  async function publish() {
    await publishFile(filePath, JSON.stringify(toFileContent(list), null, 2), `Update ${fileLabel}`, statusHost);
  }

  renderList();
  return { publish, getList: () => list };
}

/* ---- Projects ---- */
async function initProjectsTab() {
  const mount = document.getElementById('tab-projects');
  const projects = await fetchJSON('projects');
  mount.innerHTML = '<p class="hint">Tags: one per line, formatted as <code>Label|category</code>. Categories: research, web, leadership, viz.</p>';

  arrayEditor({
    mount,
    items: projects,
    filePath: 'data/projects.json',
    fileLabel: 'projects.json',
    idKey: 'title',
    summarize: p => `<strong>${escapeHTML(p.title)}</strong><br><span class="hint">${escapeHTML(p.displayDate || '')} · ${escapeHTML(p.slug || '')}${p.status === 'ongoing' ? ' · ongoing' : ''}</span>`,
    formFields: (p) => `
      <div class="field-row">
        <div class="field"><label>Title</label><input class="f-title" value="${escapeHTML(p.title || '')}"></div>
        <div class="field"><label>Slug</label><input class="f-slug" value="${escapeHTML(p.slug || '')}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Date (sortable, e.g. 2026-06)</label><input class="f-date" value="${escapeHTML(p.date || '')}"></div>
        <div class="field"><label>Display date</label><input class="f-displaydate" value="${escapeHTML(p.displayDate || '')}"></div>
      </div>
      <div class="field"><label>Summary</label><textarea class="f-summary">${escapeHTML(p.summary || '')}</textarea></div>
      <div class="field"><label>Detail bullets (one per line)</label><textarea class="f-detail" rows="5">${escapeHTML((p.detail || []).join('\n'))}</textarea></div>
      <div class="field"><label>Tags</label><textarea class="f-tags">${escapeHTML((p.tags || []).map(t => `${t.label}|${t.cat}`).join('\n'))}</textarea></div>
      <div class="field-row">
        <div class="field"><label>Motif graphic</label>
          <select class="f-motif">
            <option value="">None</option>
            <option value="map" ${p.motif === 'map' ? 'selected' : ''}>Map (county outline + dots)</option>
            <option value="bars" ${p.motif === 'bars' ? 'selected' : ''}>Comparison radar</option>
            <option value="trend" ${p.motif === 'trend' ? 'selected' : ''}>Pool lanes</option>
            <option value="flow" ${p.motif === 'flow' ? 'selected' : ''}>Paper pipeline</option>
          </select>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Stat value (e.g. 1,139)</label><input class="f-stat-value" value="${escapeHTML(p.stat?.value || '')}"></div>
        <div class="field"><label>Stat label (e.g. block groups mapped)</label><input class="f-stat-label" value="${escapeHTML(p.stat?.label || '')}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Live link</label><input class="f-live" value="${escapeHTML(p.links?.live || '')}"></div>
        <div class="field"><label>Repo link</label><input class="f-repo" value="${escapeHTML(p.links?.repo || '')}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label><input type="checkbox" class="f-featured" ${p.featured ? 'checked' : ''}> Featured</label></div>
        <div class="field"><label>Status</label>
          <select class="f-status">
            <option value="complete" ${p.status !== 'ongoing' ? 'selected' : ''}>Complete</option>
            <option value="ongoing" ${p.status === 'ongoing' ? 'selected' : ''}>Ongoing</option>
          </select>
        </div>
      </div>
    `,
    toObject: (form) => ({
      title: form.querySelector('.f-title').value,
      slug: form.querySelector('.f-slug').value || slugify(form.querySelector('.f-title').value),
      date: form.querySelector('.f-date').value,
      displayDate: form.querySelector('.f-displaydate').value,
      summary: form.querySelector('.f-summary').value,
      detail: form.querySelector('.f-detail').value.split('\n').map(s => s.trim()).filter(Boolean),
      tags: form.querySelector('.f-tags').value.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
        const [label, cat] = line.split('|').map(s => s.trim());
        return { label, cat: cat || 'default' };
      }),
      motif: form.querySelector('.f-motif').value,
      stat: form.querySelector('.f-stat-value').value
        ? { value: form.querySelector('.f-stat-value').value, label: form.querySelector('.f-stat-label').value }
        : undefined,
      links: { live: form.querySelector('.f-live').value, repo: form.querySelector('.f-repo').value },
      featured: form.querySelector('.f-featured').checked,
      status: form.querySelector('.f-status').value,
    }),
  });
}

/* ---- Experience ---- */
async function initExperienceTab() {
  const mount = document.getElementById('tab-experience');
  const experience = await fetchJSON('experience');

  arrayEditor({
    mount,
    items: experience,
    filePath: 'data/experience.json',
    fileLabel: 'experience.json',
    idKey: 'role',
    summarize: x => `<strong>${escapeHTML(x.role)}</strong> — ${escapeHTML(x.org)}<br><span class="hint">${escapeHTML(x.dates)}${x.current ? ' · current' : ''}</span>`,
    formFields: (x) => `
      <div class="field-row">
        <div class="field"><label>Type</label>
          <select class="f-type">
            <option value="job" ${x.type !== 'leadership' ? 'selected' : ''}>Job</option>
            <option value="leadership" ${x.type === 'leadership' ? 'selected' : ''}>Leadership</option>
          </select>
        </div>
        <div class="field"><label><input type="checkbox" class="f-current" ${x.current ? 'checked' : ''}> Current</label></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Organization</label><input class="f-org" value="${escapeHTML(x.org || '')}"></div>
        <div class="field"><label>Role</label><input class="f-role" value="${escapeHTML(x.role || '')}"></div>
      </div>
      <div class="field"><label>Dates (free text, e.g. "Jan 2025–Present")</label><input class="f-dates" value="${escapeHTML(x.dates || '')}"></div>
      <div class="field"><label>Note (optional context line)</label><input class="f-note" value="${escapeHTML(x.note || '')}"></div>
      <div class="field"><label>Bullets (one per line)</label><textarea class="f-bullets" rows="5">${escapeHTML((x.bullets || []).join('\n'))}</textarea></div>
    `,
    toObject: (form) => {
      const note = form.querySelector('.f-note').value;
      return {
        type: form.querySelector('.f-type').value,
        current: form.querySelector('.f-current').checked,
        org: form.querySelector('.f-org').value,
        role: form.querySelector('.f-role').value,
        dates: form.querySelector('.f-dates').value,
        ...(note ? { note } : {}),
        bullets: form.querySelector('.f-bullets').value.split('\n').map(s => s.trim()).filter(Boolean),
      };
    },
  });
}

/* ---- Skills & Certifications ---- */
async function initSkillsTab() {
  const mount = document.getElementById('tab-skills');
  const skills = await fetchJSON('skills');

  const techSection = el(`
    <div class="editor-form">
      <h3>Technical skills</h3>
      <div class="field"><label>One per line</label><textarea id="tech-list" rows="6">${escapeHTML(skills.technical.join('\n'))}</textarea></div>
      <div class="save-bar"><button class="btn btn-primary" id="tech-save">Save technical skills</button><div id="tech-status"></div></div>
    </div>
  `);
  mount.appendChild(techSection);
  techSection.addEventListener('input', markDirty);
  techSection.querySelector('#tech-save').addEventListener('click', async () => {
    skills.technical = document.getElementById('tech-list').value.split('\n').map(s => s.trim()).filter(Boolean);
    await publishFile('data/skills.json', JSON.stringify(skills, null, 2), 'Update technical skills', document.getElementById('tech-status'));
  });

  const certHost = el('<div><h3 class="mt-6">Certifications</h3></div>');
  mount.appendChild(certHost);

  arrayEditor({
    mount: certHost,
    items: skills.certifications,
    filePath: 'data/skills.json',
    fileLabel: 'skills.json (certifications)',
    idKey: 'name',
    serialize: (certifications) => ({ ...skills, certifications }),
    summarize: c => `<strong>${escapeHTML(c.name)}</strong><br><span class="hint">${escapeHTML(c.displayDate)}</span>`,
    formFields: (c) => `
      <div class="field"><label>Name</label><input class="f-name" value="${escapeHTML(c.name || '')}"></div>
      <div class="field-row">
        <div class="field"><label>Date (sortable, YYYY-MM)</label><input class="f-date" value="${escapeHTML(c.date || '')}"></div>
        <div class="field"><label>Display date</label><input class="f-displaydate" value="${escapeHTML(c.displayDate || '')}"></div>
      </div>
    `,
    toObject: (form) => ({
      name: form.querySelector('.f-name').value,
      date: form.querySelector('.f-date').value,
      displayDate: form.querySelector('.f-displaydate').value,
    }),
  });
}

/* ============================================================
   Blog
   ============================================================ */
async function initBlogTab() {
  const mount = document.getElementById('tab-blog');
  let posts = await fetchJSON('posts');

  const listEl = el('<div class="collection-list"></div>');
  const topBar = el('<div class="item-actions-top"><button class="btn btn-primary" id="blog-add">Add new post</button></div>');
  const formHost = el('<div></div>');
  mount.append(topBar, listEl, formHost);

  function renderList() {
    listEl.innerHTML = '';
    posts.forEach((post, idx) => {
      const row = el(`
        <div class="item-row">
          <div class="meta"><strong>${escapeHTML(post.title)}</strong><br><span class="hint">${escapeHTML(post.displayDate || post.date)} · ${escapeHTML(post.slug)}</span></div>
          <div class="actions">
            <button class="btn btn-ghost" data-action="edit">Edit</button>
            <button class="btn btn-danger" data-action="delete">Delete</button>
          </div>
        </div>
      `);
      row.querySelector('[data-action="edit"]').addEventListener('click', () => openEditor(post, idx));
      row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm(`Delete post "${post.title}"? This removes it from the index and can't be undone.`)) return;
        posts.splice(idx, 1);
        renderList();
        markDirty();
        const statusHost = el('<div class="mt-6"></div>');
        formHost.innerHTML = '';
        formHost.appendChild(statusHost);
        await ghDeleteFile(`posts/${post.slug}.md`, `Delete post: ${post.slug}`).catch(e => setStatus(statusHost, 'err', e.message));
        await publishFile('data/posts.json', JSON.stringify(posts, null, 2), `Remove post: ${post.slug}`, statusHost);
      });
      listEl.appendChild(row);
    });
  }

  async function openEditor(post, idx) {
    const originalSlug = post?.slug || '';
    let body = '';
    if (originalSlug) {
      try { body = await (await fetch(`/posts/${originalSlug}.md`)).text(); } catch (e) { body = ''; }
    }
    formHost.innerHTML = '';
    const today = new Date().toISOString().slice(0, 10);
    const form = el(`
      <div class="editor-form">
        <div class="field-row">
          <div class="field"><label>Title</label><input class="f-title" value="${escapeHTML(post?.title || '')}"></div>
          <div class="field"><label>Slug</label><input class="f-slug" value="${escapeHTML(post?.slug || '')}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Date</label><input class="f-date" type="date" value="${post?.date || today}"></div>
          <div class="field"><label>Tags (comma separated)</label><input class="f-tags" value="${escapeHTML((post?.tags || []).join(', '))}"></div>
        </div>
        <div class="field"><label>Summary</label><textarea class="f-summary">${escapeHTML(post?.summary || '')}</textarea></div>
        <div class="field"><label>Body (Markdown)</label></div>
        <div class="split">
          <textarea class="f-body" rows="16">${escapeHTML(body)}</textarea>
          <div class="preview-pane f-preview"></div>
        </div>
        <div class="save-bar">
          <button class="btn btn-primary" data-action="save">Save post</button>
          <button class="btn btn-ghost" data-action="cancel">Cancel</button>
          <div class="form-status"></div>
        </div>
      </div>
    `);
    formHost.appendChild(form);

    const titleInput = form.querySelector('.f-title');
    const slugInput = form.querySelector('.f-slug');
    let slugAuto = !post?.slug;
    titleInput.addEventListener('input', () => { if (slugAuto) slugInput.value = slugify(titleInput.value); });
    slugInput.addEventListener('input', () => { slugAuto = false; });

    const bodyInput = form.querySelector('.f-body');
    const previewEl = form.querySelector('.f-preview');
    function updatePreview() { previewEl.innerHTML = DOMPurify.sanitize(marked.parse(bodyInput.value)); }
    bodyInput.addEventListener('input', updatePreview);
    updatePreview();

    form.addEventListener('input', markDirty);
    form.querySelector('[data-action="cancel"]').addEventListener('click', () => { formHost.innerHTML = ''; });
    form.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const statusEl = form.querySelector('.form-status');
      const newSlug = slugInput.value || slugify(titleInput.value);
      const entry = {
        slug: newSlug,
        title: titleInput.value,
        date: form.querySelector('.f-date').value,
        displayDate: form.querySelector('.f-date').value,
        tags: form.querySelector('.f-tags').value.split(',').map(s => s.trim()).filter(Boolean),
        summary: form.querySelector('.f-summary').value,
      };
      const mdOk = await publishFile(`posts/${newSlug}.md`, bodyInput.value, `Add/update post: ${newSlug}`, statusEl);
      if (!mdOk) return;
      if (idx === undefined) posts.push(entry);
      else posts[idx] = entry;
      if (originalSlug && originalSlug !== newSlug) {
        await ghDeleteFile(`posts/${originalSlug}.md`, `Rename post: ${originalSlug} -> ${newSlug}`).catch(() => {});
      }
      await publishFile('data/posts.json', JSON.stringify(posts, null, 2), `Update posts index for ${newSlug}`, statusEl);
      formHost.innerHTML = '';
      renderList();
    });
  }

  topBar.querySelector('#blog-add').addEventListener('click', () => openEditor(null, undefined));
  renderList();
}

/* ============================================================
   Raw JSON fallback
   ============================================================ */
async function initRawTab() {
  const mount = document.getElementById('tab-raw');
  const files = [
    { key: 'profile', path: 'data/profile.json' },
    { key: 'projects', path: 'data/projects.json' },
    { key: 'experience', path: 'data/experience.json' },
    { key: 'skills', path: 'data/skills.json' },
    { key: 'posts', path: 'data/posts.json' },
  ];
  mount.innerHTML = `
    <p class="hint">Edit raw JSON directly. Reload this page afterward so the form-based tabs pick up your changes.</p>
    <div class="field">
      <label>File</label>
      <select id="raw-file">${files.map(f => `<option value="${f.key}">${f.path}</option>`).join('')}</select>
    </div>
    <textarea id="raw-editor" rows="24" style="font-family: var(--font-mono);"></textarea>
    <div class="save-bar">
      <button class="btn btn-primary" id="raw-save">Save raw file</button>
      <div id="raw-status"></div>
    </div>
  `;

  async function loadRaw(key) {
    const file = files.find(f => f.key === key);
    const res = await fetch(`/${file.path}`);
    document.getElementById('raw-editor').value = await res.text();
  }

  document.getElementById('raw-file').addEventListener('change', (e) => loadRaw(e.target.value));
  document.getElementById('raw-editor').addEventListener('input', markDirty);
  document.getElementById('raw-save').addEventListener('click', async () => {
    const key = document.getElementById('raw-file').value;
    const file = files.find(f => f.key === key);
    const text = document.getElementById('raw-editor').value;
    try { JSON.parse(text); } catch (e) {
      setStatus(document.getElementById('raw-status'), 'err', `Not valid JSON: ${e.message}`);
      return;
    }
    await publishFile(file.path, text, `Update ${file.path} (raw)`, document.getElementById('raw-status'));
  });

  await loadRaw('profile');
}

/* ---- boot ---- */
document.getElementById('token-set-btn').addEventListener('click', () => {
  const val = document.getElementById('token-input').value.trim();
  if (val) setToken(val);
});
document.getElementById('token-clear-btn').addEventListener('click', clearToken);
updateTokenStatus();
initTabs();
initProfileTab();
initProjectsTab();
initExperienceTab();
initSkillsTab();
initBlogTab();
initRawTab();
