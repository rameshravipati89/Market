// ─────────────────────────────────────────────────────────────────────────────
// MAIL DETAIL — right-panel mail view with candidates + draft reply
// ─────────────────────────────────────────────────────────────────────────────

// Select a mail from the list and render its detail panel
async function selectMail(id) {
  state.selectedMailId = id;

  // Highlight the active row in the sidebar
  document.querySelectorAll('.mail-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('onclick') === `selectMail('${id}')`);
  });

  // Switch to mail tab if another tab is active
  switchMainTab('mail');

  const content = document.getElementById('mailDetailContent');
  const empty   = document.getElementById('mailDetailEmpty');
  empty.style.display   = 'none';
  content.style.display = 'block';
  content.innerHTML     = '<div class="page-loading"><div class="spinner"></div> Loading detail…</div>';

  try {
    const mail = await api(`/api/mails/${id}?profile=${encodeURIComponent(state.activeProfile || '')}`);
    state.selectedMailData = mail;
    content.innerHTML = renderMailDetail(mail);
  } catch(e) {
    content.innerHTML = `<div class="no-data">Failed to load mail detail</div>`;
  }
}

// Build the full detail HTML for a mail
function renderMailDetail(mail) {
  const candidates = mail.candidates || [];
  const subject    = mail.subject || '(no subject)';
  const sender     = mail.point_of_contact || mail.from_email || 'Unknown';
  const fromEmail  = mail.from_email || '';
  const received   = mail.received_at ? new Date(mail.received_at).toLocaleString() : '';
  const ti         = timeInfo(mail.received_at);

  // Body is stored in `description` — may be HTML or plain text
  const bodyRaw    = mail.description || '';
  const isHtml     = /<[a-z][\s\S]*>/i.test(bodyRaw);

  const skills     = extractSkillsFromText(bodyRaw || subject);
  const skillsHtml = skills.length
    ? skills.map(s => `<span class="skill-tag">${escHtml(s)}</span>`).join('')
    : '<span style="color:var(--muted);font-size:.8rem">No skills detected in body</span>';

  const candidatesHtml = candidates.length
    ? candidates.slice(0, 10).map(c => renderCandCard(c, mail.id)).join('')
    : '<div class="no-data" style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:20px">No candidates matched yet. Click <b>Re-Score</b> to run matching.</div>';

  const draft = generateDraft(mail, candidates[0]);

  // Extra metadata rows
  const metaFields = [
    ['Client',      mail.client_name],
    ['Job Contact', mail.job_contact_mail],
    ['Fetched For', mail.fetched_for],
  ].filter(([, v]) => v).map(([l, v]) => `
    <div style="display:flex;gap:6px;font-size:.78rem;margin-top:2px">
      <span style="color:var(--muted);min-width:80px">${l}:</span>
      <span style="color:var(--text)">${escHtml(v)}</span>
    </div>`).join('');

  const vendorHtml = (mail.contact_vendor || []).length
    ? `<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">
        ${mail.contact_vendor.map(v => `<span class="skill-tag" style="background:#F3E5F5;color:#6A1B9A">${escHtml(v)}</span>`).join('')}
       </div>` : '';

  // Render HTML mail in sandboxed iframe; plain text in <pre>
  const bodyDisplay = isHtml
    ? `<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;background:#fff">
         <iframe id="mailBodyFrame" srcdoc="${escHtml(bodyRaw)}"
           style="width:100%;min-height:420px;border:none"
           sandbox="allow-same-origin"
           onload="autoResizeFrame(this)"></iframe>
       </div>`
    : `<pre style="white-space:pre-wrap;font-size:.82rem;line-height:1.7;color:var(--text);
         background:var(--light);border:1px solid var(--border);border-radius:6px;
         padding:14px;max-height:500px;overflow-y:auto">${escHtml(bodyRaw)}</pre>`;

  return `
    <div class="mail-detail-wrap">
      <!-- Header card -->
      <div class="mail-header-card">
        <div class="mail-subject-line">${escHtml(subject)}</div>
        <div class="mail-from-line" style="margin-bottom:6px">
          From: <strong>${escHtml(sender)}</strong>
          ${fromEmail ? `&lt;${escHtml(fromEmail)}&gt;` : ''}
          &nbsp;·&nbsp;
          <span style="color:${ti.color};font-weight:600">${ti.label}</span>
          &nbsp;·&nbsp; ${escHtml(received)}
        </div>
        ${metaFields}
        ${vendorHtml}
        <div class="mail-skills-row" style="margin-top:10px">${skillsHtml}</div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-sm primary" onclick="openReplyModal()">&#9993; Reply</button>
          <button class="btn-sm" onclick="rescoreMail('${mail.id}')">&#8635; Re-Score</button>
          <button class="btn-sm" onclick="toggleMailBody()" id="bodyToggleBtn">&#128196; Hide Body</button>
        </div>
      </div>

      <!-- Mail body -->
      <div id="mailBodyWrap" style="margin-bottom:16px">
        <div class="section-title" style="margin-bottom:8px">
          Mail Body
          ${mail.status === 'processed'
            ? '<span style="background:#E8F5E9;color:#2E7D32;font-size:.7rem;padding:2px 8px;border-radius:10px;margin-left:8px;font-weight:600">✓ mailclean processed</span>'
            : ''}
        </div>
        ${bodyDisplay}
      </div>

      <!-- Matched candidates -->
      <div style="margin-bottom:8px" class="section-title">Top Matched Candidates (${candidates.length})</div>
      <div class="candidates-grid">${candidatesHtml}</div>

      <!-- Draft reply -->
      <div class="section-title">Draft Reply</div>
      <div class="draft-card">
        <textarea id="draftText">${escHtml(draft)}</textarea>
        <div class="draft-actions">
          <button class="btn btn-primary" onclick="openReplyModal()">&#9993; Open Reply</button>
          <button class="btn btn-secondary" onclick="copyDraft()">&#128203; Copy</button>
        </div>
      </div>
    </div>`;
}

