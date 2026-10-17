// ---------------------------------------------------------------------------
// Home / landing page -- entry point before the analytical dashboard.
// Shows live city-specific quick stats (temperature, rainfall, humidity,
// wind, overall risk) for whichever city is selected in the header, with
// each value's anomaly vs. the historical normal for that date.
// ---------------------------------------------------------------------------
const HOME_STAT_ICONS = {
  temp: '<svg viewBox="0 0 24 24"><path d="M14 14.76V3.5a2 2 0 0 0-4 0v11.26a4 4 0 1 0 4 0z"/></svg>',
  rain: '<svg viewBox="0 0 24 24"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"/><path d="M8 19v2"/><path d="M12 19v2"/><path d="M16 19v2"/></svg>',
  humidity: '<svg viewBox="0 0 24 24"><path d="M12 2.7s6 6.5 6 10.8a6 6 0 0 1-12 0c0-4.3 6-10.8 6-10.8z"/></svg>',
  wind: '<svg viewBox="0 0 24 24"><path d="M3 8h9a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 12h13a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 16h7a2 2 0 1 1-2 2"/></svg>',
  risk: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z"/><path d="M12 8v5"/><circle cx="12" cy="16" r="0.6" fill="currentColor"/></svg>',
};

function miniSparkline(values, color) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const w = 56, h = 22;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" width="56" height="22" class="home-stat-sparkline"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// A real (not fabricated) "recent trend" line: the historical seasonal
// average for the 14 days on either side of the target date, from the
// city's actual climatology grid.
function seasonalWindowSeries(city, target, doy) {
  const meanArr = AppState.climatology[city].grid[target].mean;
  const window = [];
  for (let offset = -14; offset <= 14; offset += 2) {
    let idx = ((doy - 1 + offset) % 366 + 366) % 366;
    window.push(meanArr[idx]);
  }
  return window;
}

function homeStatCard(iconKey, label, value, deltaText, deltaUp, iconBg, iconColor, sparklineSvg) {
  const arrow = deltaUp === null ? '' : deltaUp
    ? `<svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" fill="none" stroke-width="2.5"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>`
    : `<svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" fill="none" stroke-width="2.5"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg>`;
  const deltaClass = deltaUp === null ? '' : deltaUp ? 'delta-up' : 'delta-down';
  return `
    <div class="home-stat-card">
      <div class="home-stat-icon" style="background:${iconBg}; color:${iconColor};">${HOME_STAT_ICONS[iconKey]}</div>
      <div class="home-stat-body">
        <div class="home-stat-label">${label}</div>
        <div class="home-stat-value">${value}</div>
        ${deltaText ? `<div class="home-stat-delta ${deltaClass}">${arrow} ${deltaText}</div>` : ''}
      </div>
      ${sparklineSvg ? `<div class="home-stat-spark">${sparklineSvg}</div>` : ''}
    </div>`;
}

