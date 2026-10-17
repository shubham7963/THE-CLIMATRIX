// ---------------------------------------------------------------------------
// Forecast & Risk Predictor page. This is the page that talks to the live
// Random Forest models on the backend (Api.predict) rather than reading a
// precomputed lookup table -- every click here runs real model inference.
// ---------------------------------------------------------------------------
function populateSelectors() {
  const citySel = document.getElementById('citySelect');
  AppState.cities.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; citySel.appendChild(o); });
  citySel.value = AppState.cities.includes('Delhi') ? 'Delhi' : AppState.cities[0];

  const dateInput = document.getElementById('dateInput');
  const d = new Date(); d.setFullYear(d.getFullYear() + 1);
  dateInput.value = d.toISOString().slice(0, 10);
  dateInput.min = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  dateInput.max = '2060-12-31';
}

async function runPrediction() {
  const city = document.getElementById('citySelect').value;
  const dateStr = document.getElementById('dateInput').value;
  if (!dateStr) { toast('Pick a date.', 'error'); return; }
  const dateObj = new Date(dateStr + 'T00:00:00');
  if (dateObj <= new Date()) { toast('Pick a future date.', 'error'); return; }

  const predictBtn = document.getElementById('predictBtn');
  predictBtn.disabled = true;
  predictBtn.innerHTML = '<span class="spinner"></span>Running model\u2026';

  let result;
  try {
    // Live call to the trained Random Forest models on the backend.
    result = await Api.predict(city, dateStr);
  } catch (err) {
    // Backend not reachable -- fall back to the precomputed grid so the
    // dashboard's charts and layout still work, but make it clear this
    // is not a live model call.
    console.warn('Live prediction failed, falling back to precomputed grid:', err);
    result = predictFromGridFallback(city, dateObj);
  } finally {
    predictBtn.disabled = false;
    predictBtn.textContent = 'Predict climate \u2197';
  }

  const pred = result.prediction;
  const risk = result.risk;

  const tMean = pred.Tavg_C.mean, tStd = pred.Tavg_C.std;
  document.getElementById('tempRange').textContent = `${(tMean - tStd).toFixed(1)}\u2013${(tMean + tStd).toFixed(1)}\u00b0C`;
  document.getElementById('cityDateLabel').textContent = `${city}, ${dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  if (pred.Tavg_C.historical_normal !== undefined) {
    const anomaly = pred.Tavg_C.anomaly;
    const sign = anomaly >= 0 ? '+' : '';
    document.getElementById('anomalyLabel').textContent =
      `Historical normal for this date: ${pred.Tavg_C.historical_normal.toFixed(1)}\u00b0C \u2192 anomaly: ${sign}${anomaly.toFixed(1)}\u00b0C`;
  } else {
    document.getElementById('anomalyLabel').textContent = '';
  }

  const rainMean = pred.Rainfall_mm.mean;
  const rainText = rainMean < 1 ? '~0 mm' : `${rainMean.toFixed(1)} mm`;
  document.getElementById('rainVal').textContent = pred.Rainfall_mm.rain_probability_pct !== undefined
    ? `${rainText} (${pred.Rainfall_mm.rain_probability_pct}% chance)`
    : rainText;
  const humMean = pred.Humidity_pct.mean, humStd = pred.Humidity_pct.std;
  document.getElementById('humVal').textContent = `${Math.round(humMean - humStd)}-${Math.round(humMean + humStd)}%`;
  document.getElementById('windVal').textContent = `${pred.WindSpeed_kmh.mean.toFixed(1)} km/h`;
  const horizon = risk.forecast_horizon_years;
  document.getElementById('yearsAheadVal').textContent = horizon !== undefined ? `${horizon} yrs` : `${risk.years_ahead ?? risk.yearsAhead} yrs`;

  renderRiskGauge('riskGauge', risk.score, risk.tier);

  const trainingExtrapolation = risk.training_extrapolation_years ?? risk.years_ahead ?? risk.yearsAhead ?? risk.trainingExtrapolationYears;
  let reason = risk.reason;
  if (!reason) {
    // offline-fallback path doesn't compute the full decomposed reason
    if (risk.tier === 'high') reason = `High risk: ${trainingExtrapolation} years beyond the model's training data plus historically high rainfall variability for ${city} around this date widen the uncertainty considerably.`;
    else if (risk.tier === 'moderate') reason = `Moderate risk: some combination of extrapolation distance and typical seasonal variability for ${city} on this date widens the expected range.`;
    else reason = `Normal: this date is close to the model's training data and historically stable for ${city}, so the expected range is fairly tight.`;
  }
  document.getElementById('riskReason').textContent = reason;

  const componentsEl = document.getElementById('riskComponents');
  if (risk.components) {
    const labels = { heat_risk: 'Heat', rainfall_risk: 'Rainfall', humidity_risk: 'Humidity', warming_risk: 'Long-term warming', reliability_risk: 'Model reliability' };
    componentsEl.innerHTML = Object.entries(risk.components).map(([k, v]) => {
      const pct = Math.round(v * 100);
      const isTop = k === risk.top_driver;
      return `<div style="margin-bottom:6px;">
        <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text3); margin-bottom:2px;">
          <span>${labels[k]}${isTop ? ' \u25c0' : ''}</span><span>${pct}%</span>
        </div>
        <span class="r2-bar-bg" style="display:block; height:6px;"><span class="r2-bar-fill" style="width:${pct}%; background:${isTop ? 'var(--high)' : 'var(--accent)'};"></span></span>
      </div>`;
    }).join('');
  } else {
    componentsEl.innerHTML = '<div class="note-box">Component breakdown needs the live backend -- not available in this offline preview.</div>';
  }

  const explainEl = document.getElementById('explainabilityList');
  if (pred.Tavg_C.explainability && pred.Tavg_C.explainability.length) {
    explainEl.innerHTML = pred.Tavg_C.explainability.map(f => `
      <div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:3px;"><span>${f.factor}</span><span style="font-weight:700;">${f.pct}%</span></div>
        <span class="r2-bar-bg" style="display:block; height:7px;"><span class="r2-bar-fill" style="width:${f.pct}%; background:var(--accent);"></span></span>
      </div>`).join('');
  } else {
    explainEl.innerHTML = '<div class="note-box">Explainability needs the live backend -- not available in this offline preview.</div>';
  }

  AppState.lastPrediction = { city, dateObj, dateStr, pred, risk };

  const doy = result.day_of_year ?? dayOfYear(dateObj);
  renderWindowChart(city, doy, dateObj.getFullYear());
  renderTrendChart(city, dateObj.getFullYear(), tMean);
  renderEvidenceChart(city, dateStr);
  renderForecastHorizons(city, dateObj);
  document.getElementById('predictorAiText').textContent = 'Run a prediction above, then generate an explanation for that specific forecast.';
}

