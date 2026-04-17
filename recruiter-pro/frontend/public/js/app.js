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

// Populate the profile dropdown in the top bar
function renderProfilePills() {
  const sel = document.getElementById('profileSelect');
  if (!sel) return;
  // Keep the placeholder option, add one option per profile
  sel.innerHTML = '<option value="" style="color:#000">— select profile —</option>' +
    state.profiles.map(p =>
      `<option value="${escHtml(p.name)}" style="color:#000">${escHtml(p.name)}</option>`
    ).join('');
  updatePillActive();
}

// Sync dropdown selection to active profile
function updatePillActive() {
  const sel = document.getElementById('profileSelect');
  if (sel) sel.value = state.activeProfile || '';
}

// Bootstrap the app
async function init() {
  try {
    const data = await api('/api/profiles');
    state.profiles = data.profiles || data || [];
    renderProfilePills();
    // Auto-load mails — use first profile if available, else load without profile
    const firstProfile = state.profiles.length ? state.profiles[0].name : '';
    await loadProfile(firstProfile);
  } catch(e) {
    // Profile fetch failed — still try to load mails without scoring
    await loadProfile('');
  }
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