async function renderHomeQuickStats(city) {
  const container = document.getElementById('homeKpis');
  container.innerHTML = Array(5).fill(0).map(() => `
    <div class="home-stat-card"><div class="skeleton" style="width:36px; height:36px; border-radius:10px;"></div>
      <div class="home-stat-body"><div class="skeleton" style="width:60px; height:10px; margin-bottom:8px;"></div>
      <div class="skeleton" style="width:70px; height:20px;"></div></div></div>`).join('');

  const nearDate = new Date(); nearDate.setDate(nearDate.getDate() + 2); // nearest valid future date
  let result;
  try { result = await Api.predict(city, nearDate.toISOString().slice(0, 10)); }
  catch (err) { result = predictFromGridFallback(city, nearDate); }

  const p = result.prediction, r = result.risk;
  const anomPct = (target, digits = 0) => {
    const a = p[target].anomaly;
    if (a === undefined) return { text: '', up: null };
    const base = p[target].mean - a;
    const pct = base !== 0 ? Math.abs((a / base) * 100) : 0;
    return { text: `${pct.toFixed(digits)}${digits ? '' : '%'} vs. historical normal`, up: a >= 0 };
  };
  const tempA = p.Tavg_C.anomaly !== undefined ? { text: `${Math.abs(p.Tavg_C.anomaly).toFixed(1)}\u00b0C vs. historical normal`, up: p.Tavg_C.anomaly >= 0 } : { text: '', up: null };
  const rainA = anomPct('Rainfall_mm');
  const humA = anomPct('Humidity_pct');
  const windA = anomPct('WindSpeed_kmh');
  const riskScore100 = Math.round(r.score * 100);
  const riskColor = r.tier === 'high' ? 'var(--high)' : r.tier === 'moderate' ? 'var(--moderate)' : 'var(--normal)';
  const riskBg = r.tier === 'high' ? 'var(--high-soft)' : r.tier === 'moderate' ? 'var(--moderate-soft)' : 'var(--normal-soft)';

  const doy = result.day_of_year ?? dayOfYear(nearDate);
  const sparkFor = (target, color) => miniSparkline(seasonalWindowSeries(city, target, doy), color);

  container.innerHTML =
    homeStatCard('temp', 'Temperature', `${p.Tavg_C.mean.toFixed(1)}\u00b0C`, tempA.text, tempA.up, '#fee2e2', '#dc2626', sparkFor('Tavg_C', '#dc2626')) +
    homeStatCard('rain', 'Rainfall', `${p.Rainfall_mm.mean.toFixed(1)} mm`, rainA.text, rainA.up, '#dbeafe', '#2563eb', sparkFor('Rainfall_mm', '#2563eb')) +
    homeStatCard('humidity', 'Humidity', `${p.Humidity_pct.mean.toFixed(0)}%`, humA.text, humA.up, '#dbeafe', '#0891b2', sparkFor('Humidity_pct', '#0891b2')) +
    homeStatCard('wind', 'Wind Speed', `${p.WindSpeed_kmh.mean.toFixed(1)} km/h`, windA.text, windA.up, '#ede9fe', '#7c3aed', sparkFor('WindSpeed_kmh', '#7c3aed')) +
    homeStatCard('risk', 'Overall Risk', `<span style="color:${riskColor};">${r.tier.charAt(0).toUpperCase() + r.tier.slice(1)}</span> &middot; ${riskScore100}/100`, '', null, riskBg, riskColor, '');

  renderHomeParamCards(p);
  renderHomeInsights(city, p, r);
}

function renderHomeParamCards(p) {
  const el = document.getElementById('homeParamCards');
  if (!el) return;
  const cards = [
    { label: 'Temperature', value: `${p.Tavg_C.mean.toFixed(1)}\u00b0C`, anomaly: p.Tavg_C.anomaly, bg: '#fee2e2', fg: '#dc2626' },
    { label: 'Rainfall', value: p.Rainfall_mm.mean < 1 ? '~0 mm' : `${p.Rainfall_mm.mean.toFixed(1)} mm`, anomaly: p.Rainfall_mm.anomaly, bg: '#dbeafe', fg: '#2563eb' },
    { label: 'Humidity', value: `${p.Humidity_pct.mean.toFixed(0)}%`, anomaly: p.Humidity_pct.anomaly, bg: '#dcfce7', fg: '#16a34a' },
    { label: 'Wind Speed', value: `${p.WindSpeed_kmh.mean.toFixed(1)} km/h`, anomaly: p.WindSpeed_kmh.anomaly, bg: '#ede9fe', fg: '#7c3aed' },
  ];
  el.innerHTML = cards.map(c => {
    const deltaText = c.anomaly !== undefined
      ? `${c.anomaly >= 0 ? '\u25b2' : '\u25bc'} ${Math.abs(c.anomaly).toFixed(1)} vs. normal`
      : '';
    const deltaColor = c.anomaly >= 0 ? 'var(--high)' : 'var(--normal)';
    return `<div class="home-param-card" style="background:${c.bg};">
      <div class="hp-label" style="color:${c.fg};">${c.label}</div>
      <div class="hp-value" style="color:${c.fg};">${c.value}</div>
      ${deltaText ? `<div class="hp-delta" style="color:${deltaColor};">${deltaText}</div>` : ''}
    </div>`;
  }).join('');
}

