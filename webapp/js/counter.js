// ---------------------------------------------------------------------------
// Animated KPI counters -- finds the first number inside a rendered string
// (e.g. "105,192", "+0.75\u00b0C", "64.4%") and animates it counting up from 0
// on load, while leaving any prefix/suffix text untouched. Generic by
// design so every KPI card across the site gets this for free just by
// calling animateCounters() after setting .k-value elements' data-final.
// ---------------------------------------------------------------------------
function animateCounters(root = document) {
  const els = root.querySelectorAll('[data-final]');
  els.forEach(el => {
    const final = el.dataset.final;
    const match = final.match(/-?[\d,]+\.?\d*/);
    if (!match) { el.textContent = final; return; }

    const numStr = match[0];
    const hasComma = numStr.includes(',');
    const decimals = (numStr.split('.')[1] || '').length;
    const targetNum = parseFloat(numStr.replace(/,/g, ''));
    const prefix = final.slice(0, match.index);
    const suffix = final.slice(match.index + numStr.length);

    const duration = 650;
    const start = performance.now();

    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const current = targetNum * eased;
      let display = decimals > 0 ? current.toFixed(decimals) : Math.round(current).toString();
      if (hasComma) display = Number(display).toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
      el.textContent = prefix + display + suffix;
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = final; // guarantee exact final text, no rounding drift
    }
    requestAnimationFrame(frame);
  });
}
