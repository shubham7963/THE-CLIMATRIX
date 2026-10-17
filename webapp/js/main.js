// ---------------------------------------------------------------------------
// App entry point. Loads climatology + performance data (from the live
// backend if reachable, otherwise from the bundled static copies in
// webapp/data/ so the dashboard still renders), then initializes
// navigation and all 3 pages.
// ---------------------------------------------------------------------------
async function loadData() {
  try {
    const h = await Api.health();
    AppState.backendOnline = true;
    AppState.totalRecords = h.total_records;
    AppState.dataEndDate = h.data_end_date; // real last date the dataset covers -- date pickers
                                              // must use this, not the browser clock, or they can
                                              // silently offer dates with no real data behind them
    const [climatology, performance] = await Promise.all([Api.climatology(), Api.performance()]);
    AppState.climatology = climatology;
    AppState.performance = performance;
  } catch (err) {
    console.warn('Backend API not reachable, loading bundled static data:', err);
    AppState.backendOnline = false;
    AppState.dataEndDate = null; // unknown offline -- backtest/history need the live backend anyway
    const [climatology, performance] = await Promise.all([
      fetch('data/climatology.json').then(r => r.json()),
      fetch('data/performance.json').then(r => r.json()),
    ]);
    AppState.climatology = climatology;
    AppState.performance = performance;
  }

  AppState.cities = Object.keys(AppState.climatology);
  AppState.cities.forEach((c, i) => { AppState.colors[c] = CITY_COLORS[i % CITY_COLORS.length]; });
  if (!AppState.totalRecords) {
    // Offline fallback estimate: ~34 years of daily data per city.
    AppState.totalRecords = AppState.cities.length * 34 * 365.25 | 0;
  }

  const banner = document.getElementById('apiStatusBanner');
  if (!AppState.backendOnline) banner.classList.add('show');

  const dot = document.getElementById('topbarStatusDot');
  const text = document.getElementById('topbarStatusText');
  if (AppState.backendOnline) {
    dot.className = 'status-dot online';
    text.textContent = `Live \u00b7 ${AppState.totalRecords.toLocaleString()} records`;
  } else {
    dot.className = 'status-dot offline';
    text.textContent = 'Offline preview';
  }
}

function initTopbarControls() {
  const citySel = document.getElementById('topbarCitySelect');
  citySel.innerHTML = AppState.cities.map(c => `<option value="${c}">${c}</option>`).join('');
  citySel.value = AppState.cities.includes('Delhi') ? 'Delhi' : AppState.cities[0];
  citySel.addEventListener('change', () => jumpToPredictor(citySel.value));

  document.getElementById('topbarDateText').textContent =
    new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const searchInput = document.getElementById('topbarSearchInput');
  const resultsEl = document.getElementById('topbarSearchResults');
  const searchIndex = [
    ...Object.entries(PAGE_TOPBAR_INFO).map(([key, v]) => ({ label: v.title, sub: v.subtitle, action: () => showPage(key) })),
    ...AppState.cities.map(c => ({ label: c, sub: 'Jump to Predictor for this city', action: () => jumpToPredictor(c) })),
  ];
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) { resultsEl.classList.remove('show'); return; }
    const matches = searchIndex.filter(i => i.label.toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) { resultsEl.classList.remove('show'); return; }
    resultsEl.innerHTML = matches.map((m, i) => `<div data-i="${i}"><b>${m.label}</b> &middot; <span style="color:var(--text3);">${m.sub}</span></div>`).join('');
    resultsEl.classList.add('show');
    resultsEl.querySelectorAll('div').forEach((el, i) => el.addEventListener('click', () => {
      matches[i].action(); searchInput.value = ''; resultsEl.classList.remove('show');
    }));
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.topbar-search')) resultsEl.classList.remove('show');
  });
}

function initTopbarBell() {
  const bell = document.getElementById('topbarBellBtn');
  const badge = document.getElementById('topbarBellBadge');
  const panel = document.getElementById('topbarBellPanel');

  // Real alerts: cities currently reading "high" risk one year out --
  // not fabricated notifications, actual computed data.
  const targetDate = new Date(); targetDate.setFullYear(targetDate.getFullYear() + 1);
  const highRiskCities = AppState.cities.filter(c => riskScoreFromGrid(c, targetDate).tier === 'high');

  if (highRiskCities.length) {
    badge.textContent = highRiskCities.length;
    badge.style.display = 'flex';
    panel.innerHTML = `<div class="bell-head">${highRiskCities.length} city alert${highRiskCities.length > 1 ? 's' : ''}</div>` +
      highRiskCities.map(c => `<div class="bell-item">&#9888; <span><b>${c}</b> is reading high risk for the year ahead. <a onclick="jumpToPredictor('${c}')" style="color:var(--accent); cursor:pointer; font-weight:600;">View</a></span></div>`).join('');
  } else {
    badge.style.display = 'none';
    panel.innerHTML = `<div class="bell-head">Notifications</div><div class="bell-empty">No high-risk alerts right now.</div>`;
  }

  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    bell.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.topbar-bell')) bell.classList.remove('open');
  });
}

function safeInit(fn, label) {
  try { fn(); } catch (err) { console.error(`[init] ${label} page failed to initialize:`, err); }
}

async function initApp() {
  initThemeToggle();
  await loadData();
  initNavigation();
  initSubtabs();
  initTopbarControls();
  initTopbarBell();
  // Each page's init is isolated: if one throws (e.g. a chart/map library failed to
  // load), it's logged and skipped rather than aborting every page after it.
  safeInit(initHomePage, 'home');
  safeInit(initOverviewPage, 'overview');
  safeInit(initPredictorPage, 'predictor');
  safeInit(initAnalyticsPage, 'analytics');
  safeInit(initBacktestPage, 'backtest');
  safeInit(initComparePage, 'compare');
  safeInit(initDisasterPage, 'disaster');
  safeInit(initPlanningPage, 'planning');   // renders into the (initially hidden) Urban Planning sub-tab; initSubtabs() re-renders it when that sub-tab is opened
  safeInit(initReportsPage, 'reports');
  safeInit(initBulletinPage, 'bulletin');   // populates the Climate Bulletin section merged into Executive Overview
  safeInit(initApiDataPage, 'apidata');
  safeInit(initFaqPage, 'faq');             // populates the Glossary & FAQ sections merged into About & Methodology
}

initApp();
