// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE — Kanban board + Move Stage modal + Add Round modal
// ─────────────────────────────────────────────────────────────────────────────

async function loadPipeline() {
  const el = document.getElementById('pipelineContent');
  el.innerHTML = '<div class="page-loading"><div class="spinner"></div> Loading…</div>';
  try {
    const data = await api('/api/pipeline');
    el.innerHTML = renderPipeline(data);
  } catch(e) {
    el.innerHTML = `<div class="no-data">Error: ${e.message}</div>`;
  }
}

function renderPipeline(data) {
  const stages = data.stages || ['New Lead','Screening','Interview','Offer','Placed','Rejected'];
  const pipeMap = data.pipeline || {};
  const stageColors = {
    'New Lead':'#1565C0', 'Screening':'#2E7D32', 'Interview':'#E65100',
    'Offer':'#6A1B9A',   'Placed':'#00695C',      'Rejected':'#DC2626'
  };

  const cols = stages.map(stage => {
    const entries = pipeMap[stage] || [];
    const color   = stageColors[stage] || '#1565C0';

    const cards = entries.map(e => {
      const rounds   = e.rounds || [];
      const roundDots = rounds.map(r =>
        `<span class="round-mini-dot ${r.result || 'pending'}" title="R${r.round_number}: ${r.type} - ${r.result}"></span>`
      ).join('');
      const lastRound    = rounds[rounds.length - 1];
      const lastFeedback = lastRound?.feedback
        ? `<div style="font-size:.7rem;color:var(--muted);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(lastRound.feedback.slice(0, 60))}</div>`
        : '';

      return `
        <div class="pipeline-card">
          <div class="pipeline-card-name">${escHtml(e.name || 'Unknown')}</div>
          <div class="pipeline-card-email">${escHtml(e.email || '')}</div>
          <div class="pipeline-card-badges">
            ${e.visa_status  ? `<span class="visa-badge">${escHtml(e.visa_status)}</span>`  : ''}
            ${e.availability ? `<span class="avail-badge">${escHtml(e.availability)}</span>` : ''}
          </div>
          ${rounds.length
            ? `<div class="pipeline-rounds-preview">${roundDots}<span style="font-size:.68rem;color:var(--muted);margin-left:2px">${rounds.length} round${rounds.length > 1 ? 's' : ''}</span></div>${lastFeedback}`
            : ''}
          <div class="pipeline-card-actions" style="margin-top:8px">
            <button class="btn-sm primary" style="font-size:.68rem;padding:3px 8px"
              onclick="openMoveStageModal('${e.candidate_id}','${escHtml(stage)}')">&#9654; Move</button>
            <button class="btn-sm" style="font-size:.68rem;padding:3px 8px"
              onclick="openAddRoundModal('${e.candidate_id}')">+ Round</button>
            <button class="btn-sm" style="font-size:.68rem;padding:3px 8px"
              onclick="openCandModal('${e.candidate_id}','${escHtml(e.name || '')}')">&#9432;</button>
            <button class="btn-sm" style="font-size:.68rem;padding:3px 8px;color:var(--red)"
              onclick="removeFromPipeline('${e.candidate_id}')">&#10005;</button>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="pipeline-col">
        <div class="pipeline-col-header" style="color:${color}">
          ${escHtml(stage)} <span class="stage-count" style="background:${color}">${entries.length}</span>
        </div>
        <div class="pipeline-cards">
          ${cards || '<div style="color:var(--muted);font-size:.78rem;padding:8px;text-align:center">Empty</div>'}
        </div>
      </div>`;
  }).join('');

  return `<div class="pipeline-board">${cols}</div>`;
}

// ── Move Stage Modal ──────────────────────────────────────────────────────────

function openMoveStageModal(candidateId, currentStage) {
  const stages = ['New Lead','Screening','Interview','Offer','Placed','Rejected'];
  const idx    = stages.indexOf(currentStage);

  document.getElementById('ms_candidateId').value  = candidateId;
  document.getElementById('ms_notes').value         = '';
  document.getElementById('ms_logRound').checked    = false;
  document.getElementById('ms_roundFields').style.display = 'none';
  document.getElementById('ms_feedback').value      = '';
  document.getElementById('ms_noAdvance').value     = '';
  document.getElementById('ms_roundDate').value     = new Date().toISOString().slice(0, 10);
  document.getElementById('ms_stage').value         = stages[Math.min(idx + 1, stages.length - 1)];

  openModal('moveStageModal');
}

function toggleRoundFields() {
  const show = document.getElementById('ms_logRound').checked;
  document.getElementById('ms_roundFields').style.display = show ? 'block' : 'none';
}

async function submitMoveStage() {
  const candidateId = document.getElementById('ms_candidateId').value;
  const body = {
    stage:             document.getElementById('ms_stage').value,
    notes:             document.getElementById('ms_notes').value,
    log_round:         document.getElementById('ms_logRound').checked,
    round_type:        document.getElementById('ms_roundType').value,
    round_date:        document.getElementById('ms_roundDate').value,
    round_interviewer: document.getElementById('ms_interviewer').value,
    round_result:      document.getElementById('ms_result').value,
    round_feedback:    document.getElementById('ms_feedback').value,
    no_advance_reason: document.getElementById('ms_noAdvance').value,
  };

  try {
    const r = await fetch(`/api/pipeline/${candidateId}/stage`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    closeModal('moveStageModal');
    loadPipeline();
  } catch(e) {
    alert('Failed to move stage: ' + e.message);
  }
}

// ── Add Round Modal ───────────────────────────────────────────────────────────

function openAddRoundModal(candidateId) {
  document.getElementById('ar_candidateId').value  = candidateId;
  document.getElementById('ar_feedback').value      = '';
  document.getElementById('ar_noAdvance').value     = '';
  document.getElementById('ar_interviewer').value   = '';
  document.getElementById('ar_roundDate').value     = new Date().toISOString().slice(0, 10);
  openModal('addRoundModal');
}

async function submitAddRound() {
  const candidateId = document.getElementById('ar_candidateId').value;
  const body = {
    round_type:        document.getElementById('ar_roundType').value,
    round_date:        document.getElementById('ar_roundDate').value,
    interviewer:       document.getElementById('ar_interviewer').value,
    result:            document.getElementById('ar_result').value,
    feedback:          document.getElementById('ar_feedback').value,
    no_advance_reason: document.getElementById('ar_noAdvance').value,
  };

  try {
    const r = await fetch(`/api/pipeline/${candidateId}/rounds`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    closeModal('addRoundModal');
    loadPipeline();
  } catch(e) {
    alert('Failed to save round: ' + e.message);
  }
}

// ── Pipeline actions ──────────────────────────────────────────────────────────

async function removeFromPipeline(candidateId) {
  if (!confirm('Remove from pipeline?')) return;
  try {
    await fetch(`/api/pipeline/${candidateId}`, { method: 'DELETE' });
    loadPipeline();
  } catch(e) {
    alert('Failed to remove');
  }
}

async function addToPipeline(candidateId, name) {
  if (!candidateId) { alert('Candidate ID not available'); return; }
  try {
    await fetch(`/api/pipeline/${candidateId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'New Lead', notes: 'Added to pipeline' }),
    });
    alert(`${name} added to pipeline as New Lead`);
    if (window.activeMainTab === 'pipeline') loadPipeline();
  } catch(e) {
    alert('Failed to add to pipeline: ' + e.message);
  }
}
