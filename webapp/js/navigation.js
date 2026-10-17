// ---------------------------------------------------------------------------
// Navigation between the 3 interconnected pages.
// ---------------------------------------------------------------------------
// Chart.js reads its container's size at creation time. Every page's charts
// were originally built once at startup while only Home was visible, so any
// chart on a page other than Home would render into a zero-size (hidden)
// container and stay blank forever -- ResizeObserver doesn't reliably catch
// a display:none -> block transition. Re-running each page's init function
// on navigation guarantees the container is actually visible when Chart.js
// measures it. All init*Page() functions are idempotent (safe to re-run).
const PAGE_INIT_FNS = {
  home: () => initHomePage(),
  overview: () => initOverviewPage(),
  predictor: () => runPrediction(),
  analytics: () => initAnalyticsPage(),
  compare: () => initComparePage(),
  disaster: () => initDisasterPage(), // the visible sub-tab defaults to disaster-tab; planning-tab is handled by initSubtabs()
  apidata: () => initApiDataPage(),
};

const PAGE_TOPBAR_INFO = {
  home: { title: 'Home', subtitle: 'Climate risk intelligence for 8 Indian cities' },
  overview: { title: 'Risk Assessment', subtitle: 'National snapshot & live risk map' },
  predictor: { title: 'Forecast & Prediction', subtitle: 'Live model inference for any city and date' },
  analytics: { title: 'Climate Analytics', subtitle: 'Performance, comparison, and methodology' },
  backtest: { title: 'Model Performance', subtitle: 'Blind predictions tested against real recorded history' },
  compare: { title: 'City Comparison', subtitle: 'Side-by-side cities and the historical record' },
  disaster: { title: 'Disaster Insights', subtitle: '12-month risk outlook and 30-year warming trends' },
  reports: { title: 'Reports & Downloads', subtitle: 'Monthly PDF reports and raw data exports' },
  apidata: { title: 'Data Explorer', subtitle: 'Pipeline, dataset quality, and developer endpoints' },
  about: { title: 'About & Methodology', subtitle: 'How this system works, and where it falls short' },
};

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); n.removeAttribute('aria-current'); });
  const pageEl = document.getElementById('page-' + name);
  const navEl = document.querySelector(`.nav-item[data-page="${name}"]`);
  pageEl.classList.add('active');
  navEl.classList.add('active');
  navEl.setAttribute('aria-current', 'page');
  const info = PAGE_TOPBAR_INFO[name];
  if (info) {
    document.getElementById('topbarTitle').textContent = info.title;
    document.getElementById('topbarSubtitle').textContent = info.subtitle;
  }
  // Guarded: if a page's re-init throws (e.g. a chart/map library issue), the page
  // switch itself (active classes, topbar, focus) still completes normally, and
  // whatever runs after showPage() in the caller (like closing the mobile menu) still runs.
  if (PAGE_INIT_FNS[name]) {
    try { PAGE_INIT_FNS[name](); } catch (err) { console.error(`[showPage] ${name} re-init failed:`, err); }
  }
  // Move focus to the new page's main heading so keyboard/screen-reader
  // users land somewhere meaningful instead of staying on the nav item.
  const heading = pageEl.querySelector('h1, h2');
  if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: false }); }
}

function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(n => {
    n.setAttribute('tabindex', '0');
    n.setAttribute('role', 'button');
    n.addEventListener('click', () => { showPage(n.dataset.page); closeMobileSidebar(); });
    n.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showPage(n.dataset.page); closeMobileSidebar(); }
    });
  });
  initMobileMenu();
}

function openMobileSidebar() {
  document.getElementById('sidebarNav').classList.add('open');
  document.getElementById('sidebarBackdrop').classList.add('show');
}
function closeMobileSidebar() {
  document.getElementById('sidebarNav').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('show');
}
function initMobileMenu() {
  document.getElementById('topbarHamburgerBtn').addEventListener('click', openMobileSidebar);
  document.getElementById('sidebarBackdrop').addEventListener('click', closeMobileSidebar);
}

// Sub-tabs within a single page (e.g. Disaster Preparedness / Urban
// Planning share one nav item). Chart.js can't size a canvas correctly
// while its container is display:none, so switching sub-tabs re-runs that
// panel's init function once it's visible again.
const SUBTAB_RENDER_FNS = { 'disaster-tab': () => initDisasterPage(), 'planning-tab': () => initPlanningPage() };

function initSubtabs() {
  document.querySelectorAll('.subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.subtab;
      const row = btn.closest('.subtab-row').parentElement;
      row.querySelectorAll('.subtab').forEach(b => b.classList.remove('active'));
      row.querySelectorAll('.subtab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(target).classList.add('active');
      if (SUBTAB_RENDER_FNS[target]) SUBTAB_RENDER_FNS[target]();
    });
  });
}

// Used by the Overview risk map / risk list to jump into the Predictor
// with a city pre-selected -- this is the "shared state across pages"
// behavior described in the docs.
function jumpToPredictor(city) {
  document.getElementById('citySelect').value = city;
  showPage('predictor');
  runPrediction();
}
