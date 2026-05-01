// ─────────────────────────────────────────────────────────────────────────────
// MAIL LIST — sidebar list with infinite scroll
// ─────────────────────────────────────────────────────────────────────────────

const MAIL_BATCH = 50;  // how many mails to load per request

// Load first batch for a profile (resets list)
async function loadProfile(name) {
  state.activeProfile   = name || '';
  state.activeCandidateId = null;
  state.mails           = [];
  state.mailSkip        = 0;
  state.mailTotal       = 0;
  state.mailLoadingMore = false;

  document.getElementById('mailList').innerHTML = '<div class="loading">Loading mails…</div>';

  try {
    let url = `/api/mails?limit=${MAIL_BATCH}&skip=0`;
    if (name) url += `&profile=${encodeURIComponent(name)}`;
    const data = await api(url);
    state.mails      = data.mails || [];
    state.mailTotal  = data.total || 0;
    state.mailSkip   = state.mails.length;
    applyFilter();
  } catch(e) {
    document.getElementById('mailList').innerHTML = `<div class="no-data">Error loading mails</div>`;
  }
}

// Load mails matched to a specific candidate (≥50%), resets list
async function loadCandidateMails(cid) {
  state.activeCandidateId = cid;
  state.activeProfile     = '';
  state.mails             = [];
  state.mailSkip          = 0;
  state.mailTotal         = 0;
  state.mailLoadingMore   = false;

  document.getElementById('mailList').innerHTML = '<div class="loading">Loading matched mails…</div>';

  try {
    const data = await api(`/api/candidates/${cid}/matched-mails?min_score=50&limit=${MAIL_BATCH}&skip=0`);
    const mails = (data.mails || []).map(_normCandMail);
    state.mails     = mails;
    state.mailTotal = data.total || 0;
    state.mailSkip  = mails.length;
    applyFilter();
  } catch(e) {
    document.getElementById('mailList').innerHTML = `<div class="no-data">Error loading mails</div>`;
  }
}

// Normalize candidate matched-mail record to the same shape as a regular mail
function _normCandMail(m) {
  return {
    id:            m.mail_id,
    subject:       m.subject,
    from_email:    m.from_email,
    received_at:   m.received_at,
    job_title:     m.job_title,
    work_type:     m.work_type,
    locations:     m.location ? [m.location] : [],
    top_candidates:[{ score: m.score }],   // reuse score chip rendering
  };
}

// Fetch next batch and append to the list (called on scroll or "load more" click)
async function loadMoreMails() {
  if (state.mailLoadingMore)             return;
  if (state.mailSkip >= state.mailTotal) return;

  state.mailLoadingMore = true;
  const sentinel = document.getElementById('mailLoadMore');
  if (sentinel) sentinel.textContent = 'Loading…';

  try {
    let newMails = [];
    if (state.activeCandidateId) {
      const data = await api(`/api/candidates/${state.activeCandidateId}/matched-mails?min_score=50&limit=${MAIL_BATCH}&skip=${state.mailSkip}`);
      newMails = (data.mails || []).map(_normCandMail);
      state.mailTotal = data.total || state.mailTotal;
    } else {
      let url = `/api/mails?limit=${MAIL_BATCH}&skip=${state.mailSkip}`;
      if (state.activeProfile) url += `&profile=${encodeURIComponent(state.activeProfile)}`;
      const data = await api(url);
      newMails = data.mails || [];
      state.mailTotal = data.total || state.mailTotal;
    }
    state.mails    = state.mails.concat(newMails);
    state.mailSkip += newMails.length;
    _appendMailItems(newMails);
  } catch(e) {
    // silently ignore fetch errors while scrolling
  } finally {
    state.mailLoadingMore = false;
    _updateLoadMoreSentinel();
  }
}

