// ---------------------------------------------------------------------------
// API client -- all calls to the Flask backend that serves live model
// inference, precomputed climatology data, and the rule-based insight
// engine. Centralizing fetches here keeps the rest of the app backend-
// agnostic.
// ---------------------------------------------------------------------------
const API_BASE = ''; // same-origin: backend serves this webapp directly

const Api = {
  async health() {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) throw new Error('backend unreachable');
    return res.json();
  },

  async cities() {
    const res = await fetch(`${API_BASE}/api/cities`);
    return res.json();
  },

  async climatology() {
    const res = await fetch(`${API_BASE}/api/climatology`);
    return res.json();
  },

  async performance() {
    const res = await fetch(`${API_BASE}/api/performance`);
    return res.json();
  },

  // Live Random Forest model inference for one city + future date.
  async predict(city, dateStr) {
    const url = `${API_BASE}/api/predict?city=${encodeURIComponent(city)}&date=${encodeURIComponent(dateStr)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'prediction request failed');
    }
    return res.json();
  },

  async insightSummary() {
    const res = await fetch(`${API_BASE}/api/insight/summary`);
    if (!res.ok) throw new Error('insight summary request failed');
    return res.json();
  },

  async insightPrediction(city, dateStr) {
    const url = `${API_BASE}/api/insight/prediction?city=${encodeURIComponent(city)}&date=${encodeURIComponent(dateStr)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('insight prediction request failed');
    return res.json();
  },

  // Real historical data (not model output) for a city/target/date-range --
  // powers the Historical Trends Explorer.
  async history(city, target, start, end) {
    const url = `${API_BASE}/api/history?city=${encodeURIComponent(city)}&target=${encodeURIComponent(target)}&start=${start}&end=${end}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'history request failed');
    }
    return res.json();
  },

  // What a prediction is based on: real recorded values on this same
  // calendar day across every year on file, for all 4 targets.
  async evidence(city, dateStr) {
    const url = `${API_BASE}/api/evidence?city=${encodeURIComponent(city)}&date=${encodeURIComponent(dateStr)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('evidence request failed');
    return res.json();
  },

  // Proof of accuracy: predicts a PAST date as if it were unknown, then
  // compares against what was actually recorded.
  async backtest(city, dateStr) {
    const url = `${API_BASE}/api/backtest?city=${encodeURIComponent(city)}&date=${encodeURIComponent(dateStr)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'backtest request failed');
    }
    return res.json();
  },

  async backtestSeries(city) {
    const url = `${API_BASE}/api/backtest_series?city=${encodeURIComponent(city)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'backtest series request failed');
    }
    return res.json();
  },

  async dataQuality() {
    const res = await fetch(`${API_BASE}/api/data-quality`);
    if (!res.ok) throw new Error('data quality request failed');
    return res.json();
  },
};
