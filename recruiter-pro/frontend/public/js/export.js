// ─────────────────────────────────────────────────────────────────────────────
// CSV EXPORT — download currently filtered mails as a spreadsheet
// ─────────────────────────────────────────────────────────────────────────────

function exportCSV() {
  if (!state.mails.length) { alert('Load a profile first'); return; }

  const rows = [['ID','Subject','From','Received','Top Candidate','Top Score','Signal']];
  state.filteredMails.forEach(m => {
    const top = m.top_candidates?.[0];
    rows.push([
      m.id,
      m.subject    || '',
      m.from_email || '',
      m.received_at|| '',
      top?.name    || '',
      top?.score   || '',
      signal(m.received_at),
    ]);
  });

  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `recruitiq_${state.activeProfile || 'export'}_${Date.now()}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
