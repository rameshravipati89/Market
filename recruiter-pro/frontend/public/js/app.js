// ─────────────────────────────────────────────────────────────────────────────
// APP — startup, tab switching, profile pills
// This is the entry point. Runs last after all other scripts are loaded.
// ─────────────────────────────────────────────────────────────────────────────

// Maps tab name → { nav button id, pane id, load function }
const TAB_MAP = {
  mail:       { nav: 'navMail',  pane: 'pane-mail',       load: null           },
  dashboard:  { nav: 'navDash',  pane: 'pane-dashboard',  load: loadDashboard  },
  candidates: { nav: 'navCand',  pane: 'pane-candidates', load: loadCandidates },
  pipeline:   { nav: 'navPipe',  pane: 'pane-pipeline',   load: loadPipeline   },
  analytics:  { nav: 'navAnaly', pane: 'pane-analytics',  load: loadAnalytics  },
};

window.activeMainTab = 'mail';

// Switch between the main tabs (Mail / Dashboard / Candidates / Pipeline / Analytics)
function switchMainTab(tab) {
  if (!TAB_MAP[tab]) return;
  window.activeMainTab = tab;

  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById(`pane-${tab}`).classList.add('active');

  Object.values(TAB_MAP).forEach(t => {
    const el = document.getElementById(t.nav);
    if (el) el.classList.remove('active');
  });
  const navEl = document.getElementById(TAB_MAP[tab].nav);
  if (navEl) navEl.classList.add('active');

  if (TAB_MAP[tab].load) TAB_MAP[tab].load();
}

// Populate the candidate dropdown in the top bar
function renderCandidateDropdown() {
  const sel = document.getElementById('candidateSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="" style="color:#000">— select candidate —</option>' +
    state.candidates.map(c =>
      `<option value="${escHtml(c.id)}" style="color:#000">${escHtml(c.name)}</option>`
    ).join('');
  sel.value = state.activeCandidateId || '';
}

// Called when a candidate is chosen from the dropdown
async function loadByCandidate(cid) {
  state.activeCandidateId = cid || null;
  const sel = document.getElementById('candidateSelect');
  if (sel) sel.value = cid || '';
  if (cid) {
    await loadCandidateMails(cid);
  } else {
    await loadProfile('');
  }
}

// Bootstrap the app
async function init() {
  try {
    const data = await api('/api/candidates?limit=200');
    state.candidates = (data.candidates || []).map(c => ({ id: c.id, name: c.name || 'Unknown' }));
    renderCandidateDropdown();
  } catch(e) {
    // ignore — dropdown stays empty
  }
  // Load all mails on startup with no candidate filter
  await loadProfile('');
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
