// ---------------------------------------------------------------------------
// Dark / light theme toggle. Charts (Chart.js) read grid/text colors from
// getComputedStyle at render time via themeColor(), so switching themes and
// re-rendering the currently visible page's charts picks up the new colors
// without a full reload.
// ---------------------------------------------------------------------------
function themeColor(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('themeToggleIcon');
  const btn = document.getElementById('themeToggleBtn');
  if (theme === 'dark') { icon.textContent = '\u2600'; btn.title = 'Switch to light mode'; }
  else { icon.textContent = '\u263D'; btn.title = 'Switch to dark mode'; }
  try { localStorage.setItem('cfdsras_theme', theme); } catch (e) { /* ignore */ }
  // Chart.js global text/gridline defaults -- covers legend labels, tick
  // labels, and axis titles on every chart without editing each one.
  if (window.Chart) {
    Chart.defaults.color = themeColor('--chart-text');
    Chart.defaults.borderColor = themeColor('--chart-grid');
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.plugins.tooltip.backgroundColor = theme === 'dark' ? 'rgba(15,28,25,0.95)' : 'rgba(8,47,42,0.95)';
    Chart.defaults.plugins.tooltip.titleColor = '#fff';
    Chart.defaults.plugins.tooltip.bodyColor = '#eaf5f1';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.titleFont = { weight: '700', size: 12.5 };
    Chart.defaults.plugins.tooltip.bodyFont = { size: 12 };
    Chart.defaults.plugins.tooltip.displayColors = true;
    Chart.defaults.plugins.tooltip.boxPadding = 4;
  }
}

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

// Re-renders whichever charts belong to the currently active page, so a
// theme switch is visible immediately instead of only on next navigation.
function refreshVisibleCharts() {
  const activePage = document.querySelector('.nav-item.active');
  if (!activePage) return;
  const page = activePage.dataset.page;
  try {
    if (page === 'overview') {
      renderRiskMap(); renderMultiCityTempChart(); renderCityRainBarChart();
    } else if (page === 'predictor') {
      runPrediction(); // re-reads current selector values, re-renders charts with new theme colors
    } else if (page === 'compare') {
      renderCompareTempChart(); renderExplorerChart();
    }
    // analytics page is table/KPI only (CSS-driven, no Chart.js canvas) -- updates automatically
  } catch (e) { console.warn('Chart refresh on theme switch skipped a page:', e); }
}

function initThemeToggle() {
  let saved = 'light';
  try { saved = localStorage.getItem('cfdsras_theme') || 'light'; } catch (e) { /* ignore */ }
  applyTheme(saved);

  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    refreshVisibleCharts();
  });
}