// Shows the real recorded temperature on this same calendar day, every
// year on file for this city -- the "proof" behind the prediction. Needs
// the live backend (raw daily records aren't bundled client-side); shows
// a plain message instead of a chart if the backend is unreachable.
async function renderEvidenceChart(city, dateStr) {
  const noteEl = document.getElementById('evidenceNote');
  let data;
  try {
    data = await Api.evidence(city, dateStr);
  } catch (err) {
    destroyChart('evidence');
    const ctx = document.getElementById('evidenceChart').getContext('2d');
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    noteEl.textContent = 'Historical evidence needs the live backend running (see docs/README.md) -- not available in this offline preview.';
    return;
  }

  const rows = data.by_target.Tavg_C;
  const years = rows.map(r => r.year);
  const values = rows.map(r => r.value);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  destroyChart('evidence');
  AppState.charts.evidence = new Chart(document.getElementById('evidenceChart'), {
    type: 'bar',
    data: {
      labels: years,
      datasets: [{
        data: values,
        backgroundColor: years.map(y => y === new Date(dateStr).getFullYear() ? '#d97706' : '#2563ebaa'),
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { title: { display: true, text: '\u00b0C' }, grid: { color: themeColor('--chart-grid') } },
        x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 14 }, grid: { display: false } },
      },
    },
  });

  const monthDay = new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
  noteEl.textContent = `${data.years_on_record} years of real recorded temperature on ${monthDay} for ${city}, averaging ${avg.toFixed(1)}\u00b0C -- this is the actual historical basis the model's seasonal pattern is learned from, not a black-box guess.`;
}

