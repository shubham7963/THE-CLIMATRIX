"""
CFDS-RAS Backend API

The CFDS-RAS backend is built using Flask and serves as the core of the application. 
It loads the trained Random Forest models to generate climate predictions, provides 
climate and model performance data for the dashboard, generates human-readable
climate insights, and serves the web application, allowing the entire project to run 
from a single server.

"""
import os
import sys
import json
import math
from datetime import date, datetime

import joblib
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, "models")
WEBAPP_DIR = os.path.join(BASE_DIR, "webapp")

# Needed so joblib can unpickle TwoStageRainfallModel (used for the
# Rainfall_mm target -- see common/model_types.py)
sys.path.append(os.path.join(BASE_DIR, "common"))
from model_types import TwoStageRainfallModel  # noqa: F401  (used implicitly by joblib.load)

TARGETS = ["Tavg_C", "Rainfall_mm", "Humidity_pct", "WindSpeed_kmh"]
TARGET_LABELS = {
    "Tavg_C": "Temperature",
    "Rainfall_mm": "Rainfall",
    "Humidity_pct": "Humidity",
    "WindSpeed_kmh": "Wind speed",
}

# Must match scripts/train_daily_models.py -- the production models were
# trained only on data through this year, so any date after it is a
# genuine held-out test the model never saw. Used to label backtests
# honestly (held-out vs in-sample).
TRAIN_END_YEAR = 2018

app = Flask(__name__, static_folder=None)


# Load models and the precomputed grid once at startup
print("Loading trained Random Forest models ...")
RF_MODELS = joblib.load(os.path.join(MODELS_DIR, "rf_models.joblib"))
CITIES = list(RF_MODELS.keys())

with open(os.path.join(MODELS_DIR, "daily_climatology.json")) as f:
    CLIMATOLOGY = json.load(f)

PERFORMANCE_DF = pd.read_csv(os.path.join(MODELS_DIR, "model_performance.csv"))

# Raw daily dataset -- loaded once for the /api/history endpoint (real
# historical values, not just the annual aggregates in CLIMATOLOGY).
RAW_DF = pd.read_csv(os.path.join(BASE_DIR, "data", "climate_dataset_8_cities_DAILY.csv"))
RAW_DF["Date"] = pd.to_datetime(RAW_DF[["Year", "Month", "Day"]])

print(f"Loaded {len(CITIES)} cities x {len(TARGETS)} targets = "
      f"{len(CITIES) * len(TARGETS)} models.")



# Helpers
def day_of_year(d: date) -> int:
    return d.timetuple().tm_yday


def std_for(city: str, doy: int, target: str) -> float:
    """Historical day-of-year residual std."""
    idx = min(366, max(1, doy)) - 1
    return CLIMATOLOGY[city]["grid"][target]["std"][idx]


FEATURE_COLUMNS = ["doy_sin", "doy_cos", "Year", "doy_clim", "trend_val"]


FRIENDLY_FEATURE_NAMES = {
    "doy_sin": "Seasonal pattern", "doy_cos": "Seasonal pattern",
    "doy_clim": "Historical seasonal average", "trend_val": "Long-term trend", "Year": "Year (raw)",
}


def explain_prediction(model, target: str) -> list:
    """Feature-importance breakdown for one model's prediction, using the
    model's own .feature_importances_ (works for both RandomForestRegressor
    and TwoStageRainfallModel, which exposes the same interface -- see
    common/model_types.py). doy_sin/doy_cos are combined into a single
    'Seasonal pattern' bucket since they're two halves of one signal."""
    if not hasattr(model, "feature_importances_"):
        return []
    importances = model.feature_importances_
    buckets = {}
    for col, imp in zip(FEATURE_COLUMNS, importances):
        label = FRIENDLY_FEATURE_NAMES[col]
        buckets[label] = buckets.get(label, 0.0) + float(imp)
    total = sum(buckets.values()) or 1.0
    breakdown = [{"factor": k, "pct": round(v / total * 100, 1)} for k, v in buckets.items()]
    breakdown.sort(key=lambda x: -x["pct"])
    return breakdown


