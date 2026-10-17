// ---------------------------------------------------------------------------
// Urban Planning / Infrastructure page -- long-term warming trend projected
// across common infrastructure planning horizons (10/20/30 years).
// ---------------------------------------------------------------------------
function currentAvgTemp(city) {
  const annual = AppState.climatology[city].annual_series;
  const years = Object.keys(annual).sort();
  const last5 = years.slice(-5);
  const vals = last5.map(y => annual[y].avg_temp);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function planningConcernAction(warmingPerDecade, p30) {
  if (warmingPerDecade >= 0.35) {
    return {
      concern: `Fast-warming city (+${warmingPerDecade.toFixed(2)}\u00b0C/decade) -- projected average approaching ${p30.toFixed(1)}\u00b0C within 30 years.`,
      action: 'Prioritize heat-resilient infrastructure: cooling corridors, reflective/green roofing standards, and heat-stress-rated public transit shelters.',
    };
  }
  if (warmingPerDecade >= 0.15) {
    return {
      concern: 'Moderate but steady warming trend over the historical record.',
      action: 'Factor gradual warming into long-horizon infrastructure specs (HVAC capacity, material heat tolerance) for projects with 20+ year lifespans.',
    };
  }
  return {
    concern: 'Comparatively stable long-term temperature trend.',
    action: 'Standard infrastructure planning assumptions likely remain valid; low priority for heat-specific adaptation.',
  };
}

function initPlanningPage() {
  const rows = AppState.cities.map(c => {
    const slope = AppState.climatology[c].annual_trend_slope.Tavg_C * 10; // per decade
    const base = currentAvgTemp(c);
    return {
      city: c, base, slope,
      p10: base + slope * 1, p20: base + slope * 2, p30: base + slope * 3,
    };
  }).sort((a, b) => b.slope - a.slope);

  document.getElementById('planningTableBody').innerHTML = rows.map(r => {
    const ca = planningConcernAction(r.slope, r.p30);
    return `
    <tr>
      <td><b>${r.city}</b></td>
      <td>${r.base.toFixed(1)}</td>
      <td>+${r.slope.toFixed(2)}\u00b0C</td>
      <td>${r.p10.toFixed(1)}</td>
      <td>${r.p20.toFixed(1)}</td>
      <td>${r.p30.toFixed(1)}</td>
      <td style="font-size:12px;">${ca.concern}</td>
      <td style="font-size:12px;">${ca.action}</td>
    </tr>`;
  }).join('');

  destroyChart('planning');
  const horizons = ['Now', '+10yr', '+20yr', '+30yr'];
  AppState.charts.planning = new Chart(document.getElementById('planningChart'), {
    type: 'line',
    data: {
      labels: horizons,
      datasets: rows.map(r => ({
        label: r.city, data: [r.base, r.p10, r.p20, r.p30],
        borderColor: AppState.colors[r.city], backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 9, font: { size: 10 } } } },
      scales: { y: { title: { display: true, text: '\u00b0C (projected avg.)' }, grid: { color: themeColor('--chart-grid') } }, x: { grid: { display: false } } },
    },
  });
}
