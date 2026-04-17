// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES  — shared helper functions used across all modules
// ─────────────────────────────────────────────────────────────────────────────

// Fetch JSON from the backend; throws on non-2xx
async function api(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`API ${path} → ${r.status}`);
  return r.json();
}

// Parse ISO date — if no timezone suffix, treat as UTC (add Z)
function _parseDate(iso) {
  if (!iso) return null;
  // If no timezone info, assume UTC by appending Z
  const s = /[Zz]|[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z';
  return new Date(s);
}

// "2m ago", "3h ago", "4d ago" — no seconds, handles negative/future gracefully
function relTime(iso) {
  if (!iso) return '—';
  const d = _parseDate(iso);
  if (!d) return '—';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff <= 0)    return 'just now';
  if (diff < 3600)  return `${Math.max(1, Math.round(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 604800)return `${Math.round(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

// Returns {label, color, cls} — green < 1hr, yellow < 24hr, red = older
function timeInfo(iso) {
  if (!iso) return { label: '—', color: 'var(--muted)', cls: 'red' };
  const d = _parseDate(iso);
  if (!d)  return { label: '—', color: 'var(--muted)', cls: 'red' };
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff <= 0)    return { label: 'just now',   color: 'var(--green)',  cls: 'green'  };
  if (diff < 3600)  return { label: relTime(iso), color: 'var(--green)',  cls: 'green'  };
  if (diff < 86400) return { label: relTime(iso), color: 'var(--yellow)', cls: 'yellow' };
  return               { label: relTime(iso), color: 'var(--red)',    cls: 'red'    };
}

// Just the color class for the signal dot
function signal(iso) {
  return timeInfo(iso).cls;
}

// "John Doe" → "JD"
function initials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

// Deterministic color from name string
function avatarColor(name) {
  const colors = ['#1565C0','#2E7D32','#E65100','#6A1B9A','#00695C','#AD1457','#4527A0'];
  let h = 0;
  for (const c of (name || '')) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return colors[h % colors.length];
}

// Blue ≥75, orange ≥50, red below
function scoreColor(s) {
  if (s >= 75) return '#1565C0';
  if (s >= 50) return '#D97706';
  return '#DC2626';
}

// Destroy a chart.js instance by key so we don't double-render
function destroyChart(id) {
  if (state.chartInstances[id]) {
    state.chartInstances[id].destroy();
    delete state.chartInstances[id];
  }
}

// Escape HTML special characters to prevent XSS
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Open / close modal overlays
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
