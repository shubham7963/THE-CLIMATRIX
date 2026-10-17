// ---------------------------------------------------------------------------
// Shared application state. Loaded once at startup by main.js and read by
// the page modules (overview.js, predictor.js, analytics.js, charts.js).
// This is what lets the 3 pages behave like one connected system: a city
// picked on the Overview map carries straight into the Predictor.
// ---------------------------------------------------------------------------
const AppState = {
  climatology: null,   // { CityName: { lat, lon, baseline_year, grid, annual_trend_slope, annual_series } }
  performance: null,   // [{ City, Target, MAE, R2 }, ...]
  cities: [],
  colors: {},
  charts: {},
  leafletMap: null,   // Leaflet map instance for the Overview risk map
  totalRecords: 0,
  lastPrediction: null, // { city, dateObj, prediction: {...}, risk: {...} }
  backendOnline: false,
};

const CITY_COLORS = ['#2563eb', '#d97706', '#7c3aed', '#e11d48', '#0d9488', '#65a30d', '#c026d3', '#78716c'];
const TRAIN_END_YEAR = 2018; // must match backend/app.py -- last year the production models actually trained on
const TARGET_LABEL = { Tavg_C: 'Temperature', Rainfall_mm: 'Rainfall', Humidity_pct: 'Humidity', WindSpeed_kmh: 'Wind speed' };
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function destroyChart(key) {
  if (AppState.charts[key]) { AppState.charts[key].destroy(); delete AppState.charts[key]; }
}
