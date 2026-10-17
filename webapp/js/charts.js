// ---------------------------------------------------------------------------
// Chart.js rendering. Uses the precomputed climatology grid (AppState) for
// speed -- these are descriptive/historical charts, not live model calls.
// The live model call lives in predictor.js (Api.predict).
// ---------------------------------------------------------------------------

function dayOfYear(dateObj) {
  const start = new Date(dateObj.getFullYear(), 0, 0);
  return Math.floor((dateObj - start) / 86400000);
}

function riskScoreFromGrid(city, dateObj) {
  const grid = AppState.climatology[city];
  const year = dateObj.getFullYear();
  // Matches the backend's fixed calculation: extrapolation is measured from
  // the last year the models actually trained on (2018), not the display
  // baseline (2024) -- using 2024 understated how far a forecast really
  // extrapolates beyond the training data.
  const trainingExtrapolationYears = Math.max(0, year - TRAIN_END_YEAR);
  const extrapolation = Math.min(1, trainingExtrapolationYears / 20);
  const doy = Math.min(366, Math.max(1, dayOfYear(dateObj)));
  const rainStd = grid.grid.Rainfall_mm.std[doy - 1];
  const rainMean = grid.grid.Rainfall_mm.mean[doy - 1];
  const volatility = Math.min(1, rainStd / (rainMean + 8));
  // Simplified fallback formula (offline mode only) -- the live backend
  // computes a fuller 5-component risk index (heat/rainfall/humidity/
  // warming/reliability); this client-side version approximates it with
  // just extrapolation + rainfall volatility, recalibrated to the same
  // realistic score range (~0.12-0.50) as the live version.
  const score = 0.55 * extrapolation + 0.45 * volatility;
  let tier = 'normal';
  if (score >= 0.62) tier = 'high';
  else if (score >= 0.32) tier = 'moderate';
  return { score, tier, extrapolation, volatility, yearsAhead: trainingExtrapolationYears, trainingExtrapolationYears };
}

function renderRiskMap() {
  const targetDate = new Date(); targetDate.setFullYear(targetDate.getFullYear() + 1);
  const points = AppState.cities.map(c => {
    const r = riskScoreFromGrid(c, targetDate);
    const g = AppState.climatology[c];
    return { lat: g.lat, lon: g.lon, city: c, r };
  });
  const colorFor = t => t.tier === 'high' ? themeColor('--high') : t.tier === 'moderate' ? themeColor('--moderate') : themeColor('--normal');

  // Leaflet map instances can't be re-created on the same container without
  // being torn down first (throws "Map container is already initialized").
  if (AppState.leafletMap) { AppState.leafletMap.remove(); AppState.leafletMap = null; }

  const map = L.map('riskMapLeaflet', { scrollWheelZoom: false }).setView([22.5, 79.5], 4.6);
  AppState.leafletMap = map;

  const isDark = currentTheme() === 'dark';
  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  L.tileLayer(tileUrl, {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 10,
  }).addTo(map);

  points.forEach(p => {
    const radius = 9 + p.r.score * 14;
    const marker = L.circleMarker([p.lat, p.lon], {
      radius, color: colorFor(p.r), weight: 1.5,
      fillColor: colorFor(p.r), fillOpacity: 0.75,
    }).addTo(map);
    marker.bindTooltip(`<b>${p.city}</b><br>Risk: ${p.r.tier}`, { direction: 'top' });
    marker.on('click', () => jumpToPredictor(p.city));
  });
}

