// ---------------------------------------------------------------------------
// Disaster Preparedness page -- 12-month risk lookahead per city.
// ---------------------------------------------------------------------------
function computeCityRiskOutlook(city) {
  const today = new Date();
  let peak = null;
  for (let m = 0; m < 12; m++) {
    const d = new Date(today.getFullYear(), today.getMonth() + m, 15);
    const r = riskScoreFromGrid(city, d);
    if (!peak || r.score > peak.risk.score) peak = { date: d, risk: r };
  }
  return peak;
}

function reasonConcernAction(city, risk) {
  const grid = AppState.climatology[city];
  const warmingPerDecade = grid.annual_trend_slope.Tavg_C * 10;
  if (risk.tier === 'high') {
    return {
      reason: `High historical rainfall volatility (${(risk.volatility * 100).toFixed(0)}%) combined with ${risk.yearsAhead ?? risk.trainingExtrapolationYears} years of forecast extrapolation.`,
      concern: 'Wide uncertainty band around this period -- actual conditions could deviate substantially from the seasonal norm.',
      action: 'Prioritize this city/period for contingency planning, resource pre-positioning, and closer monitoring as the date approaches.',
    };
  }
  if (risk.tier === 'moderate') {
    return {
      reason: `Moderate seasonal variability${warmingPerDecade > 0.2 ? ` and a notable warming trend (+${warmingPerDecade.toFixed(2)}\u00b0C/decade)` : ''} for this period.`,
      concern: 'Some deviation from typical conditions is plausible but not extreme.',
      action: 'Standard seasonal preparedness is likely sufficient; revisit closer to the date.',
    };
  }
  return {
    reason: 'Low historical variability and limited forecast extrapolation for this period.',
    concern: 'Conditions are expected to track close to the historical norm.',
    action: 'No elevated preparedness action needed beyond routine seasonal planning.',
  };
}

function initDisasterPage() {
  const outlooks = AppState.cities.map(c => ({ city: c, ...computeCityRiskOutlook(c) }))
    .sort((a, b) => b.risk.score - a.risk.score);

  document.getElementById('disasterTableBody').innerHTML = outlooks.map(o => {
    const rca = reasonConcernAction(o.city, o.risk);
    return `
    <tr>
      <td><b>${o.city}</b></td>
      <td>${o.date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</td>
      <td><span class="risk-badge ${o.risk.tier}">${o.risk.tier}</span></td>
      <td style="font-size:12px;">${rca.reason}</td>
      <td style="font-size:12px;">${rca.concern}</td>
      <td style="font-size:12px;">${rca.action}</td>
    </tr>`;
  }).join('');

  destroyChart('disaster');
  const colorFor = t => t === 'high' ? themeColor('--high') : t === 'moderate' ? themeColor('--moderate') : themeColor('--normal');
  AppState.charts.disaster = new Chart(document.getElementById('disasterChart'), {
    type: 'bar',
    data: {
      labels: outlooks.map(o => o.city),
      datasets: [{ data: outlooks.map(o => o.risk.score), backgroundColor: outlooks.map(o => colorFor(o.risk.tier)), borderRadius: 4 }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      onHover: (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      onClick: (evt, els) => { if (els.length) jumpToPredictor(outlooks[els[0].index].city); },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          label: (ctx) => `Risk score: ${ctx.parsed.x.toFixed(2)} (${outlooks[ctx.dataIndex].risk.tier})`,
          afterLabel: () => 'Click to open in Predictor',
        } },
      },
      scales: { x: { title: { display: true, text: 'Peak risk score (next 12mo)' }, grid: { color: themeColor('--chart-grid') } }, y: { grid: { display: false } } },
    },
  });
}
