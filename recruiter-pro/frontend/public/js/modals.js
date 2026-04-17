// ─────────────────────────────────────────────────────────────────────────────
// MODALS — Reply, Candidate detail (tabbed), Skill Profile editor
// ─────────────────────────────────────────────────────────────────────────────

// ── Reply Modal ───────────────────────────────────────────────────────────────

function openReplyModal(toEmail, toName) {
  const mail  = state.selectedMailData;
  const email = toEmail || mail?.from_email || '';
  const name  = toName  || mail?.point_of_contact || '';
  const subj  = mail ? `Re: ${mail.subject || ''}` : 'Following up on your requirement';
  const draft = document.getElementById('draftText')?.value || '';

  document.getElementById('replyTo').textContent      = name ? `${name} <${email}>` : email;
  document.getElementById('replySubject').textContent  = subj;
  document.getElementById('replyBody').value           = draft;

  openModal('replyModal');
}

function sendReply() {
  alert('Reply functionality requires email integration.\n\nFor now, copy the message and send via your email client.');
  closeModal('replyModal');
}

function copyReply() {
  const text = document.getElementById('replyBody').value;
  navigator.clipboard.writeText(text).then(() => alert('Reply copied to clipboard!'));
}

function copyDraft() {
  const text = document.getElementById('draftText')?.value || '';
  navigator.clipboard.writeText(text).then(() => alert('Draft copied to clipboard!'));
}

// ── Candidate Modal (tabbed: Info | Skill Profiles | Pipeline History) ────────

async function openCandModal(candId, name) {
  const modal = document.getElementById('candModalContent');
  modal.innerHTML = '<div class="page-loading"><div class="spinner"></div> Loading…</div>';
  openModal('candModal');

  try {
    const [cand, skillProfiles, pipeEntry] = await Promise.all([
      candId ? api(`/api/candidates/${candId}`) : Promise.resolve({ name, id: '' }),
      candId ? fetch(`/api/skill-profiles/candidate/${candId}`).then(r => r.json()).catch(() => []) : Promise.resolve([]),
      candId ? fetch(`/api/pipeline/${candId}`).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
    ]);
    modal.innerHTML = renderCandModalContent(cand, skillProfiles, pipeEntry);
    switchCandTab('info');
  } catch(e) {
    modal.innerHTML = `<div class="no-data">Could not load candidate: ${e.message}</div>`;
  }
}

function switchCandTab(tab) {
  document.querySelectorAll('.cand-modal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.cand-modal-pane').forEach(p => p.classList.toggle('active', p.id === `cmt_${tab}`));
}

