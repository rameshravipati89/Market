// ─────────────────────────────────────────────────────────────────────────────
// CANDIDATES PAGE — grid of candidate cards with search + visa filter
// ─────────────────────────────────────────────────────────────────────────────

async function loadCandidates() {
  const el     = document.getElementById('candContent');
  const search = document.getElementById('candSearch')?.value  || '';
  const visa   = document.getElementById('candVisa')?.value    || '';

  el.innerHTML = '<div class="page-loading"><div class="spinner"></div> Loading…</div>';

  try {
    let url = `/api/candidates?limit=100`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (visa)   url += `&visa=${encodeURIComponent(visa)}`;
    const data = await api(url);
    el.innerHTML = renderCandidatesPage(data.candidates || []);
  } catch(e) {
    el.innerHTML = `<div class="no-data">Error: ${e.message}</div>`;
  }
}

function renderCandidatesPage(candidates) {
  if (!candidates.length) return '<div class="no-data">No candidates found</div>';

  const cards = candidates.map(c => {
    const av         = initials(c.name);
    const bg         = avatarColor(c.name);
    const skillsHtml = (c.skills || []).slice(0, 6)
      .map(s => skillLabel(s))
      .filter(Boolean)
      .map(label => `<span class="skill-pill">${escHtml(label)}</span>`)
      .join('');

    return `
      <div class="cand-page-card" onclick="openCandModal('${c.id}','${escHtml(c.name)}')">
        <div class="cand-page-top">
          <div class="cand-page-avatar" style="background:${bg}">${av}</div>
          <div>
            <div class="cand-page-name">${escHtml(c.name || 'Unknown')}</div>
            <div class="cand-page-email">${escHtml(c.email || '')}</div>
          </div>
        </div>
        <div class="cand-badges" style="margin-bottom:8px">
          ${c.visa_status  ? `<span class="visa-badge">${escHtml(c.visa_status)}</span>`  : ''}
          ${c.availability ? `<span class="avail-badge">${escHtml(c.availability)}</span>` : ''}
        </div>
        <div class="skills-row">${skillsHtml}</div>
        <div class="cand-page-actions">
          <button class="btn-sm primary"
            onclick="event.stopPropagation();addToPipeline('${c.id}','${escHtml(c.name)}')">+ Pipeline</button>
          <button class="btn-sm"
            onclick="event.stopPropagation();openReplyModal('${escHtml(c.email || '')}','${escHtml(c.name)}')">&#9993; Contact</button>
        </div>
      </div>`;
  }).join('');

  return `<div class="candidates-page-grid">${cards}</div>`;
}