// Auto-resize HTML mail iframe to its content height
function autoResizeFrame(iframe) {
  try {
    const h = iframe.contentDocument?.body?.scrollHeight;
    if (h) iframe.style.minHeight = Math.min(h + 20, 600) + 'px';
  } catch(e) {}
}

// Toggle mail body section visibility
function toggleMailBody() {
  const wrap = document.getElementById('mailBodyWrap');
  const btn  = document.getElementById('bodyToggleBtn');
  if (!wrap) return;
  const hidden = wrap.style.display === 'none';
  wrap.style.display = hidden ? '' : 'none';
  btn.textContent    = hidden ? '📄 Hide Body' : '📄 Show Body';
}

// Render one candidate match card
function renderCandCard(c, mailId) {
  const score    = c.score || 0;
  const color    = scoreColor(score);
  const av       = initials(c.name);
  const bgColor  = avatarColor(c.name);
  const gaps     = (c.skill_gaps || []).slice(0, 3);
  const gapsHtml = gaps.map(g => `<span class="skill-tag gap">${escHtml(g)}</span>`).join('');

  return `
    <div class="cand-card" onclick="openCandModal('${c.candidate_id || ''}','${escHtml(c.name)}')">
      <div class="cand-card-top">
        <div class="cand-avatar" style="background:${bgColor}">${av}</div>
        <div>
          <div class="cand-name">${escHtml(c.name || 'Unknown')}</div>
          <div class="cand-email">${escHtml(c.email || '')}</div>
          <div class="cand-badges">
            ${c.visa_status  ? `<span class="visa-badge">${escHtml(c.visa_status)}</span>`  : ''}
            ${c.availability ? `<span class="avail-badge">${escHtml(c.availability)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="score-bar-wrap">
        <div style="font-size:.75rem;color:var(--muted);width:70px;flex-shrink:0">Match Score</div>
        <div class="score-bar-bg">
          <div class="score-bar-fill" style="width:${score}%;background:${color}"></div>
        </div>
        <div class="score-val" style="color:${color}">${score}%</div>
      </div>
      ${gapsHtml ? `<div class="mail-skills-row" style="margin-top:8px">${gapsHtml}</div>` : ''}
      <div class="cand-actions">
        <button class="btn-sm primary" onclick="event.stopPropagation();addToPipeline('${c.candidate_id || ''}','${escHtml(c.name)}')">+ Pipeline</button>
        <button class="btn-sm" onclick="event.stopPropagation();openReplyModal('${escHtml(c.email || '')}','${escHtml(c.name)}')">&#9993; Reply</button>
      </div>
    </div>`;
}

// Scan body/subject text for known tech skills
function extractSkillsFromText(text) {
  const SKILLS = [
    'Python','Java','SQL','AWS','Azure','GCP','Spark','Kafka','Airflow','dbt',
    'Snowflake','Databricks','Tableau','Power BI','React','Node','FastAPI','Docker',
    'Kubernetes','Oracle','Workday','SAP','Scala','Hadoop','MongoDB','PostgreSQL',
    'Terraform','Jenkins','Git','Linux','REST','GraphQL','ETL','Machine Learning','AI'
  ];
  const lower = text.toLowerCase();
  return SKILLS.filter(s => lower.includes(s.toLowerCase())).slice(0, 12);
}

// Build a plain-text draft reply for the best matching candidate
function generateDraft(mail, topCand) {
  const subject  = mail.subject || 'opportunity';
  const skills   = extractSkillsFromText(mail.description || subject);
  const skillList = skills.slice(0, 4).join(', ') || 'the required technologies';
  const candName = topCand?.name ? topCand.name.split(' ')[0] : '[Candidate Name]';

  return `Hi ${candName},

I hope you're doing well! I came across an exciting ${state.activeProfile || 'tech'} opportunity that closely matches your background.

The role requires expertise in: ${skillList}.

Based on your profile, you appear to be a strong fit with a match score of ${topCand?.score || 'N/A'}%. I'd love to discuss this further with you.

Could we schedule a quick 15-minute call this week? Please reply with your availability or reach me directly at your earliest convenience.

Looking forward to connecting!

Best regards,
RecruitIQ Pro Team`;
}

// Force re-run candidate matching for a mail
async function rescoreMail(id) {
  if (!state.activeProfile) return alert('Please select a profile first');
  try {
    await fetch(`/api/mails/${id}/match?profile=${encodeURIComponent(state.activeProfile)}`, { method: 'POST' });
    await selectMail(id);
  } catch(e) {
    alert('Re-score failed: ' + e.message);
  }
}
