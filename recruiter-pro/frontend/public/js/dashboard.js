// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD — stat cards + three charts
// ─────────────────────────────────────────────────────────────────────────────

async function loadDashboard() {
  const el = document.getElementById('dashContent');
  el.innerHTML = '<div class="page-loading"><div class="spinner"></div> Loading…</div>';
  try {
    const d = await api('/api/dashboard/stats');
    el.innerHTML = renderDashboard(d);
    renderDashCharts(d);
  } catch(e) {
    el.innerHTML = `<div class="no-data">Dashboard error: ${e.message}</div>`;
  }
}

function renderDashboard(d) {
  const stages     = d.stage_counts || {};
  const stageTotal = Object.values(stages).reduce((a, b) => a + b, 0);

  const topMatchesRows = (d.top_matches || []).map(m => `
    <tr>
      <td><strong>${escHtml(m.name || '—')}</strong></td>
      <td>${escHtml(m.profile || '—')}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="score-bar-bg" style="width:80px">
            <div class="score-bar-fill" style="width:${m.score}%;background:${scoreColor(m.score)}"></div>
          </div>
          <strong style="color:${scoreColor(m.score)}">${m.score}%</strong>
        </div>
      </td>
      <td>${escHtml(m.visa_status || '—')}</td>
      <td>${escHtml(m.availability || '—')}</td>
    </tr>`).join('');

  const recentRows = (d.recent_mails || []).map(m => `
    <tr>
      <td>
        <span class="signal-dot ${signal(m.received_at)}" style="display:inline-block;vertical-align:middle;margin-right:6px"></span>
        ${escHtml(m.point_of_contact || m.from_email || '—')}
      </td>
      <td>${escHtml(m.subject || '—')}</td>
      <td>${relTime(m.received_at)}</td>
    </tr>`).join('');

  return `
    <div class="stat-cards">
      <div class="stat-card"><div class="label">Total Mails</div><div class="value">${d.total_mails || 0}</div><div class="sub">All time</div></div>
      <div class="stat-card"><div class="label">Today</div><div class="value">${d.mails_today || 0}</div><div class="sub">New today</div></div>
      <div class="stat-card"><div class="label">This Week</div><div class="value">${d.mails_week || 0}</div><div class="sub">Last 7 days</div></div>
      <div class="stat-card"><div class="label">Candidates</div><div class="value">${d.total_candidates || 0}</div><div class="sub">In database</div></div>
      <div class="stat-card"><div class="label">Pipeline</div><div class="value">${stageTotal}</div><div class="sub">Active entries</div></div>
    </div>

    <div class="charts-row">
      <div class="chart-card"><h3>Daily Mail Volume</h3><canvas id="chartVolume"></canvas></div>
      <div class="chart-card"><h3>Visa Distribution</h3><canvas id="chartVisa"></canvas></div>
      <div class="chart-card"><h3>Pipeline Stages</h3><canvas id="chartStages"></canvas></div>
    </div>

    ${topMatchesRows ? `
    <div class="table-wrap">
      <h3>Top Matched Candidates</h3>
      <table>
        <thead><tr><th>Name</th><th>Profile</th><th>Score</th><th>Visa</th><th>Availability</th></tr></thead>
        <tbody>${topMatchesRows}</tbody>
      </table>
    </div>` : ''}

    ${recentRows ? `
    <div class="table-wrap">
      <h3>Recent Mails</h3>
      <table>
        <thead><tr><th>From</th><th>Subject</th><th>Received</th></tr></thead>
        <tbody>${recentRows}</tbody>
      </table>
    </div>` : ''}`;
}

function renderDashCharts(d) {
  // Daily mail volume bar chart
  destroyChart('volume');
  const volCtx = document.getElementById('chartVolume');
  if (volCtx && d.daily_volume?.length) {
    state.chartInstances['volume'] = new Chart(volCtx, {
      type: 'bar',
      data: {
        labels:   d.daily_volume.map(x => x.date),
        datasets: [{ label:'Mails', data: d.daily_volume.map(x => x.count),
          backgroundColor:'#1565C020', borderColor:'#1565C0', borderWidth:2 }]
      },
      options: { responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
    });
  }

  // Visa distribution donut
  destroyChart('visa');
  const visaCtx = document.getElementById('chartVisa');
  if (visaCtx && d.visa_distribution?.length) {
    state.chartInstances['visa'] = new Chart(visaCtx, {
      type: 'doughnut',
      data: {
        labels:   d.visa_distribution.map(x => x.visa),
        datasets: [{ data: d.visa_distribution.map(x => x.count),
          backgroundColor:['#1565C0','#2E7D32','#E65100','#6A1B9A','#00695C','#AD1457'] }]
      },
      options: { responsive:true, plugins:{legend:{position:'bottom',labels:{font:{size:10}}}} }
    });
  }

  // Pipeline stage counts bar chart
  destroyChart('stages');
  const stagesCtx = document.getElementById('chartStages');
  if (stagesCtx && d.stage_counts) {
    const labels = Object.keys(d.stage_counts);
    const vals   = Object.values(d.stage_counts);
    state.chartInstances['stages'] = new Chart(stagesCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label:'Count', data: vals,
          backgroundColor:['#1565C020','#2E7D3220','#E6510020','#6A1B9A20','#00695C20','#DC262620'],
          borderColor:    ['#1565C0','#2E7D32','#E65100','#6A1B9A','#00695C','#DC2626'],
          borderWidth:2 }]
      },
      options: { responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
    });
  }
}
