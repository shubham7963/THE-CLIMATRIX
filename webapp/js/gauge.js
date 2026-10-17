// ---------------------------------------------------------------------------
// Interactive risk gauge -- a semicircle arc gauge replacing/augmenting the
// plain Normal/Moderate/High badges with a genuine visual read of where the
// score (0-1) sits, colored by tier, with an animated needle sweep.
// ---------------------------------------------------------------------------
function arcPoint(cx, cy, r, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = arcPoint(cx, cy, r, startAngle);
  const end = arcPoint(cx, cy, r, endAngle);
  const largeArcFlag = (startAngle - endAngle) <= 180 ? 0 : 1;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function tierGaugeColor(tier) {
  return themeColor(`--${tier}`) || themeColor('--normal');
}

function renderRiskGauge(containerId, score, tier) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const clamped = Math.max(0, Math.min(1, score));
  const needleAngle = 180 - clamped * 180;
  const needleTip = arcPoint(100, 100, 68, needleAngle);
  const color = tierGaugeColor(tier);
  const trackColor = (typeof themeColor === 'function') ? themeColor('--chart-grid') : '#e4ebe8';

  el.innerHTML = `
    <svg viewBox="0 0 200 118" class="risk-gauge-svg">
      <path d="${describeArc(100, 100, 80, 180, 0)}" fill="none" stroke="${trackColor}" stroke-width="14" stroke-linecap="round"/>
      <path d="${describeArc(100, 100, 80, 180, needleAngle)}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round" class="risk-gauge-fill"/>
      <line x1="100" y1="100" x2="${needleTip.x.toFixed(2)}" y2="${needleTip.y.toFixed(2)}" stroke="${color}" stroke-width="2.5" stroke-linecap="round" class="risk-gauge-needle"/>
      <circle cx="100" cy="100" r="5" fill="${color}"/>
      <text x="20" y="112" font-size="8" fill="currentColor" opacity="0.5" text-anchor="start">0</text>
      <text x="180" y="112" font-size="8" fill="currentColor" opacity="0.5" text-anchor="end">1</text>
    </svg>
    <div class="risk-gauge-label">
      <div class="risk-gauge-score" style="color:${color};">${clamped.toFixed(2)}</div>
      <div class="risk-gauge-tier">${tier.charAt(0).toUpperCase() + tier.slice(1)} risk</div>
    </div>`;
}