function renderHomeInsights(city, p, r) {
  const el = document.getElementById('homeInsightsList');
  if (!el) return;
  const warmingPerDecade = AppState.climatology[city].annual_trend_slope.Tavg_C * 10;
  const icons = {
    temp: '<svg viewBox="0 0 24 24"><path d="M14 14.76V3.5a2 2 0 0 0-4 0v11.26a4 4 0 1 0 4 0z"/></svg>',
    trend: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
    risk: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z"/></svg>',
  };
  const items = [
    { icon: 'temp', text: `${city}'s temperature for the selected date is projected at ${p.Tavg_C.mean.toFixed(1)}\u00b0C, ${Math.abs(p.Tavg_C.anomaly).toFixed(1)}\u00b0C ${p.Tavg_C.anomaly >= 0 ? 'above' : 'below'} the historical normal.` },
    { icon: 'trend', text: `Long-term warming trend for ${city}: +${warmingPerDecade.toFixed(2)}\u00b0C per decade.` },
    { icon: 'risk', text: `Overall climate risk is currently <b>${r.tier}</b>, primarily driven by ${r.top_driver ? r.top_driver.replace('_', ' ') : 'seasonal variability'}.` },
  ];
  el.innerHTML = items.map(i => `
    <div class="home-insight-item">
      <div class="home-insight-icon">${icons[i.icon]}</div>
      <div class="home-insight-text">${i.text}</div>
    </div>`).join('');
}

// Normalized (lon,lat)->(x,y) positions for the mini-map, computed from each
// city's real coordinates against India's approximate bounding box -- not a
// precise projection, but geographically sensible for a small overview widget.
const CITY_MAP_POS = {
  Mumbai: [50, 210], Bangalore: [99, 282], Jaipur: [81, 118], Delhi: [94, 97],
  Hyderabad: [108, 230], Kanpur: [128, 124], Nagpur: [115, 186], 'Chhatrapati Sambhajinagar': [76, 201],
};

