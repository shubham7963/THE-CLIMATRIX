// ---------------------------------------------------------------------------
// Model Validation page -- predicts a PAST date as if it were unknown, then
// reveals the actual recorded value for comparison. Genuine proof of
// accuracy rather than just an R^2 number in a table. Needs the live
// backend (real daily records + live inference aren't available client-side
// in the offline fallback mode).
// ---------------------------------------------------------------------------
function populateBacktestSelectors() {
  const citySel = document.getElementById('backtestCitySelect');
  AppState.cities.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; citySel.appendChild(o); });
  citySel.value = AppState.cities.includes('Delhi') ? 'Delhi' : AppState.cities[0];

  const dateInput = document.getElementById('backtestDateInput');
  // Default to a genuinely held-out date (well after the 2018 train cutoff)
  // so the first thing a visitor sees is an honest out-of-sample test.
  dateInput.value = '2022-07-15';
  // Bounded by BOTH "yesterday" (can't backtest the future) and the
  // dataset's actual real-data coverage (can't verify against data that
  // doesn't exist) -- using only one of these is what caused dates past
  // the old 2024 cutoff to silently return blank results.
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  dateInput.max = (AppState.dataEndDate && AppState.dataEndDate < yesterday) ? AppState.dataEndDate : yesterday;
  dateInput.min = '1991-01-01';
}

async function runBacktest() {
  const city = document.getElementById('backtestCitySelect').value;
  const dateStr = document.getElementById('backtestDateInput').value;
  if (!dateStr) { toast('Pick a past date.', 'error'); return; }

  const btn = document.getElementById('backtestRunBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Running\u2026';

  let result;
  try {
    result = await Api.backtest(city, dateStr);
  } catch (err) {
    document.getElementById('backtestBadge').textContent =
      'Model Validation needs the live backend running (see docs/README.md) -- not available in this offline preview, since it requires real historical records and live model inference.';
    document.getElementById('backtestTableBody').innerHTML =
      '<tr><td colspan="4" style="color:var(--text3); font-size:12.5px;">Unavailable offline.</td></tr>';
    destroyChart('backtest');
    btn.disabled = false; btn.textContent = 'Run backtest \u2197';
    return;
  }
  btn.disabled = false; btn.textContent = 'Run backtest \u2197';

  const badge = document.getElementById('backtestBadge');
  const prettyDate = new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  badge.textContent = result.held_out
    ? `${prettyDate} is a genuinely held-out test: the production model was only trained on data through ${result.train_end_year}, so it never saw this date during training.`
    : `${prettyDate} falls within the model's training period (through ${result.train_end_year}) -- this is an in-sample check, not a true held-out test.`;

  const rows = Object.entries(result.comparison).map(([target, v]) => `
    <tr><td>${TARGET_LABEL[target]}</td><td>${v.predicted}</td><td>${v.actual}</td><td>${v.abs_error}</td></tr>
  `).join('');
  document.getElementById('backtestTableBody').innerHTML = rows;

  destroyChart('backtest');
  const targets = Object.keys(result.comparison);
  AppState.charts.backtest = new Chart(document.getElementById('backtestChart'), {
    type: 'bar',
    data: {
      labels: targets.map(t => TARGET_LABEL[t]),
      datasets: [
        { label: 'Predicted', data: targets.map(t => result.comparison[t].predicted), backgroundColor: '#2563eb', borderRadius: 4 },
        { label: 'Actual', data: targets.map(t => result.comparison[t].actual), backgroundColor: '#7c3aed', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: { y: { grid: { color: themeColor('--chart-grid') } }, x: { grid: { display: false } } },
    },
  });
}

const TARGET_UNIT = { Tavg_C: '\u00b0C', Rainfall_mm: 'mm', Humidity_pct: '%', WindSpeed_kmh: 'km/h' };
let lastBacktestSeriesResult = null;

function renderBacktestSeriesChart(target) {
  if (!lastBacktestSeriesResult) return;
  const result = lastBacktestSeriesResult;
  const dates = result.results.map(r => r.date);
  destroyChart('backtestSeries');
  AppState.charts.backtestSeries = new Chart(document.getElementById('backtestSeriesChart'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: `${TARGET_LABEL[target]} absolute error (${TARGET_UNIT[target]}) per held-out date`,
        data: result.results.map(r => r.comparison[target].abs_error),
        borderColor: themeColor('--accent'), backgroundColor: themeColor('--accent') + '22',
        borderWidth: 2, pointRadius: 3, fill: true, tension: 0.15,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `Abs. error: ${ctx.parsed.y} ${TARGET_UNIT[target]}` } },
      },
      scales: {
        y: { title: { display: true, text: `Abs. error (${TARGET_UNIT[target]})` }, grid: { color: themeColor('--chart-grid') } },
        x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } },
      },
    },
  });
}

async function runBacktestSeries() {
  const city = document.getElementById('backtestCitySelect').value;
  const btn = document.getElementById('backtestSeriesBtn');
  const summaryEl = document.getElementById('backtestSeriesSummary');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Running held-out predictions\u2026';

  let result;
  try {
    result = await Api.backtestSeries(city);
  } catch (err) {
    summaryEl.innerHTML = `<div class="note-box">Consistency check needs the live backend running -- not available in this offline preview.</div>`;
    btn.disabled = false; btn.textContent = 'Run consistency check \u2197';
    return;
  }
  btn.disabled = false; btn.textContent = 'Run consistency check \u2197';
  lastBacktestSeriesResult = result;
  document.getElementById('backtestSeriesParamField').style.display = 'flex';

  const agg = result.aggregate;
  summaryEl.innerHTML = `
    <p style="font-size:12.5px; color:var(--text2); margin:0 0 10px;">
      ${result.n_dates} held-out dates tested for ${city} (one per quarter, 2019\u2013today). Aggregate error:
    </p>
    <div class="grid-4">
      ${Object.keys(agg).map(t => `
        <div class="kpi"><div class="k-label">${TARGET_LABEL[t]}</div>
          <div class="k-value" style="font-size:16px;">MAE ${agg[t].mae}</div>
          <div class="k-note">RMSE ${agg[t].rmse} &middot; n=${agg[t].n}</div>
        </div>
      `).join('')}
    </div>`;

  const chartHolder = document.getElementById('backtestSeriesChartHolder');
  chartHolder.style.display = 'block';
  renderBacktestSeriesChart(document.getElementById('backtestSeriesParamSelect').value);
}

function initBacktestPage() {
  populateBacktestSelectors();
  document.getElementById('backtestRunBtn').addEventListener('click', runBacktest);
  document.getElementById('backtestSeriesBtn').addEventListener('click', runBacktestSeries);
  document.getElementById('backtestSeriesParamSelect').addEventListener('change', (e) => {
    if (lastBacktestSeriesResult) renderBacktestSeriesChart(e.target.value);
  });
}