def run_live_prediction(city: str, target_date: date) -> dict:
    """Real inference through the trained models -- this is the live model
    call, not a lookup into a precomputed table. Features must exactly
    match what scripts/train_daily_models.py built the models with:
    cyclical day-of-year + year, plus two train-derived history features
    (seasonal day-of-year average, long-term trend value) stored per
    city/target in CLIMATOLOGY[city]["feature_basis"]."""
    if city not in RF_MODELS:
        raise ValueError(f"Unknown city: {city}")

    doy = day_of_year(target_date)
    year = target_date.year
    doy_sin = math.sin(2 * math.pi * doy / 365.25)
    doy_cos = math.cos(2 * math.pi * doy / 365.25)
    doy_idx = min(366, max(1, doy)) - 1
    feature_basis = CLIMATOLOGY[city]["feature_basis"]

    out = {}
    for target in TARGETS:
        fb = feature_basis[target]
        doy_clim = fb["doy_mean"][doy_idx]
        trend_val = fb["trend_slope"] * year + fb["trend_intercept"]
        X = pd.DataFrame([{
            "doy_sin": doy_sin, "doy_cos": doy_cos, "Year": year,
            "doy_clim": doy_clim, "trend_val": trend_val,
        }], columns=FEATURE_COLUMNS)

        model = RF_MODELS[city][target]
        if target == "Rainfall_mm" and hasattr(model, "predict_components"):
            p_rain, amt_if_rain = model.predict_components(X)
            mean = max(0.0, float(p_rain[0] * amt_if_rain[0]))
            out[target] = {
                "mean": round(mean, 2),
                "std": std_for(city, doy, target),
                "rain_probability_pct": round(float(p_rain[0]) * 100, 1),
                "amount_if_rain_mm": round(float(amt_if_rain[0]), 2),
                "historical_normal": round(doy_clim, 2),
                "anomaly": round(mean - doy_clim, 2),
                "explainability": explain_prediction(model, target),
            }
            continue
        mean = float(model.predict(X)[0])
        if target == "Rainfall_mm":
            mean = max(0.0, mean)
        if target == "Humidity_pct":
            mean = min(100.0, max(0.0, mean))
        out[target] = {
            "mean": round(mean, 2), "std": std_for(city, doy, target),
            "historical_normal": round(doy_clim, 2),
            "anomaly": round(mean - doy_clim, 2),
            "explainability": explain_prediction(model, target),
        }

    # --- forecast horizon vs. training extrapolation (previously conflated
    # into a single ambiguous "years_ahead") ---
    forecast_horizon_years = year - date.today().year
    training_extrapolation_years = max(0, year - TRAIN_END_YEAR)
    extrapolation = min(1.0, training_extrapolation_years / 20)

    rain_std = std_for(city, doy, "Rainfall_mm")
    rain_mean = out["Rainfall_mm"]["mean"]
    volatility = min(1.0, rain_std / (rain_mean + 8))

    # --- decomposed risk index: each component normalized to 0-1 ---
    heat_risk = min(1.0, max(0.0, out["Tavg_C"]["anomaly"]) / 5.0)
    rainfall_risk = volatility
    humidity_risk = min(1.0, abs(out["Humidity_pct"]["anomaly"]) / 20.0)
    warming_per_decade = CLIMATOLOGY[city]["annual_trend_slope"]["Tavg_C"] * 10
    warming_risk = min(1.0, max(0.0, warming_per_decade) / 1.0)
    reliability_risk = extrapolation  # how far beyond training data this forecast reaches

    components = {
        "heat_risk": round(heat_risk, 3), "rainfall_risk": round(rainfall_risk, 3),
        "humidity_risk": round(humidity_risk, 3), "warming_risk": round(warming_risk, 3),
        "reliability_risk": round(reliability_risk, 3),
    }
    weights = {"heat_risk": 0.25, "rainfall_risk": 0.25, "humidity_risk": 0.15,
               "warming_risk": 0.15, "reliability_risk": 0.20}
    score = sum(components[k] * weights[k] for k in weights)
    # Thresholds calibrated against the realistic score range this formula
    # actually produces (sampled across all cities/years/seasons: roughly
    # 0.12-0.50) -- fixed 0.55/0.30 cutoffs left "high" unreachable.
    tier = "high" if score >= 0.38 else "moderate" if score >= 0.24 else "normal"
    top_driver = max(components, key=components.get)
    driver_label = {
        "heat_risk": "an above-normal predicted temperature", "rainfall_risk": "high historical rainfall variability for this time of year",
        "humidity_risk": "an unusual predicted humidity level", "warming_risk": f"this city's long-term warming trend (+{warming_per_decade:.2f}\u00b0C/decade)",
        "reliability_risk": f"the forecast reaching {training_extrapolation_years} years beyond the model's training data",
    }[top_driver]

    return {
        "city": city,
        "date": target_date.isoformat(),
        "day_of_year": doy,
        "year": year,
        "prediction": out,
        "risk": {
            "score": round(score, 3),
            "tier": tier,
            "components": components,
            "top_driver": top_driver,
            "reason": f"Primary driver: {driver_label}.",
            "extrapolation": round(extrapolation, 3),
            "volatility": round(volatility, 3),
            "forecast_horizon_years": forecast_horizon_years,
            "training_extrapolation_years": training_extrapolation_years,
            "years_ahead": training_extrapolation_years,  # kept for backward compatibility
        },
    }