// Apply search text + time filter, then re-render
function applyFilter() {
  const q = (document.getElementById('mailSearch').value || '').toLowerCase();
  state.filteredMails = state.mails.filter(m => {
    const sig = signal(m.received_at);
    if (state.filter !== 'all' && sig !== state.filter) return false;
    if (q) {
      const hay = `${m.subject||''} ${m.from_email||''} ${m.point_of_contact||''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  renderMailList();
}

// Called by search input oninput
function filterMailList() { applyFilter(); }

// Called by filter chip buttons
function setFilter(f, el) {
  state.filter = f;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  applyFilter();
}

// Build the middle info row: role · work type · location
function mailInfoRow(m) {
  const parts = [];

  // Job title / role
  const title = (m.job_title || '').trim();
  if (title && title !== 'unknown') {
    parts.push(`<span class="role-tag title">${escHtml(title)}</span>`);
  }

  // Work type: Remote / Hybrid / Onsite
  const wt = (m.work_type || '').toLowerCase();
  if (wt && wt !== 'unknown') {
    const label = m.work_type.charAt(0).toUpperCase() + m.work_type.slice(1).toLowerCase();
    parts.push(`<span class="role-tag ${wt}">${escHtml(label)}</span>`);
  }

  // Location: prefer mailclean `locations`, fallback to injector `cities`
  const locs = m.locations?.length ? m.locations : (m.cities || []);
  if (locs.length) {
    parts.push(`<span class="role-tag" style="background:#F1F5F9;color:#475569">&#128205; ${escHtml(locs[0])}</span>`);
  }

  return parts.length ? `<div class="mail-meta" style="margin-top:4px;gap:3px">${parts.join('')}</div>` : '';
}

// Build HTML for one mail row
function mailItemHtml(m) {
  const ti      = timeInfo(m.received_at);
  const subject = m.subject || '(no subject)';
  const infoRow = mailInfoRow(m);
  const top     = m.top_candidates?.[0];
  const scoreHtml = top ? `<span class="score-chip">${top.score}%</span>` : '';

  return `
    <div class="mail-item ${m.id === state.selectedMailId ? 'active' : ''}"
         onclick="selectMail('${m.id}')">
      <span class="signal-dot ${ti.cls}"></span>
      <div class="mail-item-body">
        <div class="mail-subject" style="font-weight:600;color:var(--text)">${escHtml(subject)}</div>
        ${infoRow}
        <div class="mail-meta" style="margin-top:4px">
          <span class="mail-time" style="color:${ti.color};font-weight:600">${ti.label}</span>
          ${scoreHtml}
        </div>
      </div>
    </div>`;
}

// Full re-render of list (used after filter change)
function renderMailList() {
  const el = document.getElementById('mailList');
  if (!state.filteredMails.length) {
    el.innerHTML = '<div class="no-data">No mails match this filter</div>';
    return;
  }
  const remaining = state.mailTotal - state.mailSkip;
  el.innerHTML = state.filteredMails.map(mailItemHtml).join('') +
    `<div id="mailLoadMore"
          style="text-align:center;padding:10px;font-size:.78rem;color:var(--muted);cursor:pointer;display:${remaining > 0 ? '' : 'none'}"
          onclick="loadMoreMails()">Load more (${remaining} remaining)</div>`;
}

// Append new items just before the sentinel (no full re-render)
function _appendMailItems(mails) {
  const el       = document.getElementById('mailList');
  const sentinel = document.getElementById('mailLoadMore');
  const html     = mails.map(mailItemHtml).join('');
  if (sentinel) {
    sentinel.insertAdjacentHTML('beforebegin', html);
  } else {
    el.insertAdjacentHTML('beforeend', html);
  }
  _updateLoadMoreSentinel();
}

// Update the "load more" button text and visibility
function _updateLoadMoreSentinel() {
  const sentinel = document.getElementById('mailLoadMore');
  if (!sentinel) return;
  const remaining = state.mailTotal - state.mailSkip;
  if (remaining > 0) {
    sentinel.style.display = '';
    sentinel.textContent   = `Load more (${remaining} remaining)`;
  } else {
    sentinel.style.display = 'none';
  }
}

// Attach scroll listener once the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('mailList').addEventListener('scroll', function() {
    if (this.scrollTop + this.clientHeight >= this.scrollHeight - 150) {
      loadMoreMails();
    }
  });
});