function renderHomeMiniMap(selectedCity) {
  const svg = document.getElementById('homeMiniMap');
  const dots = AppState.cities.map(c => {
    const pos = CITY_MAP_POS[c] || [150, 170];
    const isSelected = c === selectedCity;
    const color = AppState.colors[c] || '#2563eb';
    return `<g class="mini-map-dot" data-city="${c}" tabindex="0" role="button" aria-label="${c}">
      ${isSelected ? `<circle cx="${pos[0]}" cy="${pos[1]}" r="11" fill="${color}" opacity="0.18"/>` : ''}
      <circle cx="${pos[0]}" cy="${pos[1]}" r="${isSelected ? 6 : 4.5}" fill="${isSelected ? color : 'var(--text3)'}" stroke="var(--surface)" stroke-width="1.5"/>
      <text class="mini-map-label" x="${pos[0] + 9}" y="${pos[1] + 3}">${c}</text>
    </g>`;
  }).join('');
  svg.innerHTML = dots;
  svg.querySelectorAll('.mini-map-dot').forEach(el => {
    const go = () => { document.getElementById('homeMapCitySelect').value = el.dataset.city; renderHomeCityWidgets(el.dataset.city); };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

async function renderHomeForecastChart(city, years) {
  const grid = AppState.climatology[city];
  const slope = grid.annual_trend_slope.Tavg_C;
  const baseline = grid.baseline_year;
  const baseTemp = Object.values(grid.annual_series).slice(-5).reduce((s, y) => s + y.avg_temp, 0) / 5;
  const labels = [], predicted = [], historicalNormal = [], upper = [], lower = [];
  for (let i = 0; i <= years; i++) {
    const year = new Date().getFullYear() + i;
    labels.push(year);
    const proj = baseTemp + slope * (year - baseline);
    predicted.push(Math.round(proj * 10) / 10);
    historicalNormal.push(Math.round(baseTemp * 10) / 10);
    upper.push(Math.round((proj + 1.5) * 10) / 10);
    lower.push(Math.round((proj - 1.5) * 10) / 10);
  }
  destroyChart('homeForecast');
  AppState.charts.homeForecast = new Chart(document.getElementById('homeForecastChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { type: 'line', label: 'Upper', data: upper, borderWidth: 0, pointRadius: 0, fill: '+1', backgroundColor: themeColor('--accent-soft') },
        { type: 'line', label: 'Lower', data: lower, borderWidth: 0, pointRadius: 0, fill: false },
        { type: 'line', label: 'Predicted Mean', data: predicted, borderColor: themeColor('--accent'), backgroundColor: themeColor('--accent'), borderWidth: 2.5, pointRadius: 3, tension: 0.25 },
        { type: 'line', label: 'Historical Normal', data: historicalNormal, borderColor: themeColor('--text3'), borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 9, font: { size: 10 }, filter: (item) => item.text !== 'Upper' && item.text !== 'Lower' } },
        tooltip: { filter: (item) => item.dataset.label === 'Predicted Mean' || item.dataset.label === 'Historical Normal',
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}\u00b0C` } },
      },
      scales: {
        y: { title: { display: true, text: '\u00b0C' }, grid: { color: themeColor('--chart-grid') } },
        x: { grid: { display: false } },
      },
    },
  });
}

async function renderHomeRiskIndex(city) {
  const nearDate = new Date(); nearDate.setDate(nearDate.getDate() + 2);
  let result;
  try { result = await Api.predict(city, nearDate.toISOString().slice(0, 10)); }
  catch (err) { result = predictFromGridFallback(city, nearDate); }
  const risk = result.risk;
  renderRiskGauge('homeRiskGauge', risk.score, risk.tier);

  const componentsEl = document.getElementById('homeRiskComponents');
  if (risk.components) {
    const labels = { heat_risk: 'Heat Risk', rainfall_risk: 'Rainfall Risk', humidity_risk: 'Humidity Risk', warming_risk: 'Warming Risk', reliability_risk: 'Reliability Risk' };
    componentsEl.innerHTML = Object.entries(risk.components).map(([k, v]) => {
      const pct = Math.round(v * 100);
      const isTop = k === risk.top_driver;
      return `<div style="margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; font-size:11.5px; color:var(--text2); margin-bottom:3px;">
          <span>${labels[k]}${isTop ? ' \u25c0' : ''}</span><span style="font-weight:700;">${pct}</span>
        </div>
        <span class="r2-bar-bg" style="display:block; height:6px; width:100%;"><span class="r2-bar-fill" style="width:${pct}%; background:${isTop ? 'var(--high)' : 'var(--accent)'};"></span></span>
      </div>`;
    }).join('');
  } else {
    componentsEl.innerHTML = '<div class="note-box">Component breakdown needs the live backend -- not available in this offline preview.</div>';
  }
}

function renderHomeCityWidgets(city) {
  renderHomeMiniMap(city);
  const years = parseInt(document.getElementById('homeForecastYearsSelect').value, 10);
  renderHomeForecastChart(city, years);
  renderHomeRiskIndex(city);
}

function initHomePage() {
  const city = document.getElementById('topbarCitySelect')?.value || AppState.cities[0];
  renderHomeQuickStats(city);
  renderHomeCityWidgets(city);

  if (!initHomePage._wired) {
    const mapCitySel = document.getElementById('homeMapCitySelect');
    AppState.cities.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; mapCitySel.appendChild(o); });
    mapCitySel.value = city;
    mapCitySel.addEventListener('change', () => renderHomeCityWidgets(mapCitySel.value));
    document.getElementById('homeForecastYearsSelect').addEventListener('change', () => renderHomeCityWidgets(mapCitySel.value));

    // role-cards use inline onclick for simplicity; make them keyboard-
    // reachable too instead of being mouse-only.
    document.querySelectorAll('.role-card').forEach(card => {
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
      });
    });
    // Keep Home's stats in sync if the user switches the header city selector.
    document.getElementById('topbarCitySelect')?.addEventListener('change', (e) => {
      if (document.getElementById('page-home').classList.contains('active')) {
        renderHomeQuickStats(e.target.value);
        document.getElementById('homeMapCitySelect').value = e.target.value;
        renderHomeCityWidgets(e.target.value);
      }
    });
    initHomePage._wired = true;
  }
}