// Client-side fallback matching the backend's math, used only if the
// Flask API can't be reached (e.g. dashboard opened as a static file
// without the backend running).
function predictFromGridFallback(city, dateObj) {
  const doy = Math.min(366, Math.max(1, dayOfYear(dateObj)));
  const year = dateObj.getFullYear();
  const grid = AppState.climatology[city];
  const idx = doy - 1;
  const pred = {};
  for (const target of Object.keys(TARGET_LABEL)) {
    const baseMean = grid.grid[target].mean[idx];
    const std = grid.grid[target].std[idx];
    const slope = grid.annual_trend_slope[target];
    let projMean = baseMean + slope * (year - grid.baseline_year);
    if (target === 'Rainfall_mm') projMean = Math.max(0, projMean);
    if (target === 'Humidity_pct') projMean = Math.min(100, Math.max(0, projMean));
    pred[target] = { mean: projMean, std };
  }
  const risk = riskScoreFromGrid(city, dateObj);
  return { prediction: pred, risk, day_of_year: doy };
}

// ---------------------------------------------------------------------------
// Forecast Horizons -- the same calendar day/month, viewed at three
// different distances into the future (near/medium/long-term), so it's
// clear this is a climatological outlook whose *confidence* changes with
// distance, not a day-specific weather forecast.
// ---------------------------------------------------------------------------
function horizonDateFor(baseDateObj, targetYear) {
  const month = baseDateObj.getMonth(); // 0-indexed
  const day = baseDateObj.getDate();
  const d = new Date(targetYear, month, day);
  if (d.getMonth() !== month) return new Date(targetYear, month, 28); // Feb 29 in a non-leap year
  return d;
}

async function predictForHorizon(city, dateObj) {
  const dateStr = dateObj.toISOString().slice(0, 10);
  try {
    return await Api.predict(city, dateStr);
  } catch (err) {
    return predictFromGridFallback(city, dateObj);
  }
}

async function renderForecastHorizons(city, selectedDateObj) {
  const container = document.getElementById('horizonCards');
  const subtext = document.getElementById('horizonSubtext');
  const md = selectedDateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
  if (subtext) subtext.textContent = `${md}, viewed at three different distances into the future \u2014 since this system projects climatological tendencies, not day-specific weather, horizon distance changes the confidence, not the method.`;

  container.innerHTML = Array(3).fill(0).map(() => `
    <div class="card horizon-card">
      <div class="skeleton" style="width:70px; height:11px; margin-bottom:10px;"></div>
      <div class="skeleton" style="width:100px; height:11px; margin-bottom:14px;"></div>
      <div class="skeleton" style="width:80px; height:24px; margin-bottom:8px;"></div>
      <div class="skeleton" style="width:130px; height:11px;"></div>
    </div>`).join('');

  const today = new Date();
  const thisYear = today.getFullYear();
  const nearYear = horizonDateFor(selectedDateObj, thisYear) > today ? thisYear : thisYear + 1;
  const horizons = [
    { label: 'Near-term', when: 'This year', date: horizonDateFor(selectedDateObj, nearYear) },
    { label: 'Medium-term', when: '+5 years', date: horizonDateFor(selectedDateObj, thisYear + 5) },
    { label: 'Long-term', when: '+20 years', date: horizonDateFor(selectedDateObj, thisYear + 20) },
  ];

  const results = await Promise.all(horizons.map(h => predictForHorizon(city, h.date)));

  container.innerHTML = horizons.map((h, i) => {
    const r = results[i];
    const t = r.prediction.Tavg_C;
    const anomalyText = t.anomaly !== undefined ? `${t.anomaly >= 0 ? '+' : ''}${t.anomaly.toFixed(1)}\u00b0C vs. historical normal` : 'vs. historical normal: n/a offline';
    return `
      <div class="card horizon-card">
        <div class="horizon-label">${h.label}</div>
        <div class="horizon-when">${h.when} \u2014 ${h.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        <div class="horizon-temp">${t.mean.toFixed(1)}\u00b0C</div>
        <div class="horizon-anomaly">${anomalyText}</div>
        <div class="horizon-tier"><span class="risk-badge ${r.risk.tier}">${r.risk.tier}</span></div>
      </div>`;
  }).join('');
}

function initPredictorPage() {
  populateSelectors();
  document.getElementById('predictBtn').addEventListener('click', runPrediction);
  document.getElementById('genPredictorInsightBtn').addEventListener('click', generatePredictorInsight);
  document.getElementById('downloadReportBtn').addEventListener('click', downloadPredictionReport);
  runPrediction();
}
