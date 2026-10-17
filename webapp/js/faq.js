// ---------------------------------------------------------------------------
// Glossary & FAQ -- static reference content.
// ---------------------------------------------------------------------------
const GLOSSARY = [
  ['Risk tier', 'A simplified Normal / Moderate / High reading combining how far a date extrapolates beyond the training period and how historically volatile that time of year has been for that city.'],
  ['R\u00b2 (R-squared)', 'A score from 0 to 1 showing how well a model\u2019s predictions match reality. 1.0 is a perfect fit; near 0 means the model explains little more than guessing the average.'],
  ['Extrapolation', 'How far a requested date sits beyond the models\u2019 training data (2024) -- the further out, the less certain the projection.'],
  ['Volatility', 'How much a variable historically swings around its seasonal average on a given time of year, for a given city.'],
  ['Held-out test', 'Testing a model on data it never saw during training -- the only honest way to check if it actually generalizes, rather than memorized the training data.'],
  ['Two-stage rainfall model', 'A model that first estimates the probability it rains at all, then separately estimates how much if it does -- more informative than a single number for a variable that\u2019s mostly zero with occasional bursts.'],
  ['Day-of-year encoding', 'Converting a calendar date into a cyclical signal so December 31st and January 1st are treated as neighbors rather than opposites.'],
  ['Climatological outlook', 'What\u2019s typical or expected for a date based on long-term patterns -- not a day-specific weather forecast.'],
];

const FAQS = [
  ['Is this a weather forecast?', 'No. It\u2019s a climatological outlook -- useful for understanding typical/expected conditions months to years ahead, not exact conditions on one specific day.'],
  ['Why is rainfall harder to predict than temperature?', 'Rainfall is naturally much more erratic day-to-day, even in real recorded data. This is a property of rainfall itself, not a flaw specific to this system.'],
  ['Is the data real?', 'By default the dataset is representative, built from published climate normals with realistic variability -- not live satellite data. A NASA POWER validation path exists to check against, or switch to, real data (see Data & API).'],
  ['How is model accuracy actually verified?', 'See the Model Validation page -- it runs the live model on real past dates it never trained on, and compares predicted vs. actual.'],
  ['Why Random Forest and not something else?', 'Linear Regression, Random Forest, and Gradient Boosting were all compared (see Model Analytics). Gradient Boosting scored marginally higher, but Random Forest was kept for its simplicity and training speed -- the difference is small enough not to matter in practice.'],
];

function initFaqPage() {
  document.getElementById('glossaryList').innerHTML = GLOSSARY.map(([term, def]) => `
    <dt style="font-weight:700; color:var(--text); margin-top:12px;">${term}</dt>
    <dd style="margin:4px 0 0;">${def}</dd>
  `).join('');

  document.getElementById('faqList').innerHTML = FAQS.map(([q, a], i) => `
    <div style="${i > 0 ? 'border-top:1px solid var(--border); padding-top:14px; margin-top:14px;' : ''}">
      <div style="font-weight:700; font-size:13.5px; margin-bottom:6px;">${q}</div>
      <div style="font-size:12.8px; color:var(--text2); line-height:1.65;">${a}</div>
    </div>
  `).join('');
}
