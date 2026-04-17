// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS — skills demand, score distribution, profile match charts
// ─────────────────────────────────────────────────────────────────────────────

async function loadAnalytics() {
  const el = document.getElementById('analyticsContent');
  el.innerHTML = '<div class="page-loading"><div class="spinner"></div> Loading…</div>';
  try {
    const data = await api('/api/dashboard/analytics');
    el.innerHTML = renderAnalyticsHTML(data);
    renderAnalyticsCharts(data);
  } catch(e) {
    el.innerHTML = `<div class="no-data">Error: ${e.message}</div>`;
  }
}

function renderAnalyticsHTML(data) {
  return `
    <div class="analytics-grid">
      <div class="analytics-chart" style="grid-column:1/-1">
        <h3>Skills in Demand (from job emails)</h3>
        <canvas id="chartSkills"></canvas>
      </div>
      <div class="analytics-chart">
        <h3>Match Score Distribution</h3>
        <canvas id="chartScoreDist"></canvas>
      </div>
      <div class="analytics-chart">
        <h3>Matches per Profile</h3>
        <canvas id="chartProfileMatches"></canvas>
      </div>
    </div>`;
}

function renderAnalyticsCharts(data) {
  // Skills demand — horizontal bar
  destroyChart('skills');
  const skillsCtx = document.getElementById('chartSkills');
  if (skillsCtx && data.skills_demand?.length) {
    const top = data.skills_demand.slice(0, 12);
    state.chartInstances['skills'] = new Chart(skillsCtx, {
      type: 'bar',
      data: {
        labels:   top.map(x => x.skill),
        datasets: [{ label:'Demand', data: top.map(x => x.demand),
          backgroundColor:'#1565C020', borderColor:'#1565C0', borderWidth:2 }]
      },
      options: { responsive:true, indexAxis:'y', plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true}} }
    });
  }

  // Score distribution
  destroyChart('scoreDist');
  const scoreCtx = document.getElementById('chartScoreDist');
  if (scoreCtx && data.score_buckets?.length) {
    state.chartInstances['scoreDist'] = new Chart(scoreCtx, {
      type: 'bar',
      data: {
        labels:   data.score_buckets.map(x => x.range),
        datasets: [{ label:'Candidates', data: data.score_buckets.map(x => x.count),
          backgroundColor:['#16A34A33','#1565C033','#D9770633','#DC262633','#64748B33'],
          borderColor:    ['#16A34A','#1565C0','#D97706','#DC2626','#64748B'],
          borderWidth:2 }]
      },
      options: { responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
    });
  }

  // Profile match counts donut
  destroyChart('profileMatches');
  const pmCtx = document.getElementById('chartProfileMatches');
  if (pmCtx && data.profile_matches?.length) {
    state.chartInstances['profileMatches'] = new Chart(pmCtx, {
      type: 'doughnut',
      data: {
        labels:   data.profile_matches.map(x => x.profile),
        datasets: [{ data: data.profile_matches.map(x => x.matches),
          backgroundColor: data.profile_matches.map(x => x.color || '#1565C0') }]
      },
      options: { responsive:true, plugins:{legend:{position:'bottom',labels:{font:{size:11}}}} }
    });
  }
}
