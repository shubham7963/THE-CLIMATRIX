// ---------------------------------------------------------------------------
// Data & API Access page -- static documentation, generated once from a
// list of known endpoints so it's easy to keep in sync with backend/app.py.
// ---------------------------------------------------------------------------
const API_ENDPOINTS = [
  { path: '/api/health', desc: 'Backend status, loaded model count, total training records.' },
  { path: '/api/cities', desc: 'List of all monitored cities with coordinates.' },
  { path: '/api/predict?city=&date=', desc: 'Live model prediction for a city and date (temperature, rainfall probability & amount, humidity, wind, risk tier).' },
  { path: '/api/climatology', desc: 'Full precomputed climatology grid for all cities (day-of-year mean/std, annual series, warming trend).' },
  { path: '/api/climatology/<city>', desc: 'Climatology grid for a single city.' },
  { path: '/api/performance', desc: 'Model performance (R\u00b2, MAE) per city and target.' },
  { path: '/api/history?city=&target=&start=&end=', desc: 'Real recorded historical values for a date range (daily or monthly-aggregated).' },
  { path: '/api/evidence?city=&date=', desc: 'Real recorded values on the same calendar day across every year on file.' },
  { path: '/api/backtest?city=&date=', desc: 'Predicts a past date blind and compares against the actual recorded value.' },
  { path: '/api/backtest_series?city=', desc: 'Runs the backtest across 24 held-out dates (one per quarter since 2019) for a consistency check.' },
  { path: '/api/data-quality', desc: 'Computed dataset quality stats: record count, missing values, duplicates, variables.' },
  { path: '/api/insight/summary', desc: 'Rule-based natural-language national summary.' },
  { path: '/api/insight/prediction?city=&date=', desc: 'Rule-based natural-language explanation for a specific prediction.' },
  { path: '/api/download/<dataset|performance|comparison>', desc: 'Raw CSV file downloads.' },
];

async function initApiDataPage() {
  document.getElementById('apiEndpointTableBody').innerHTML = API_ENDPOINTS.map(e => `
    <tr><td><code>${e.path}</code></td><td>${e.desc}</td></tr>
  `).join('');

  const origin = window.location.origin;
  document.getElementById('apiExampleBlock').textContent =
`curl "${origin}/api/predict?city=Delhi&date=2028-07-15"

{
  "city": "Delhi",
  "date": "2028-07-15",
  "prediction": {
    "Tavg_C": { "mean": 31.9, "std": 1.3, "historical_normal": 31.2, "anomaly": 0.7 },
    "Rainfall_mm": { "mean": 6.3, "rain_probability_pct": 64.4, "amount_if_rain_mm": 9.8 },
    "Humidity_pct": { "mean": 64.1, "std": 6.3 },
    "WindSpeed_kmh": { "mean": 11.2, "std": 1.9 }
  },
  "risk": { "tier": "normal", "score": 0.31, "top_driver": "reliability_risk" }
}`;

  const kpiEl = document.getElementById('dataQualityKpis');
  const varsEl = document.getElementById('dataQualityVariables');
  try {
    const dq = await Api.dataQuality();
    kpiEl.innerHTML = `
      <div class="kpi"><div class="k-label">Total records</div><div class="k-value" data-final="${dq.total_records.toLocaleString()}">0</div><div class="k-note">${dq.date_range.start_year}\u2013${dq.date_range.end_year}</div></div>
      <div class="kpi"><div class="k-label">Cities</div><div class="k-value" data-final="${dq.city_count}">0</div><div class="k-note">Indian cities monitored</div></div>
      <div class="kpi"><div class="k-label">Missing values</div><div class="k-value" data-final="${dq.missing_values}">0</div><div class="k-note">out of ${(dq.total_records * dq.variable_count).toLocaleString()} cells</div></div>
      <div class="kpi"><div class="k-label">Duplicate rows</div><div class="k-value" data-final="${dq.duplicate_rows}">0</div><div class="k-note">${dq.variable_count} variables total</div></div>
    `;
    animateCounters(kpiEl);
    varsEl.textContent = dq.variables.join(', ');
  } catch (err) {
    kpiEl.innerHTML = `<div class="note-box" style="grid-column:1/-1;">Live data-quality stats need the backend running -- not available in this offline preview. Last known values: 105,192 records, 8 cities, 1991\u20132026, 0 missing, 0 duplicates.</div>`;
    varsEl.textContent = 'City, Latitude, Longitude, Year, Month, Day, DayOfYear, Tmax_C, Tmin_C, Tavg_C, Rainfall_mm, Humidity_pct, WindSpeed_kmh';
  }
}
