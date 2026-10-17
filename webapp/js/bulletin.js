// ---------------------------------------------------------------------------
// Climate Bulletin -- rule-based, generated on page load (not persisted).
// Reuses monthlyStatsFor() from report.js and riskScoreFromGrid() from
// charts.js so the numbers are consistent everywhere on the site.
// ---------------------------------------------------------------------------
function bulletinTextFor(city) {
  const month = new Date().getMonth() + 1;
  const stats = monthlyStatsFor(city, month);
  const grid = AppState.climatology[city];
  const warmingPerDecade = grid.annual_trend_slope.Tavg_C * 10;
  const risk = riskScoreFromGrid(city, new Date());

  const rainNote = stats.totalRain > 150
    ? `Rainfall is typically heavy this month (~${stats.totalRain.toFixed(0)}mm), consistent with the monsoon window for this region.`
    : stats.totalRain > 20
    ? `Moderate rainfall is typical this month (~${stats.totalRain.toFixed(0)}mm).`
    : `This month is typically dry (~${stats.totalRain.toFixed(0)}mm expected).`;

  return `${MONTH_NAMES[month - 1]} in ${city} typically averages ${stats.avgTemp.toFixed(1)}\u00b0C with humidity around ${stats.avgHumidity.toFixed(0)}%. `
    + rainNote + ` Long-term, the city is warming at +${warmingPerDecade.toFixed(2)}\u00b0C per decade. `
    + `Current seasonal risk reading: ${risk.tier}.`;
}

function initBulletinPage() {
  const now = new Date();
  document.getElementById('bulletinDateLabel').textContent =
    `${now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} outlook, city by city.`;

  document.getElementById('bulletinList').innerHTML = AppState.cities.map(c => `
    <div class="card" style="margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div class="role-title" style="margin:0;">${c}</div>
        <span class="risk-badge ${riskScoreFromGrid(c, now).tier}">${riskScoreFromGrid(c, now).tier}</span>
      </div>
      <p style="font-size:12.8px; color:var(--text2); line-height:1.65; margin:0;">${bulletinTextFor(c)}</p>
    </div>
  `).join('');
}