def warming_per_decade(city: str) -> float:
    return round(CLIMATOLOGY[city]["annual_trend_slope"]["Tavg_C"] * 10, 2)



# API routes
DATA_END_DATE = RAW_DF["Date"].max().date()  # last real date actually present in the dataset --
                                               # date pickers must be bounded by THIS, not by
                                               # "today"/the system clock, or they can silently
                                               # offer dates the data doesn't cover (see the
                                               # Model Validation blank-result bug this fixed)


@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok", "cities": CITIES, "models_loaded": True,
        "total_records": len(RAW_DF),
        "data_end_date": DATA_END_DATE.isoformat(),
    })


@app.get("/api/cities")
def cities():
    return jsonify([
        {"city": c, "lat": CLIMATOLOGY[c]["lat"], "lon": CLIMATOLOGY[c]["lon"]}
        for c in CITIES
    ])


@app.get("/api/predict")
def predict():
    """Live model inference: /api/predict?city=Delhi&date=2027-06-15"""
    city = request.args.get("city", "")
    date_str = request.args.get("date", "")
    if city not in RF_MODELS:
        return jsonify({"error": f"Unknown city '{city}'", "cities": CITIES}), 400
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": "date must be in YYYY-MM-DD format"}), 400
    if target_date <= date.today():
        return jsonify({"error": "date must be in the future"}), 400

    return jsonify(run_live_prediction(city, target_date))


@app.get("/api/climatology")
def climatology_all():
    """Precomputed grid + annual series, used by the Overview and
    Predictor charts (seasonal window, cross-city trends, risk map)."""
    return jsonify(CLIMATOLOGY)


@app.get("/api/climatology/<city>")
def climatology_city(city):
    if city not in CLIMATOLOGY:
        return jsonify({"error": f"Unknown city '{city}'"}), 404
    return jsonify(CLIMATOLOGY[city])


@app.get("/api/performance")
def performance():
    rows = PERFORMANCE_DF.to_dict(orient="records")
    return jsonify(rows)