function renderMultiCityTempChart() {
  const years = Object.keys(AppState.climatology[AppState.cities[0]].annual_series).sort();
  destroyChart('multiTemp');
  AppState.charts.multiTemp = new Chart(document.getElementById('multiCityTempChart'), {
    type: 'line',
    data: {
      labels: years,
      datasets: AppState.cities.map(c => ({
        label: c,
        data: years.map(y => AppState.climatology[c].annual_series[y].avg_temp),
        borderColor: AppState.colors[c], backgroundColor: 'transparent', borderWidth: 1.6, pointRadius: 0, tension: 0.15,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 9, font: { size: 10 } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}\u00b0C` } },
      },
      scales: {
        y: { title: { display: true, text: '\u00b0C' }, grid: { color: themeColor('--chart-grid') } },
        x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } },
      },
    },
  });
}

function renderCityRainBarChart() {
  const avgRain = AppState.cities.map(c => {
    const years = Object.keys(AppState.climatology[c].annual_series);
    const v = years.map(y => AppState.climatology[c].annual_series[y].total_rain);
    return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
  });
  destroyChart('cityRain');
  AppState.charts.cityRain = new Chart(document.getElementById('cityRainBarChart'), {
    type: 'bar',
    data: { labels: AppState.cities, datasets: [{ data: avgRain, backgroundColor: AppState.cities.map(c => AppState.colors[c]), borderRadius: 4 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.x.toLocaleString()} mm/year average` } },
      },
      scales: { x: { title: { display: true, text: 'mm/yr' }, grid: { color: themeColor('--chart-grid') } }, y: { grid: { display: false } } },
    },
  });
}

function renderWindowChart(city, doy, year) {
  const grid = AppState.climatology[city];
  const labels = [], means = [], upper = [], lower = [];
  for (let off = -15; off <= 15; off++) {
    let d = doy + off;
    if (d < 1) d += 366; if (d > 366) d -= 366;
    const slope = grid.annual_trend_slope.Tavg_C;
    const m = grid.grid.Tavg_C.mean[d - 1] + slope * (year - grid.baseline_year);
    const s = grid.grid.Tavg_C.std[d - 1];
    labels.push(off === 0 ? 'Day 0' : (off > 0 ? '+' : '') + off);
    means.push(+m.toFixed(1)); upper.push(+(m + s).toFixed(1)); lower.push(+(m - s).toFixed(1));
  }
  destroyChart('window');
  AppState.charts.window = new Chart(document.getElementById('windowChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Upper', data: upper, borderColor: 'transparent', backgroundColor: 'rgba(37,87,214,0.10)', fill: '+1', pointRadius: 0 },
        { label: 'Expected', data: means, borderColor: '#2563eb', backgroundColor: 'transparent', borderWidth: 2.5, pointRadius: labels.map((l, i) => i === 15 ? 5 : 0), pointBackgroundColor: '#2563eb' },
        { label: 'Lower', data: lower, borderColor: 'transparent', backgroundColor: 'transparent', pointRadius: 0 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (item) => item.dataset.label === 'Expected',
          callbacks: {
            label: (ctx) => `Expected: ${ctx.parsed.y}\u00b0C`,
            afterLabel: (ctx) => `Range: ${lower[ctx.dataIndex]}\u2013${upper[ctx.dataIndex]}\u00b0C`,
          },
        },
      },
      scales: {
        y: { title: { display: true, text: '\u00b0C' }, grid: { color: themeColor('--chart-grid') } },
        x: { grid: { display: false }, title: { display: true, text: 'Days from selected date' } },
      },
    },
  });
}

function renderTrendChart(city, projYear, projTemp) {
  const annual = AppState.climatology[city].annual_series;
  const years = Object.keys(annual).sort();
  const temps = years.map(y => annual[y].avg_temp);
  const lastYear = parseInt(years[years.length - 1]);
  const labels = [...years];
  const history = temps.slice();
  const proj = new Array(temps.length - 1).fill(null); proj.push(temps[temps.length - 1]);
  if (projYear > lastYear) {
    for (let y = lastYear + 1; y < projYear; y++) { labels.push(String(y)); history.push(null); proj.push(null); }
    labels.push(String(projYear)); history.push(null); proj.push(+projTemp.toFixed(2));
  }
  destroyChart('trend');
  AppState.charts.trend = new Chart(document.getElementById('trendChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Historical', data: history, borderColor: '#2563eb', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 1.5, spanGaps: false },
        { label: 'Projected', data: proj, borderColor: '#d97706', borderDash: [6, 4], backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, spanGaps: true },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}\u00b0C` } },
      },
      scales: {
        y: { title: { display: true, text: '\u00b0C' }, grid: { color: themeColor('--chart-grid') } },
        x: { ticks: { maxRotation: 45, autoSkip: true }, grid: { display: false } },
      },
    },
  });
}
