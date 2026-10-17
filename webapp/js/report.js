// ---------------------------------------------------------------------------
// Shared helper: trigger a browser download for a backend-served file
// (dataset / performance / comparison CSVs). Used by Reports and Data & API
// pages. Requires the live backend -- these are real files on disk, not
// something the offline fallback can serve.
// ---------------------------------------------------------------------------
function downloadServerFile(kind) {
  if (AppState.backendOnline === false) {
    toast('Downloads need the live backend running -- not available in this offline preview.', 'error');
    return;
  }
  window.open(`${API_BASE}/api/download/${kind}`, '_blank');
}

// ---------------------------------------------------------------------------
// Monthly climate report (Reports & Downloads page) -- built entirely from
// the client-side climatology grid, so it works even without a live
// backend (unlike the raw-file downloads above).
// ---------------------------------------------------------------------------
const MONTH_START_DOY = [1,32,60,91,121,152,182,213,244,274,305,335]; // non-leap approx, fine for a monthly summary

function monthlyStatsFor(city, month) {
  const grid = AppState.climatology[city].grid;
  const startDoy = MONTH_START_DOY[month - 1];
  const daysInMonth = month === 12 ? 366 - startDoy + 1 : MONTH_START_DOY[month] - startDoy;
  const avg = (arr) => {
    const slice = arr.slice(startDoy - 1, startDoy - 1 + daysInMonth);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  };
  const sum = (arr) => arr.slice(startDoy - 1, startDoy - 1 + daysInMonth).reduce((a, b) => a + b, 0);
  return {
    avgTemp: avg(grid.Tavg_C.mean),
    totalRain: sum(grid.Rainfall_mm.mean),
    avgHumidity: avg(grid.Humidity_pct.mean),
    avgWind: avg(grid.WindSpeed_kmh.mean),
  };
}

function downloadMonthlyReport() {
  if (!window.jspdf) { toast('PDF library did not load -- check your internet connection.', 'error'); return; }
  const city = document.getElementById('reportCitySelect').value;
  const month = parseInt(document.getElementById('reportMonthSelect').value, 10);
  const stats = monthlyStatsFor(city, month);
  const grid = AppState.climatology[city];
  const warmingPerDecade = grid.annual_trend_slope.Tavg_C * 10;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48; let y = margin;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('CFDS-RAS \u2014 Monthly Climate Report', margin, y); y += 22;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110);
  doc.text('CFDS-RAS \u00b7 Generated ' + new Date().toLocaleString('en-IN'), margin, y); y += 28;
  doc.setDrawColor(225); doc.line(margin, y, 547, y); y += 24;

  doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(`${city} \u2014 ${MONTH_NAMES[month - 1]} (typical, 1991\u20132026)`, margin, y); y += 24;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  [
    `Average temperature: ${stats.avgTemp.toFixed(1)} \u00b0C`,
    `Expected total rainfall: ${stats.totalRain.toFixed(0)} mm`,
    `Average humidity: ${stats.avgHumidity.toFixed(0)}%`,
    `Average wind speed: ${stats.avgWind.toFixed(1)} km/h`,
    `Long-term warming trend: +${warmingPerDecade.toFixed(2)} \u00b0C per decade`,
  ].forEach(line => { doc.text(line, margin, y); y += 18; });

  y += 14;
  doc.setDrawColor(225); doc.line(margin, y, 547, y); y += 20;
  doc.setFontSize(9); doc.setTextColor(140);
  const note = doc.splitTextToSize(
    'This is a climatological summary (typical conditions based on 34 years of data for this city and month), not a forecast for a specific date or year.',
    499
  );
  doc.text(note, margin, y);

  doc.save(`CFDSRAS_${city}_${MONTH_NAMES[month - 1]}_report.pdf`);
}

function initReportsPage() {
  const sel = document.getElementById('reportCitySelect');
  AppState.cities.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
  document.getElementById('reportMonthSelect').value = String(new Date().getMonth() + 1);
  document.getElementById('genMonthlyReportBtn').addEventListener('click', downloadMonthlyReport);
}
function downloadPredictionReport() {
  const lp = AppState.lastPrediction;
  if (!lp) { toast('Run a prediction first.', 'error'); return; }
  if (!window.jspdf) { toast('PDF library did not load -- check your internet connection.', 'error'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const { city, dateObj, pred, risk } = lp;
  const dateLabel = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const yearsAhead = risk.years_ahead ?? risk.yearsAhead;
  const margin = 48;
  let y = margin;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('CFDS-RAS \u2014 Climate Risk Report', margin, y); y += 22;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110);
  doc.text('CFDS-RAS \u00b7 Generated ' + new Date().toLocaleString('en-IN'), margin, y); y += 28;
  doc.setDrawColor(225); doc.line(margin, y, 547, y); y += 24;

  doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(`${city} \u2014 ${dateLabel}`, margin, y); y += 22;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  const tMean = pred.Tavg_C.mean, tStd = pred.Tavg_C.std;
  const lines = [
    `Expected temperature range: ${(tMean - tStd).toFixed(1)}\u2013${(tMean + tStd).toFixed(1)} \u00b0C`,
    `Humidity: ${Math.round(pred.Humidity_pct.mean - pred.Humidity_pct.std)}\u2013${Math.round(pred.Humidity_pct.mean + pred.Humidity_pct.std)}%`,
    `Wind speed: ${pred.WindSpeed_kmh.mean.toFixed(1)} km/h`,
    `Rainfall (expected): ${pred.Rainfall_mm.mean < 1 ? '~0 mm' : pred.Rainfall_mm.mean.toFixed(1) + ' mm'}`,
  ];
  if (pred.Rainfall_mm.rain_probability_pct !== undefined) {
    lines.push(`Chance of rain: ${pred.Rainfall_mm.rain_probability_pct}% (if it rains, expect ~${pred.Rainfall_mm.amount_if_rain_mm} mm)`);
  }
  lines.push(`Risk tier: ${risk.tier.toUpperCase()}`, `Years beyond model training baseline: ${yearsAhead}`);

  lines.forEach(line => { doc.text(line, margin, y); y += 18; });
  y += 10;

  doc.setDrawColor(225); doc.line(margin, y, 547, y); y += 20;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Risk reasoning', margin, y); y += 18;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  const reasonText = document.getElementById('riskReason').textContent || '';
  const wrapped = doc.splitTextToSize(reasonText, 499);
  doc.text(wrapped, margin, y); y += wrapped.length * 14 + 16;

  const aiText = document.getElementById('predictorAiText').textContent || '';
  if (aiText && !aiText.startsWith('Run a prediction')) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Generated insight', margin, y); y += 18;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
    const wrappedAi = doc.splitTextToSize(aiText, 499);
    doc.text(wrappedAi, margin, y); y += wrappedAi.length * 14 + 10;
  }

  doc.setFontSize(9); doc.setTextColor(140);
  doc.text('This is a planning-level climatological outlook, not a precise day-specific weather forecast.', margin, 780);

  doc.save(`CFDSRAS_${city}_${dateObj.toISOString().slice(0, 10)}.pdf`);
}