@app.get("/api/history")
def history():
    """Real historical values (not model output) for a city/target across
    a date range -- powers the Historical Trends Explorer. Long ranges are
    aggregated to monthly means/totals so the chart stays readable and the
    payload stays small; short ranges (<= ~3 years) return actual daily
    values.
    """
    city = request.args.get("city", "")
    target = request.args.get("target", "")
    start_str = request.args.get("start", "1991-01-01")
    end_str = request.args.get("end", "2024-12-31")

    if city not in CITIES:
        return jsonify({"error": f"Unknown city '{city}'", "cities": CITIES}), 400
    if target not in TARGETS:
        return jsonify({"error": f"Unknown target '{target}'", "targets": TARGETS}), 400
    try:
        start_d = datetime.strptime(start_str, "%Y-%m-%d").date()
        end_d = datetime.strptime(end_str, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": "start/end must be in YYYY-MM-DD format"}), 400
    if start_d > end_d:
        start_d, end_d = end_d, start_d

    mask = (
        (RAW_DF["City"] == city)
        & (RAW_DF["Date"] >= pd.Timestamp(start_d))
        & (RAW_DF["Date"] <= pd.Timestamp(end_d))
    )
    sub = RAW_DF.loc[mask, ["Date", target]].dropna()

    span_days = (end_d - start_d).days
    if span_days > 1100:  # roughly 3 years -- aggregate to monthly
        sub = sub.set_index("Date")
        agg = "sum" if target == "Rainfall_mm" else "mean"
        monthly = sub[target].resample("MS").agg(agg)
        points = [{"date": d.strftime("%Y-%m-%d"), "value": round(float(v), 2)}
                  for d, v in monthly.items()]
        resolution = "monthly"
    else:
        points = [{"date": d.strftime("%Y-%m-%d"), "value": round(float(v), 2)}
                   for d, v in zip(sub["Date"], sub[target])]
        resolution = "daily"

    return jsonify({
        "city": city, "target": target, "resolution": resolution,
        "start": start_d.isoformat(), "end": end_d.isoformat(),
        "points": points,
    })


@app.get("/api/evidence")
def evidence():
    """What the prediction is actually based on: the real recorded value on
    this same calendar day (month/day) across every year on file for this
    city, for all 4 targets. This is what a prediction 'proves itself'
    against -- not a black box, an aggregate of real historical observations.
    """
    city = request.args.get("city", "")
    date_str = request.args.get("date", "")
    if city not in CITIES:
        return jsonify({"error": f"Unknown city '{city}'", "cities": CITIES}), 400
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": "date must be in YYYY-MM-DD format"}), 400

    mask = (
        (RAW_DF["City"] == city)
        & (RAW_DF["Month"] == target_date.month)
        & (RAW_DF["Day"] == target_date.day)
    )
    sub = RAW_DF.loc[mask, ["Year"] + TARGETS].sort_values("Year")

    by_target = {}
    for target in TARGETS:
        by_target[target] = [
            {"year": int(y), "value": round(float(v), 2)}
            for y, v in zip(sub["Year"], sub[target])
        ]

    return jsonify({
        "city": city,
        "month": target_date.month,
        "day": target_date.day,
        "years_on_record": len(sub),
        "by_target": by_target,
    })


@app.get("/api/backtest")
def backtest():
    """Proof of accuracy: run the live model on a PAST date as if it were
    unknown, then compare against what was actually recorded. Dates after
    TRAIN_END_YEAR are a genuine held-out test (the model never saw that
    data during training); dates on/before it are in-sample and labelled
    as such for honesty.
    """
    city = request.args.get("city", "")
    date_str = request.args.get("date", "")
    if city not in RF_MODELS:
        return jsonify({"error": f"Unknown city '{city}'", "cities": CITIES}), 400
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": "date must be in YYYY-MM-DD format"}), 400
    if target_date >= date.today():
        return jsonify({"error": "backtest date must be in the past"}), 400
    if target_date.year < 1991:
        return jsonify({"error": "no recorded data before 1991"}), 400
    if target_date > DATA_END_DATE:
        return jsonify({"error": f"dataset only covers real data through {DATA_END_DATE.isoformat()} -- "
                                   f"regenerate the dataset (scripts/generate_daily_dataset.py) to extend coverage"}), 404

    predicted = run_live_prediction(city, target_date)["prediction"]

    mask = (
        (RAW_DF["City"] == city)
        & (RAW_DF["Year"] == target_date.year)
        & (RAW_DF["Month"] == target_date.month)
        & (RAW_DF["Day"] == target_date.day)
    )
    row = RAW_DF.loc[mask]
    if row.empty:
        return jsonify({"error": "no recorded data for that exact date"}), 404
    actual = {t: round(float(row.iloc[0][t]), 2) for t in TARGETS}

    comparison = {}
    for t in TARGETS:
        pred_val = predicted[t]["mean"]
        comparison[t] = {
            "predicted": pred_val, "actual": actual[t],
            "abs_error": round(abs(pred_val - actual[t]), 2),
        }

    return jsonify({
        "city": city, "date": target_date.isoformat(),
        "held_out": target_date.year > TRAIN_END_YEAR,
        "train_end_year": TRAIN_END_YEAR,
        "comparison": comparison,
    })


@app.get("/api/backtest_series")
def backtest_series():
    """Runs the backtest across several genuinely held-out dates (one per
    quarter, for every year after TRAIN_END_YEAR) instead of just one --
    proves the model performs *consistently*, not just well on a single
    cherry-picked date."""
    city = request.args.get("city", "")
    if city not in RF_MODELS:
        return jsonify({"error": f"Unknown city '{city}'", "cities": CITIES}), 400

    check_dates = []
    last_valid_date = min(date.today(), DATA_END_DATE)  # can't backtest the future, and can't
                                                          # verify against data the dataset doesn't
                                                          # actually have -- both bounds matter
    for year in range(TRAIN_END_YEAR + 1, last_valid_date.year + 1):
        for month, day_num in [(1, 15), (4, 15), (7, 15), (10, 15)]:
            try:
                d = date(year, month, day_num)
            except ValueError:
                continue
            if d < last_valid_date:
                check_dates.append(d)

    results = []
    for d in check_dates:
        predicted = run_live_prediction(city, d)["prediction"]
        mask = (
            (RAW_DF["City"] == city) & (RAW_DF["Year"] == d.year)
            & (RAW_DF["Month"] == d.month) & (RAW_DF["Day"] == d.day)
        )
        row = RAW_DF.loc[mask]
        if row.empty:
            continue
        comparison = {}
        for t in TARGETS:
            actual_val = round(float(row.iloc[0][t]), 2)
            pred_val = predicted[t]["mean"]
            comparison[t] = {"predicted": pred_val, "actual": actual_val,
                              "abs_error": round(abs(pred_val - actual_val), 2)}
        results.append({"date": d.isoformat(), "comparison": comparison})

    aggregate = {}
    for t in TARGETS:
        errors = [r["comparison"][t]["abs_error"] for r in results]
        if not errors:
            continue
        mae = sum(errors) / len(errors)
        rmse = (sum(e * e for e in errors) / len(errors)) ** 0.5
        aggregate[t] = {"mae": round(mae, 3), "rmse": round(rmse, 3), "n": len(errors)}

    return jsonify({"city": city, "n_dates": len(results), "results": results, "aggregate": aggregate})


@app.get("/api/insight/summary")
def insight_summary():
    """Rule-based cross-city executive summary, generated from current
    risk + warming-trend data (no external service call)."""
    target_year = date.today().year + 1
    target_date = date(target_year, date.today().month, min(date.today().day, 28))
    risks = []
    for c in CITIES:
        r = run_live_prediction(c, target_date)["risk"]
        risks.append({"city": c, "tier": r["tier"], "score": r["score"],
                       "warming_per_decade": warming_per_decade(c)})
    risks.sort(key=lambda r: r["score"], reverse=True)
    top = risks[0]
    warmest = max(risks, key=lambda r: r["warming_per_decade"])
    high_risk = [r["city"] for r in risks if r["tier"] == "high"]

    parts = []
    parts.append(
        f"Across the {len(CITIES)} monitored cities, {top['city']} currently carries the "
        f"highest projected risk ({top['tier']}) roughly a year out, driven by "
        f"a combination of seasonal rainfall volatility and extrapolation "
        f"distance from the model's training baseline."
    )
    if high_risk and high_risk != [top["city"]]:
        others = ", ".join(c for c in high_risk if c != top["city"])
        parts.append(f"{others} also sit in the high-risk tier for the same reasons.")
    parts.append(
        f"{warmest['city']} shows the steepest long-term warming trend among "
        f"the group, at roughly {warmest['warming_per_decade']}\u00b0C per decade."
    )
    parts.append(
        "Overall, the model indicates gradual regional warming consistent with "
        "observed India climate trends, with monsoon-season months carrying "
        "the highest year-to-year variability across all cities."
    )
    return jsonify({"summary": " ".join(parts), "risks": risks})


@app.get("/api/insight/prediction")
def insight_prediction():
    """Rule-based plain-language read of a single city/date prediction."""
    city = request.args.get("city", "")
    date_str = request.args.get("date", "")
    if city not in RF_MODELS:
        return jsonify({"error": f"Unknown city '{city}'"}), 400
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": "date must be in YYYY-MM-DD format"}), 400

    result = run_live_prediction(city, target_date)
    pred, risk = result["prediction"], result["risk"]
    temp = pred["Tavg_C"]["mean"]
    rain = pred["Rainfall_mm"]["mean"]
    pretty_date = target_date.strftime("%-d %B %Y") if os.name != "nt" \
        else target_date.strftime("%#d %B %Y")

    rain_phrase = "little to no rainfall" if rain < 1 else f"around {rain:.1f} mm of rainfall"
    tier_phrase = {
        "high": "That's a high-risk read: it sits well beyond the model's training "
                "baseline and lands on a historically volatile date for this city.",
        "moderate": "That's a moderate-risk read: a mix of extrapolation distance and "
                    "typical seasonal variability widens the expected range somewhat.",
        "normal": "That's a normal-risk read: the date is close to the model's "
                  "baseline and historically stable for this city.",
    }[risk["tier"]]

    summary = (
        f"For {city} on {pretty_date}, the model expects an average temperature "
        f"around {temp:.1f}\u00b0C with {rain_phrase}. {tier_phrase} "
        f"This reflects {risk['years_ahead']} years of extrapolation beyond the "
        f"training baseline. Treat this as a planning-level climatological "
        f"outlook rather than a precise day-specific forecast."
    )
    return jsonify({"summary": summary, "prediction": result})



# Static frontend
@app.get("/api/data-quality")
def data_quality():
    """Real, computed dataset quality stats -- not asserted numbers. Backs
    the pipeline/data-quality section on the Data & API page."""
    missing = int(RAW_DF.isna().sum().sum())
    duplicates = int(RAW_DF.duplicated().sum())
    return jsonify({
        "total_records": int(len(RAW_DF)),
        "city_count": int(RAW_DF["City"].nunique()),
        "cities": sorted(RAW_DF["City"].unique().tolist()),
        "date_range": {"start_year": int(RAW_DF["Year"].min()), "end_year": int(RAW_DF["Year"].max())},
        "missing_values": missing,
        "duplicate_rows": duplicates,
        "variables": [c for c in RAW_DF.columns if c != "Date"],
        "variable_count": len(RAW_DF.columns) - 1,
    })


@app.get("/api/download/<kind>")
def download(kind):
    """Raw file downloads for the Data & API / Reports pages -- the
    underlying dataset and model evaluation tables, not just API JSON."""
    files = {
        "dataset": ("data", "climate_dataset_8_cities_DAILY.csv", "climatrix_dataset.csv"),
        "performance": ("models", "model_performance.csv", "climatrix_model_performance.csv"),
        "comparison": ("models", "model_comparison.csv", "climatrix_model_comparison.csv"),
    }
    if kind not in files:
        return jsonify({"error": f"Unknown download '{kind}'", "available": list(files.keys())}), 404
    folder, filename, download_name = files[kind]
    full_dir = os.path.join(BASE_DIR, folder)
    if not os.path.exists(os.path.join(full_dir, filename)):
        return jsonify({"error": f"{filename} not found on server"}), 404
    return send_from_directory(full_dir, filename, as_attachment=True, download_name=download_name)


@app.get("/")
def index():
    return send_from_directory(WEBAPP_DIR, "index.html")


@app.get("/<path:path>")
def static_files(path):
    return send_from_directory(WEBAPP_DIR, path)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
