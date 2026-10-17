"""
Compare Candidate Models

Trains a Historical Baseline (the day-of-year's train-period seasonal
average -- i.e. "assume this year is like a typical year"), Linear
Regression, Random Forest, and Gradient Boosting on the same train/test
split and feature set used by train_daily_models.py, for every city and
target, and writes a comparison table to models/model_comparison.csv.

This exists to justify the choice of Random Forest (or the two-stage
rainfall model) in the report -- it shows what was tried, including a naive
baseline, and lets a real "is this actually better than just assuming a
typical year?" comparison happen instead of only comparing ML models against
each other.

For Rainfall_mm, the TwoStageRainfallModel is included as its own row so it
can be compared directly against plain regressors on the same metric.

Also writes models/model_selection.json: for each target, the
best-performing candidate by mean RMSE across all cities, with the actual
numbers -- so "why Random Forest" can cite a computed answer instead of an
unverified claim.
"""
import os
import sys
import json
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "common"))
from model_types import TwoStageRainfallModel

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "climate_dataset_8_cities_DAILY.csv")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "model_comparison.csv")
SELECTION_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "model_selection.json")

df = pd.read_csv(DATA_PATH)
df["doy_sin"] = np.sin(2 * np.pi * df["DayOfYear"] / 365.25)
df["doy_cos"] = np.cos(2 * np.pi * df["DayOfYear"] / 365.25)

TARGETS = ["Tavg_C", "Rainfall_mm", "Humidity_pct", "WindSpeed_kmh"]
FEATURE_COLUMNS = ["doy_sin", "doy_cos", "Year", "doy_clim", "trend_val"]
TRAIN_END_YEAR = 2018
CITIES = df["City"].unique().tolist()

PRODUCTION_MODEL = {  # what's actually deployed in backend/app.py, for comparison
    "Tavg_C": "RandomForest", "Humidity_pct": "RandomForest", "WindSpeed_kmh": "RandomForest",
    "Rainfall_mm": "TwoStageRainfall (RF-based)",
}


class HistoricalBaseline:
    """Naive baseline: predict the day-of-year's train-period seasonal
    average, ignoring year/trend entirely. If ML models can't beat this,
    they aren't earning their complexity."""
    def fit(self, X, y): return self
    def predict(self, X): return X["doy_clim"].values


def candidates_for(target):
    base = {
        "Historical Baseline": HistoricalBaseline(),
        "LinearRegression": LinearRegression(),
        "RandomForest": RandomForestRegressor(
            n_estimators=60, max_depth=8, min_samples_leaf=12,
            random_state=42, n_jobs=-1
        ),
        "GradientBoosting": GradientBoostingRegressor(
            n_estimators=150, max_depth=3, learning_rate=0.05, random_state=42
        ),
    }
    if target == "Rainfall_mm":
        base["TwoStageRainfall (RF-based)"] = TwoStageRainfallModel()
    return base


rows = []
for city in CITIES:
    cdf = df[df["City"] == city]
    train = cdf[cdf["Year"] <= TRAIN_END_YEAR].copy()
    test = cdf[cdf["Year"] > TRAIN_END_YEAR].copy()

    for target in TARGETS:
        # same train-only history features as train_daily_models.py
        doy_mean = train.groupby("DayOfYear")[target].mean().reindex(range(1, 367)).interpolate(limit_direction="both")
        annual_train_mean = train.groupby("Year")[target].mean()
        trend_slope, trend_intercept = np.polyfit(annual_train_mean.index, annual_train_mean.values, 1)
        for part in (train, test):
            part["doy_clim"] = part["DayOfYear"].map(doy_mean)
            part["trend_val"] = trend_slope * part["Year"] + trend_intercept

        for name, model in candidates_for(target).items():
            model.fit(train[FEATURE_COLUMNS], train[target])
            pred = model.predict(test[FEATURE_COLUMNS])
            mae = mean_absolute_error(test[target], pred)
            rmse = mean_squared_error(test[target], pred) ** 0.5
            r2 = r2_score(test[target], pred)
            rows.append({
                "City": city, "Target": target, "Model": name,
                "MAE": round(mae, 3), "RMSE": round(rmse, 3), "R2": round(r2, 3),
            })

comp_df = pd.DataFrame(rows)
comp_df.to_csv(OUT_PATH, index=False)

print("Saved comparison table to", OUT_PATH)
print()
print("=== Average RMSE by model, per target (lower is better) ===")
summary = comp_df.groupby(["Target", "Model"])["RMSE"].mean().round(3).unstack()
print(summary)

selection = {}
print()
print("=== Best model per target (by mean RMSE across all cities) ===")
for target in TARGETS:
    sub = comp_df[comp_df["Target"] == target]
    means_rmse = sub.groupby("Model")["RMSE"].mean().sort_values()
    means_r2 = sub.groupby("Model")["R2"].mean()
    best_model = means_rmse.index[0]
    production = PRODUCTION_MODEL[target]
    delta_vs_production = round(float(means_rmse[production] - means_rmse[best_model]), 4)
    selection[target] = {
        "best_by_rmse": best_model,
        "best_rmse": round(float(means_rmse.iloc[0]), 3),
        "best_r2": round(float(means_r2[best_model]), 3),
        "production_model": production,
        "production_rmse": round(float(means_rmse[production]), 3),
        "production_r2": round(float(means_r2[production]), 3),
        "production_matches_best": bool(best_model == production),
        "rmse_gap_production_minus_best": delta_vs_production,
        "all_candidates_rmse": {k: round(float(v), 3) for k, v in means_rmse.items()},
    }
    tag = "SAME AS PRODUCTION" if best_model == production else f"production uses {production} instead (RMSE gap: {delta_vs_production:+.3f})"
    print(f"{target:14s} -> {best_model} (RMSE={means_rmse.iloc[0]:.3f})  [{tag}]")

with open(SELECTION_PATH, "w") as f:
    json.dump(selection, f, indent=2)
print("\nSaved model selection reasoning to", SELECTION_PATH)
