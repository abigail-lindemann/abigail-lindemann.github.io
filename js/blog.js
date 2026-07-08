/* Blog index: list posts, filter by tag. */

function tagCategory(tag) {
  const map = {
    ai: 'research', tools: 'web', project: 'viz', meta: 'default',
    'data': 'research', research: 'research',
  };
  return map[tag.toLowerCase()] || 'default';
}

function postCard(post) {
  return `
    <a class="card-link" href="/post.html?slug=${encodeURIComponent(post.slug)}">
      <article class="card">
        <span class="date">${escapeHTML(post.displayDate || post.date)}</span>
        <h3>${escapeHTML(post.title)}</h3>
        <p class="post-summary text-muted">${escapeHTML(post.summary)}</p>
        <div class="tags">${(post.tags || []).map(t => `<span class="tag" data-cat="${tagCategory(t)}">${escapeHTML(t)}</span>`).join('')}</div>
      </article>
    </a>
  `;
}

async function renderBlogIndex() {
  const posts = (await fetchJSON('posts')).sort((a, b) => new Date(b.date) - new Date(a.date));
  const listEl = document.getElementById('post-list');
  const filterBar = document.getElementById('filter-bar');

  const allTags = [...new Set(posts.flatMap(p => p.tags || []))];
  let activeTag = null;

  function renderList() {
    const filtered = activeTag ? posts.filter(p => (p.tags || []).includes(activeTag)) : posts;
    listEl.innerHTML = filtered.map(postCard).join('') || '<p class="text-muted">No posts match that tag yet.</p>';
  }

  function renderFilters() {
    const chips = ['<button class="tag tag-filter' + (activeTag === null ? ' active' : '') + '" data-cat="default" data-tag="">All</button>']
      .concat(allTags.map(t => `<button class="tag tag-filter${activeTag === t ? ' active' : ''}" data-cat="${tagCategory(t)}" data-tag="${escapeHTML(t)}">${escapeHTML(t)}</button>`));
    filterBar.innerHTML = chips.join('');
    filterBar.querySelectorAll('.tag-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTag = btn.dataset.tag || null;
        renderFilters();
        renderList();
      });
    });
  }

  renderFilters();
  renderList();
}

renderBlogIndex();