function renderCandModalContent(c, skillProfiles, pipeEntry) {
  const av   = initials(c.name);
  const bg   = avatarColor(c.name);
  const skls = (c.skills || []).map(s => `<span class="skill-pill">${escHtml(s)}</span>`).join('');
  const id   = c.id || '';

  // ── Tab 1: Basic info ─────────────────────────────────────────────────────
  const infoTab = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
      <div class="cand-page-avatar" style="background:${bg};width:52px;height:52px;font-size:1.2rem">${av}</div>
      <div>
        <div style="font-size:1.1rem;font-weight:700;color:var(--navy)">${escHtml(c.name || 'Unknown')}</div>
        <div style="font-size:.83rem;color:var(--muted)">${escHtml(c.email || '')}</div>
        <div class="cand-badges" style="margin-top:4px">
          ${c.visa_status   ? `<span class="visa-badge">${escHtml(c.visa_status)}</span>` : ''}
          ${c.availability  ? `<span class="avail-badge">${escHtml(c.availability)}</span>` : ''}
          ${c.expected_rate ? `<span class="avail-badge" style="background:#E3F2FD;color:var(--blue)">${escHtml(c.expected_rate)}</span>` : ''}
        </div>
      </div>
    </div>
    ${skls ? `<div class="modal-section"><div class="label">All Skills (from resume)</div><div class="skills-row">${skls}</div></div>` : ''}
    ${c.phone    ? `<div class="modal-section"><div class="label">Phone</div><p>${escHtml(c.phone)}</p></div>` : ''}
    ${c.location ? `<div class="modal-section"><div class="label">Location</div><p>${escHtml(c.location)}</p></div>` : ''}
    ${c.summary  ? `<div class="modal-section"><div class="label">Summary</div><p style="white-space:pre-wrap;font-size:.82rem">${escHtml(c.summary)}</p></div>` : ''}
    <div class="modal-actions">
      <button class="btn btn-primary"   onclick="addToPipeline('${id}','${escHtml(c.name || '')}')">+ Pipeline</button>
      <button class="btn btn-secondary" onclick="openReplyModal('${escHtml(c.email || '')}','${escHtml(c.name || '')}')">&#9993; Contact</button>
      <button class="btn btn-secondary" onclick="closeModal('candModal')">Close</button>
    </div>`;

  // ── Tab 2: Skill Profiles ─────────────────────────────────────────────────
  const profilesHtml = skillProfiles.length
    ? skillProfiles.map(p => `
        <div class="skill-profile-card">
          <div class="skill-profile-header">
            <div class="skill-profile-name">&#127775; ${escHtml(p.profile_name)}</div>
            <div style="display:flex;gap:6px">
              <button class="btn-sm" onclick="openEditSkillProfile('${p.id}','${escHtml(p.profile_name)}','${id}',${JSON.stringify(p.primary_skills||[])},${JSON.stringify(p.alternative_skills||[])},${JSON.stringify(p.other_skills||[])})">Edit</button>
              <button class="btn-sm" style="color:var(--red)" onclick="deleteSkillProfile('${p.id}','${id}')">&#10005;</button>
            </div>
          </div>
          ${p.primary_skills?.length     ? `<div class="skill-group"><div class="skill-group-label primary">&#9670; Primary</div>${p.primary_skills.map(s=>`<span class="skill-pill-primary">${escHtml(s)}</span>`).join('')}</div>` : ''}
          ${p.alternative_skills?.length ? `<div class="skill-group"><div class="skill-group-label alt">&#9671; Alternative</div>${p.alternative_skills.map(s=>`<span class="skill-pill-alt">${escHtml(s)}</span>`).join('')}</div>` : ''}
          ${p.other_skills?.length       ? `<div class="skill-group"><div class="skill-group-label other">&#9672; Other</div>${p.other_skills.map(s=>`<span class="skill-pill-other">${escHtml(s)}</span>`).join('')}</div>` : ''}
        </div>`).join('')
    : '<div style="color:var(--muted);font-size:.83rem;padding:12px 0">No skill profiles yet. Add one below.</div>';

  const skillProfilesTab = `
    ${profilesHtml}
    <button class="btn btn-primary" style="margin-top:4px" onclick="openNewSkillProfile('${id}')">+ Add Skill Profile</button>`;

  // ── Tab 3: Pipeline History ───────────────────────────────────────────────
  let pipelineTab = '<div style="color:var(--muted);font-size:.83rem;padding:12px 0">Candidate not in pipeline yet.</div>';

  if (pipeEntry) {
    const rounds  = pipeEntry.rounds || [];
    const history = pipeEntry.stage_history || [];

    const historyHtml = history.length ? `
      <div style="margin-bottom:16px">
        <div class="label" style="margin-bottom:6px">Stage Journey</div>
        <div class="history-list">
          ${history.map(h => `
            <div class="history-item">
              ${h.from ? `<span class="history-stage">${escHtml(h.from)}</span><span class="history-arrow">→</span>` : ''}
              <span class="history-stage" style="color:var(--blue)">${escHtml(h.to)}</span>
              ${h.notes ? `<span style="color:var(--muted)">· ${escHtml(h.notes)}</span>` : ''}
              <span class="history-at">${h.at ? new Date(h.at).toLocaleDateString() : ''}</span>
            </div>`).join('')}
        </div>
      </div>` : '';

    const roundsHtml = rounds.length ? `
      <div class="label" style="margin-bottom:8px">Interview Rounds (${rounds.length})</div>
      <div class="rounds-timeline">
        ${rounds.map((r, i) => `
          <div class="round-row">
            <div class="round-spine">
              <div class="round-dot ${r.result || 'pending'}"></div>
              ${i < rounds.length - 1 ? '<div class="round-line"></div>' : ''}
            </div>
            <div class="round-body">
              <div class="round-header">
                <span class="round-num">R${r.round_number}</span>
                <span class="round-type">${escHtml(r.type || '')}</span>
                <span class="round-result-badge ${r.result || 'pending'}">${r.result || 'pending'}</span>
              </div>
              <div class="round-meta">
                ${r.date ? escHtml(r.date) : ''}${r.interviewer ? ` · ${escHtml(r.interviewer)}` : ''}
              </div>
              ${r.feedback         ? `<div class="round-feedback">${escHtml(r.feedback)}</div>` : ''}
              ${r.no_advance_reason ? `<div class="round-no-advance">&#9888; Not advanced: ${escHtml(r.no_advance_reason)}</div>` : ''}
            </div>
          </div>`).join('')}
      </div>` : '<div style="color:var(--muted);font-size:.83rem">No rounds logged yet.</div>';

    pipelineTab = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <span style="font-size:.9rem;font-weight:700">Current Stage: <span style="color:var(--blue)">${escHtml(pipeEntry.stage || '')}</span></span>
        <div style="display:flex;gap:6px">
          <button class="btn-sm primary" onclick="openMoveStageModal('${pipeEntry.candidate_id}','${escHtml(pipeEntry.stage || '')}')">&#9654; Move Stage</button>
          <button class="btn-sm"         onclick="openAddRoundModal('${pipeEntry.candidate_id}')">+ Round</button>
        </div>
      </div>
      ${historyHtml}
      ${roundsHtml}`;
  }

  return `
    <div class="cand-modal-tabs">
      <button class="cand-modal-tab" data-tab="info"     onclick="switchCandTab('info')">&#128100; Info</button>
      <button class="cand-modal-tab" data-tab="profiles" onclick="switchCandTab('profiles')">&#127775; Skill Profiles</button>
      <button class="cand-modal-tab" data-tab="pipeline" onclick="switchCandTab('pipeline')">&#9654; Pipeline History</button>
    </div>
    <div class="cand-modal-pane" id="cmt_info">${infoTab}</div>
    <div class="cand-modal-pane" id="cmt_profiles">${skillProfilesTab}</div>
    <div class="cand-modal-pane" id="cmt_pipeline">${pipelineTab}</div>`;
}

// ── Skill Profile CRUD ────────────────────────────────────────────────────────

function openNewSkillProfile(candidateId) {
  document.getElementById('sp_title').textContent   = '✦ New Skill Profile';
  document.getElementById('sp_candidateId').value   = candidateId;
  document.getElementById('sp_profileId').value     = '';
  document.getElementById('sp_profileName').value   = '';
  document.getElementById('sp_primary').value       = '';
  document.getElementById('sp_alternative').value   = '';
  document.getElementById('sp_other').value         = '';
  openModal('skillProfileModal');
}

function openEditSkillProfile(profileId, profileName, candidateId, primary, alt, other) {
  document.getElementById('sp_title').textContent   = '✦ Edit Skill Profile';
  document.getElementById('sp_candidateId').value   = candidateId;
  document.getElementById('sp_profileId').value     = profileId;
  document.getElementById('sp_profileName').value   = profileName;
  document.getElementById('sp_primary').value       = primary.join(', ');
  document.getElementById('sp_alternative').value   = alt.join(', ');
  document.getElementById('sp_other').value         = other.join(', ');
  openModal('skillProfileModal');
}

function parseCsv(val) {
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

async function saveSkillProfile() {
  const candidateId = document.getElementById('sp_candidateId').value;
  const profileId   = document.getElementById('sp_profileId').value;
  const body = {
    profile_name:       document.getElementById('sp_profileName').value.trim(),
    primary_skills:     parseCsv(document.getElementById('sp_primary').value),
    alternative_skills: parseCsv(document.getElementById('sp_alternative').value),
    other_skills:       parseCsv(document.getElementById('sp_other').value),
  };
  if (!body.profile_name) { alert('Profile name is required'); return; }

  const url    = profileId ? `/api/skill-profiles/${profileId}` : `/api/skill-profiles/candidate/${candidateId}`;
  const method = profileId ? 'PUT' : 'POST';

  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    closeModal('skillProfileModal');
    openCandModal(candidateId, '');
  } catch(e) {
    alert('Failed to save: ' + e.message);
  }
}

async function deleteSkillProfile(profileId, candidateId) {
  if (!confirm('Delete this skill profile?')) return;
  try {
    await fetch(`/api/skill-profiles/${profileId}`, { method: 'DELETE' });
    openCandModal(candidateId, '');
  } catch(e) {
    alert('Failed to delete');
  }
}

// Close any modal when clicking on its dark overlay
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
  });
});
