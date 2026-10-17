
// Model Analytics & Data Explorer page.

function buildAnalyticsKpis() {
  const perfByCity = {};
  AppState.performance.forEach(row => {
    perfByCity[row.City] = perfByCity[row.City] || {};
    perfByCity[row.City][row.Target] = { mae: row.MAE, rmse: row.RMSE, r2: row.R2 };
  });
  const avgR2Temp = (AppState.cities.reduce((s, c) => s + perfByCity[c].Tavg_C.r2, 0) / AppState.cities.length).toFixed(2);
  const avgMaeTemp = (AppState.cities.reduce((s, c) => s + perfByCity[c].Tavg_C.mae, 0) / AppState.cities.length).toFixed(2);
  const lastTestYear = AppState.dataEndDate ? AppState.dataEndDate.slice(0, 4) : '2026';
  const analyticsKpis = [
    { label: 'Models trained', value: String(AppState.cities.length * 4), note: `${AppState.cities.length} cities \u00d7 4 targets (Random Forest)`, animate: true },
    { label: 'Avg. temp R\u00b2', value: avgR2Temp, note: `forward hold-out, 2019\u2013${lastTestYear}`, animate: true },
    { label: 'Avg. temp MAE', value: `${avgMaeTemp}\u00b0C`, note: `forward hold-out, 2019\u2013${lastTestYear}`, animate: true },
    { label: 'Train / test split', value: `2018 | ${lastTestYear}`, note: 'time-based, not random', animate: false },
  ];
  const el = document.getElementById('analyticsKpiRow');
  el.innerHTML = analyticsKpis.map(k => `
    <div class="kpi"><div class="k-label">${k.label}</div><div class="k-value" ${k.animate ? `data-final="${k.value}"` : ''}>${k.animate ? '0' : k.value}</div><div class="k-note">${k.note}</div></div>
  `).join('');
  animateCounters(el);
  return perfByCity;
}

function buildPerfTable(perfByCity) {
  const rows = [];
  AppState.cities.forEach(c => {
    Object.keys(TARGET_LABEL).forEach(t => {
      const p = perfByCity[c][t];
      const r2pct = Math.max(2, Math.round(Math.max(0, p.r2) * 100));
      const color = p.r2 > 0.5 ? themeColor('--normal') : p.r2 > 0.2 ? themeColor('--moderate') : themeColor('--high');
      rows.push(`<tr><td>${c}</td><td>${TARGET_LABEL[t]}</td><td>${p.mae}</td><td>${p.rmse ?? '\u2013'}</td>
        <td>${p.r2} <span class="r2-bar-bg"><span class="r2-bar-fill" style="width:${r2pct}%; background:${color};"></span></span></td></tr>`);
    });
  });
  document.getElementById('perfTableBody').innerHTML = rows.join('');
}

function initAnalyticsPage() {
  const perfByCity = buildAnalyticsKpis();
  buildPerfTable(perfByCity);
}
