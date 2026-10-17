// ---------------------------------------------------------------------------
// Compare & Explore page.
//   - City comparison: 2-3 selectable cities, side-by-side normals + a
//     shared temperature trend chart.
//   - Historical explorer: full 1991-2026 annual record for one city and
//     one variable at a time, read straight from the precomputed
//     climatology grid (AppState.climatology[city].annual_series).
// ---------------------------------------------------------------------------
const MAX_COMPARE_CITIES = 3;
let selectedCompareCities = [];

function buildCityPicker() {
  const el = document.getElementById('compareCityPicker');
  el.innerHTML = AppState.cities.map(c => `
    <label style="display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--text2); cursor:pointer;">
      <input type="checkbox" class="compare-city-cb" value="${c}"> ${c}
    </label>
  `).join('');
  el.querySelectorAll('.compare-city-cb').forEach(cb => cb.addEventListener('change', onCompareCityToggle));
}

function onCompareCityToggle(e) {
  const city = e.target.value;
  if (e.target.checked) {
    if (selectedCompareCities.length >= MAX_COMPARE_CITIES) {
      e.target.checked = false;
      toast(`Pick up to ${MAX_COMPARE_CITIES} cities at a time.`, 'error');
      return;
    }
    selectedCompareCities.push(city);
  } else {
    selectedCompareCities = selectedCompareCities.filter(c => c !== city);
  }
  renderCompareTable();
  renderCompareTempChart();
}

function renderCompareTable() {
  const targetDate = new Date(); targetDate.setFullYear(targetDate.getFullYear() + 1);
  const rows = selectedCompareCities.map(c => {
    const g = AppState.climatology[c];
    const years = Object.keys(g.annual_series);
    const avgTemp = (years.reduce((s, y) => s + g.annual_series[y].avg_temp, 0) / years.length).toFixed(1);
    const avgRain = Math.round(years.reduce((s, y) => s + g.annual_series[y].total_rain, 0) / years.length);
    const warming = (g.annual_trend_slope.Tavg_C * 10).toFixed(2);
    const risk = riskScoreFromGrid(c, targetDate);
    return `<tr><td>${c}</td><td>${avgTemp}</td><td>${avgRain}</td><td>+${warming}</td>
      <td><span class="risk-badge ${risk.tier}">${risk.tier}</span></td></tr>`;
  });
  document.getElementById('compareTableBody').innerHTML = rows.join('') ||
    '<tr><td colspan="5" style="color:var(--text3); font-size:12.5px;">Select up to 3 cities above to compare.</td></tr>';
}

function renderCompareTempChart() {
  destroyChart('compare');
  if (!selectedCompareCities.length) {
    if (AppState.charts.compare) { AppState.charts.compare.destroy(); delete AppState.charts.compare; }
    const ctx = document.getElementById('compareTempChart').getContext('2d');
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }
  const years = Object.keys(AppState.climatology[selectedCompareCities[0]].annual_series).sort();
  AppState.charts.compare = new Chart(document.getElementById('compareTempChart'), {
    type: 'line',
    data: {
      labels: years,
      datasets: selectedCompareCities.map(c => ({
        label: c,
        data: years.map(y => AppState.climatology[c].annual_series[y].avg_temp),
        borderColor: AppState.colors[c], backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.15,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 9, font: { size: 10 } } } },
      scales: {
        y: { title: { display: true, text: '\u00b0C' }, grid: { color: themeColor('--chart-grid') } },
        x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } },
      },
    },
  });
}

const EXPLORER_LABELS = {
  Tavg_C: { label: 'Avg. temperature', unit: '\u00b0C', annualKey: 'avg_temp' },
  Rainfall_mm: { label: 'Rainfall', unit: 'mm', annualKey: 'total_rain' },
  Humidity_pct: { label: 'Humidity', unit: '%', annualKey: 'avg_humidity' },
  WindSpeed_kmh: { label: 'Wind speed', unit: 'km/h', annualKey: 'avg_wind' },
};

// Fallback used only if the backend is unreachable: reads the precomputed
// annual aggregates already bundled client-side instead of real daily data.
function explorerFallback(city, target, startYear, endYear) {
  const g = AppState.climatology[city];
  const annualKey = EXPLORER_LABELS[target].annualKey;
  const years = Object.keys(g.annual_series).sort().filter(y => +y >= startYear && +y <= endYear);
  return {
    resolution: 'annual (fallback)',
    points: years.map(y => ({ date: `${y}-01-01`, value: g.annual_series[y][annualKey] })),
  };
}

async function renderExplorerChart() {
  const city = document.getElementById('explorerCitySelect').value;
  const target = document.getElementById('explorerVarSelect').value;
  const start = document.getElementById('explorerStartInput').value || '1991-01-01';
  const end = document.getElementById('explorerEndInput').value || AppState.dataEndDate || '2026-12-31';
  const meta = EXPLORER_LABELS[target];

  let data;
  try {
    data = await Api.history(city, target, start, end);
  } catch (err) {
    console.warn('Live history fetch failed, using bundled annual aggregates:', err);
    data = explorerFallback(city, target, +start.slice(0, 4), +end.slice(0, 4));
  }

  const labels = data.points.map(p => p.date);
  const values = data.points.map(p => p.value);

  destroyChart('explorer');
  AppState.charts.explorer = new Chart(document.getElementById('explorerChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `${city} \u2014 ${meta.label} (${data.resolution})`,
        data: values, borderColor: AppState.colors[city] || '#2563eb',
        backgroundColor: (AppState.colors[city] || '#2563eb') + '22',
        borderWidth: data.resolution === 'daily' ? 1.2 : 2,
        pointRadius: data.points.length > 120 ? 0 : 1.5, fill: true, tension: 0.2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { title: { display: true, text: meta.unit }, grid: { color: themeColor('--chart-grid') } },
        x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 14 }, grid: { display: false } },
      },
    },
  });
}

function initComparePage() {
  buildCityPicker();
  renderCompareTable();

  if (!initComparePage._wired) {
    const explorerCitySel = document.getElementById('explorerCitySelect');
    AppState.cities.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; explorerCitySel.appendChild(o); });
    explorerCitySel.value = AppState.cities.includes('Delhi') ? 'Delhi' : AppState.cities[0];

    // Bound by the dataset's real coverage, not the static HTML default --
    // otherwise this silently drifts stale the same way the Model
    // Validation date picker did (see backtest.js for the full story).
    if (AppState.dataEndDate) {
      const endInput = document.getElementById('explorerEndInput');
      const startInput = document.getElementById('explorerStartInput');
      endInput.max = AppState.dataEndDate; endInput.value = AppState.dataEndDate;
      startInput.max = AppState.dataEndDate;
    }

    document.getElementById('explorerRunBtn').addEventListener('click', renderExplorerChart);
    document.getElementById('explorerCitySelect').addEventListener('change', renderExplorerChart);
    document.getElementById('explorerVarSelect').addEventListener('change', renderExplorerChart);
    initComparePage._wired = true;
  }
  renderExplorerChart();
}
