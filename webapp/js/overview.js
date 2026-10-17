// ---------------------------------------------------------------------------
// Executive Overview page.
// ---------------------------------------------------------------------------
function buildKpis(targetId = 'kpiRow') {
  const totalRecords = AppState.totalRecords || 0;
  const slopes = AppState.cities.map(c => AppState.climatology[c].annual_trend_slope.Tavg_C * 10);
  const avgWarming = (slopes.reduce((a, b) => a + b, 0) / slopes.length).toFixed(2);
  const targetDate = new Date(); targetDate.setFullYear(targetDate.getFullYear() + 1);
  const highRiskCount = AppState.cities.filter(c => riskScoreFromGrid(c, targetDate).tier === 'high').length;

  const kpis = [
    { label: 'Cities monitored', value: String(AppState.cities.length), note: 'across India',
      bg: '#dbeafe', fg: '#2563eb', icon: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.3"/>' },
    { label: 'Avg. warming trend', value: `+${avgWarming}\u00b0C`, note: 'per decade, across all monitored cities',
      bg: '#fee2e2', fg: '#dc2626', icon: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>' },
    { label: 'High-risk cities (1yr out)', value: String(highRiskCount), note: 'based on current risk model',
      bg: '#fef3c7', fg: '#b45309', icon: '<path d="M12 3l10 18H2z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/>' },
    { label: 'Training records', value: totalRecords.toLocaleString(), note: 'daily observations, 1991\u20132026',
      bg: '#ede9fe', fg: '#7c3aed', icon: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>' },
  ];
  const el = document.getElementById(targetId);
  if (el) {
    el.innerHTML = kpis.map(k => `
      <div class="home-stat-card">
        <div class="home-stat-icon" style="background:${k.bg}; color:${k.fg};"><svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${k.icon}</svg></div>
        <div class="home-stat-body">
          <div class="home-stat-label">${k.label}</div>
          <div class="home-stat-value" data-final="${k.value}" style="font-size:19px;">0</div>
          <div class="hp-delta" style="color:var(--text3); font-weight:500;">${k.note}</div>
        </div>
      </div>
    `).join('');
    animateCounters(el);
  }
}

function buildCityRiskList() {
  const targetDate = new Date(); targetDate.setFullYear(targetDate.getFullYear() + 1);
  const rows = AppState.cities.map(c => ({ city: c, risk: riskScoreFromGrid(c, targetDate) }))
    .sort((a, b) => b.risk.score - a.risk.score);
  document.getElementById('cityRiskList').innerHTML = rows.map(r => `
    <div class="city-row" onclick="jumpToPredictor('${r.city}')">
      <div><div class="cname">${r.city}</div><div class="cmeta">Lat ${AppState.climatology[r.city].lat.toFixed(2)}, Lon ${AppState.climatology[r.city].lon.toFixed(2)}</div></div>
      <span class="risk-badge ${r.risk.tier}">${r.risk.tier}</span>
    </div>`).join('');
}

function initOverviewPage() {
  buildKpis();
  buildCityRiskList();
  renderRiskMap();
  renderMultiCityTempChart();
  renderCityRainBarChart();

  if (!initOverviewPage._wired) {
    document.getElementById('genExecSummaryBtn').addEventListener('click', generateExecSummary);
    initOverviewPage._wired = true;
  }
}
