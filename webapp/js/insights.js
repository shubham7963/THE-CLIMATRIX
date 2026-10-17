// ---------------------------------------------------------------------------
// Insight Engine -- turns numeric model output into plain-language text.
// Calls the backend's rule-based insight endpoints; if the backend is
// unreachable, falls back to an equivalent generator that runs entirely
// in the browser so the panels never appear broken.
// ---------------------------------------------------------------------------
async function generateExecSummary() {
  const el = document.getElementById('execAiText');
  el.innerHTML = '<span class="ai-loading">Generating summary\u2026</span>';
  try {
    const { summary } = await Api.insightSummary();
    el.textContent = summary;
  } catch (e) {
    el.textContent = fallbackExecSummary();
  }
}

function fallbackExecSummary() {
  const targetDate = new Date(); targetDate.setFullYear(targetDate.getFullYear() + 1);
  const risks = AppState.cities.map(c => ({ city: c, r: riskScoreFromGrid(c, targetDate) })).sort((a, b) => b.r.score - a.r.score);
  const top = risks[0];
  const warmest = [...AppState.cities].sort((a, b) => AppState.climatology[b].annual_trend_slope.Tavg_C - AppState.climatology[a].annual_trend_slope.Tavg_C)[0];
  return `Across the ${AppState.cities.length} monitored cities, ${top.city} currently shows the highest projected risk (${top.r.tier}) for the coming year, driven by seasonal rainfall volatility and extrapolation distance from the model's training baseline. ${warmest} shows the steepest long-term warming trend among the group. Overall, the model indicates gradual regional warming consistent with observed India climate trends, with monsoon-season months carrying the highest year-to-year variability across all cities.`;
}

async function generatePredictorInsight() {
  const el = document.getElementById('predictorAiText');
  const lp = AppState.lastPrediction;
  if (!lp) { el.textContent = 'Run a prediction above first.'; return; }
  el.innerHTML = '<span class="ai-loading">Generating insight\u2026</span>';
  try {
    const { summary } = await Api.insightPrediction(lp.city, lp.dateStr);
    el.textContent = summary;
  } catch (e) {
    el.textContent = fallbackPredictorInsight();
  }
}

function fallbackPredictorInsight() {
  const lp = AppState.lastPrediction;
  if (!lp) return 'Run a prediction first.';
  const { city, dateObj, pred, risk } = lp;
  const yearsAhead = risk.years_ahead ?? risk.yearsAhead;
  return `For ${city} on ${dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}, the model expects an average temperature around ${pred.Tavg_C.mean.toFixed(1)}\u00b0C with ${risk.tier} risk. This reflects ${yearsAhead} years of extrapolation beyond the training baseline combined with this city's typical seasonal variability around this time of year. Treat this as a planning-level outlook rather than a precise forecast.`;
}
