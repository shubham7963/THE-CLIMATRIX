
# Climate Forecasting and Decision Support Risk Analytics System (CFDS-RAS)

**Climatrix AI** — a machine learning web app that estimates long-term climate conditions and climate risk for eight major Indian cities, built with Flask, scikit-learn, and vanilla JavaScript.

---

## Overview

CFDS-RAS predicts temperature, rainfall, humidity, and wind speed for any future date, for 8 cities (Mumbai, Bangalore, Jaipur, Delhi, Hyderabad, Kanpur, Nagpur, Chhatrapati Sambhajinagar), using 32 trained models (8 cities × 4 targets) run live on the backend. Alongside each prediction it produces a climate **risk tier** (Normal / Moderate / High) based on how far the date extrapolates beyond the training period and how historically volatile that time of year has been for that city.

This is a **climatological planning tool**, not a day-specific weather forecast — see [Limitations](#limitations-stated-plainly) below.

---

## Features

* Live climate prediction (temperature, rainfall, humidity, wind) for any future date, 8 cities
* Two-stage rainfall model: separate "chance of rain" probability + expected amount if it rains
* History-derived features (train-only seasonal average + long-term trend) alongside cyclical day-of-year -- no lag/rolling features, since those can't exist for multi-year-ahead forecasts
* **Anomaly framing**: every prediction shows the historical normal for that date alongside the predicted value and the anomaly
* **Decomposed risk index**: Heat / Rainfall / Humidity / Long-term Warming / Model Reliability, each computed from real numbers, with a stated primary-driver reason -- not just a single opaque score
* **Explainability**: real feature-importance breakdown per prediction, straight from the trained model
* Forecast horizon (years from today) and training extrapolation (years beyond the 2018 training cutoff) shown separately -- previously conflated into one ambiguous "years ahead" figure
* Climate risk assessment (Normal / Moderate / High) calibrated against the actual achievable score distribution, not arbitrary thresholds
* Real geographic risk map (Leaflet.js) with clickable city markers
* City comparison view (2–3 cities side by side) and a historical data explorer with real daily/monthly records, not just annual averages
* Downloadable PDF report per prediction (client-side, via jsPDF)
* Rule-based natural-language insight generation (no external LLM call)
* **Model comparison including a Historical Baseline** (naive seasonal-average predictor) alongside Linear Regression, Random Forest, and Gradient Boosting, with MAE/RMSE/R² and a computed (not asserted) best-model selection per target -- see `models/model_selection.json`
* **Prediction evidence**: for any forecast, see the real recorded value on that same calendar day across every year on file
* **Model validation / backtesting**: pick a past date, the model predicts it blind, then the actual recorded value is revealed for comparison; a 24-date consistency check proves the model performs consistently across multiple held-out periods, not just one
* **Dataset quality panel**: live-computed record count, city count, date range, missing values, and duplicate rows -- not asserted numbers
* **Data pipeline diagram** showing the real generation → cleaning → feature engineering → training flow, with NASA POWER validation as an optional path, not the default source
* Stakeholder pages follow Prediction → Risk → Reason → Concern → Planning Action, not just a bare risk number
* Optional real-data validation against NASA POWER satellite/reanalysis data
* Dark / light theme toggle (persisted), toast notifications instead of browser alerts
* CSV export on every major data table (performance, backtest, comparison, disaster outlook, planning projection)
* Branded favicon, page title/meta description, and a site-wide footer with quick links
* Mobile-responsive layout: collapsible sidebar (hamburger menu), stacked forms/grids, scrollable tables on small screens
* Consolidated into 10 focused pages (from an earlier 14) -- Climate Bulletin folded into Executive Overview, Glossary & FAQ folded into About, Disaster Preparedness and Urban Planning merged into one page with sub-tabs
* Flask REST API backing every dashboard view; deployable with gunicorn (Procfile included)

---

## Technology Stack

**Frontend:** HTML, CSS, vanilla JavaScript, Chart.js, Leaflet.js, jsPDF
**Backend:** Python, Flask, gunicorn (production)
**Machine Learning:** scikit-learn — Random Forest Regressor (temperature, humidity, wind), a custom two-stage classifier+regressor model (rainfall), Gradient Boosting / Linear Regression (comparison baselines only)
**Cities:** Mumbai, Bangalore, Jaipur, Delhi, Hyderabad, Kanpur, Nagpur, Chhatrapati Sambhajinagar
**Data processing:** pandas, NumPy, joblib

---

## Project Structure

```text
CFDSRAS/
├── backend/            # Flask app: live inference, insight engine, REST API, serves webapp/
│   ├── app.py
│   └── requirements.txt
├── common/             # Shared model classes (e.g. TwoStageRainfallModel) importable by
│   └── model_types.py    both training scripts and the backend, for joblib (de)serialization
├── data/               # climate_dataset_8_cities_DAILY.csv (synthetic, 1991-2026, ~105k rows)
├── models/             # rf_models.joblib, model_performance.csv, model_comparison.csv,
│                         daily_climatology.json (precomputed grid + annual series)
├── scripts/
│   ├── generate_daily_dataset.py     # builds the synthetic daily dataset from climate normals
│   ├── train_daily_models.py         # trains & evaluates the 28 production models
│   ├── compare_models.py             # Linear Regression vs Random Forest vs Gradient Boosting
│   ├── fetch_nasa_power_data.py      # pulls real daily data from NASA POWER (needs internet)
│   └── validate_against_nasa.py      # compares synthetic vs real data, run after the fetch
├── webapp/             # Dashboard source (index.html, css/, js/), served by Flask
├── docs/               # This file
├── Procfile            # gunicorn entrypoint for deployment (Render / Railway / etc.)
├── run.sh / start_dashboard.bat
```

---

## Running locally

```bash
pip install -r backend/requirements.txt
python backend/app.py
```

Then open `http://localhost:5000`. The dashboard is served directly by Flask (same origin as the API), so there's nothing else to configure.

If the backend isn't reachable, the dashboard falls back to bundled static data in `webapp/data/` so the layout and charts still render — but the Predictor page needs the live backend for real model inference.

## Deploying

The project already ships with a `Procfile`:

```
web: gunicorn --chdir backend --bind 0.0.0.0:$PORT app:app
```

This works out of the box on any platform that reads a Procfile and provides a `$PORT` env var (e.g. Render, Railway, Heroku-style platforms). Push the repo, point the platform at it, and it deploys with no code changes. `backend/requirements.txt` already includes `gunicorn`.

---

## Machine learning approach

* **Features:** cyclical day-of-year encoding (`sin`/`cos`, so Dec 31 and Jan 1 are neighbors), year, plus two history-derived features computed from the **training years only** (no leakage): the day-of-year's long-term seasonal average, and a long-term linear trend value. Raw lag/rolling-window features are deliberately not used, since this system forecasts dates months to years ahead, where "yesterday's value" doesn't exist yet.
* **Temperature / Humidity / Wind speed:** Random Forest Regressor per city.
* **Rainfall:** a two-stage model (`common/model_types.py: TwoStageRainfallModel`) — a classifier estimates the probability it rains at all, a regressor (trained only on wet days) estimates the amount if it does. This is the standard approach for zero-inflated targets like rainfall, and produces a genuinely useful "% chance of rain" output that a single regressor can't.
* **Model choice justification:** `scripts/compare_models.py` trains a Historical Baseline (naive: just predict the seasonal average), Linear Regression, Random Forest, and Gradient Boosting on the same data/split for every city/target, with MAE, RMSE, and R². The honest finding: once the seasonal-average feature is included, **every candidate lands within ~0.01–0.05 RMSE of each other** — the naive baseline is actually the single best performer for rainfall, humidity, and wind speed by a hair. Random Forest (and the two-stage rainfall model) stay in production anyway for capturing city-specific nonlinear interactions and edging out the baseline on temperature. Full numeric comparison in `models/model_comparison.csv`; the computed selection reasoning is in `models/model_selection.json`.
* **Explainability:** each prediction includes a real feature-importance breakdown from the model itself (`model.feature_importances_`), not an estimate.
* **Evaluation:** forward hold-out (train on 1991–2018, test on 2019–2026) — a genuine test of extrapolation, not random cross-validation. The Model Validation page also runs a 24-date consistency check (one date per quarter, every year since 2019) to prove the model performs consistently, not just well on one hand-picked date.
* **Risk score:** a decomposed index — Heat Risk, Rainfall Risk, Humidity Risk, Long-term Warming Risk, and Model Reliability (how far a forecast reaches beyond the 2018 training cutoff) — each normalized 0–1 and weighted, with the top-contributing component stated as the reason. Tiered into Normal / Moderate / High, calibrated against the actual achievable score range rather than arbitrary cutoffs.
* **Forecast horizon vs. training extrapolation:** shown separately. A previous version conflated "years from today" with "years beyond the training baseline," which understated real extrapolation distance by using a display year (2024) instead of the actual last training year (2018).

### Current model performance (forward hold-out, mean across 8 cities)

| Target | MAE | RMSE | R² |
|---|---|---|---|
| Temperature | 1.09 | 1.36 | 0.85 |
| Humidity | 4.90 | 6.15 | 0.83 |
| Wind speed | 1.48 | 1.86 | 0.76 |
| Rainfall | 2.66 | 4.95 | 0.28 |

See `models/model_performance.csv` for full per-city numbers, and `models/model_comparison.csv` / `models/model_selection.json` for how these compare against the baseline and other candidate models.

---

## Data

The default dataset (`data/climate_dataset_8_cities_DAILY.csv`) is synthesized from published per-city monthly climate normals, expanded to daily values with realistic variability, seasonal wind patterns, and a long-term warming trend. It is **representative, not live satellite data.**

To validate against or switch to real data:

```bash
python scripts/fetch_nasa_power_data.py      # needs internet access to power.larc.nasa.gov
python scripts/validate_against_nasa.py      # compares synthetic vs real, month by month
```

---

## Dashboard pages

| Page | What it shows |
|---|---|
| **Home** | Landing page: hero intro, national KPIs, role-based entry points for different stakeholders |
| **Executive Overview** | National snapshot: KPIs, real map of India with risk-colored city markers (Leaflet), cross-city temperature/rainfall trends, AI-generated summary, and the Climate Bulletin (rule-based monthly outlook per city, generated live) |
| **Forecast & Risk Predictor** | Pick a city + future date → live model inference, anomaly vs. historical normal, decomposed risk index (heat/rainfall/humidity/warming/reliability) with stated reason, feature-importance explainability, historical evidence, seasonal window chart, long-term trend/projection, downloadable PDF report |
| **Model Analytics** | Per-city/target performance table (MAE, RMSE, R²), methodology, model-selection reasoning, stated limitations |
| **Model Validation** | Pick a past date, the model predicts it blind, then compares against the real recorded value; a 24-date consistency check across multiple held-out periods proves the model performs consistently, not just on one cherry-picked date |
| **Compare & Explore** | Side-by-side comparison of 2–3 cities; historical explorer over real daily/monthly data for any date range, 1991–2026 |
| **Disaster Preparedness & Urban Planning** | Two sub-tabs sharing one page: a 12-month peak-risk lookahead per city (reason → concern → planning action) for emergency planning, and long-term warming trends projected across 10/20/30-year infrastructure horizons |
| **Reports & Downloads** | Generate a monthly climate report (PDF) for any city; download the raw dataset, performance, and comparison CSVs |
| **Data & API** | Data pipeline diagram, live-computed dataset quality stats (record count, missing values, duplicates), documented REST endpoints, example request/response, dataset downloads |
| **About & Methodology** | Plain-language explanation of the system, data source, prediction pipeline, model choice, limitations, team/contact info, glossary, and FAQ |

All pages support a **dark/light theme toggle** (persisted via localStorage) available from the sidebar.

---

## Limitations, stated plainly

* This is a **climatological outlook**, not a day-specific weather forecast — no model can reliably predict exact conditions for one calendar day more than ~10–14 days out.
* **Rainfall** on any single day remains genuinely hard to predict from date alone (R² ~0.17–0.35 across cities) — a property of rainfall itself, not something a different model architecture fixes. The rain-probability output is more informative than the raw millimeter estimate for this reason.
* The default dataset is representative/synthetic; use the NASA POWER scripts above to validate against or switch to real data.
* Risk tiers reflect gradual seasonal instability and long-term extrapolation, not discrete extreme events (cyclones, sudden heatwaves).

---

## Conclusion

CFDS-RAS combines machine learning, data analytics, and web technologies into a single interactive platform for exploring long-term climate trends and climate risk — covering the full pipeline from data generation and model training through live inference, visualization, and transparent self-reporting of its own limitations.
