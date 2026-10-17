"""
Train Machine Learning Models

Trains models per city/target using cyclical day-of-year + year, PLUS two
history-derived features: the day-of-year's historical seasonal average and
a long-term linear trend value -- both computed from the TRAINING years
only, so nothing from the test period leaks into the features. (Raw lag /
rolling-window features are deliberately NOT used: this system forecasts
dates months to years ahead, where "yesterday's value" doesn't exist yet.)

Saves the trained models, their performance metrics (MAE, RMSE, R2), and
the "feature basis" (per city/target day-of-year averages + trend
coefficients) that the Flask backend needs to build the exact same features
at live-inference time.
"""
import os
import sys
import numpy as np
import pandas as pd
import json
import joblib
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "common"))
from model_types import TwoStageRainfallModel

df = pd.read_csv(os.path.join(os.path.dirname(__file__), "..", "data", "climate_dataset_8_cities_DAILY.csv"))
df["doy_sin"] = np.sin(2 * np.pi * df["DayOfYear"] / 365.25)
df["doy_cos"] = np.cos(2 * np.pi * df["DayOfYear"] / 365.25)

TARGETS = ["Tavg_C", "Rainfall_mm", "Humidity_pct", "WindSpeed_kmh"]
FEATURE_COLUMNS = ["doy_sin", "doy_cos", "Year", "doy_clim", "trend_val"]

TRAIN_END_YEAR = 2018
CITIES = df["City"].unique().tolist()

models = {}
perf_rows = []
feature_basis = {}  # city -> target -> {doy_mean: [366], trend_slope, trend_intercept}

for city in CITIES:
    cdf = df[df["City"] == city]
    train = cdf[cdf["Year"] <= TRAIN_END_YEAR].copy()
    test = cdf[cdf["Year"] > TRAIN_END_YEAR].copy()

    models[city] = {}
    feature_basis[city] = {}

    for target in TARGETS:
        # --- history-derived features, fit on TRAIN ONLY ---
        doy_mean = train.groupby("DayOfYear")[target].mean().reindex(range(1, 367))
        doy_mean = doy_mean.interpolate(limit_direction="both")  # fills any sparse leap-day gaps
        annual_train_mean = train.groupby("Year")[target].mean()
        trend_slope, trend_intercept = np.polyfit(annual_train_mean.index, annual_train_mean.values, 1)

        feature_basis[city][target] = {
            "doy_mean": [round(float(v), 3) for v in doy_mean.values],
            "trend_slope": float(trend_slope), "trend_intercept": float(trend_intercept),
        }

        for part in (train, test):
            part["doy_clim"] = part["DayOfYear"].map(doy_mean)
            part["trend_val"] = trend_slope * part["Year"] + trend_intercept

        # --- fit the production model ---
        if target == "Rainfall_mm":
            # zero-inflated target: classifier (rain / no rain) x regressor
            # (expected amount if it rains) fits this kind of data far better
            # than a single regressor -- see common/model_types.py
            model = TwoStageRainfallModel()
        else:
            model = RandomForestRegressor(
                n_estimators=60, max_depth=8, min_samples_leaf=12,
                random_state=42, n_jobs=-1
            )
        model.fit(train[FEATURE_COLUMNS], train[target])
        pred = model.predict(test[FEATURE_COLUMNS])

        mae = mean_absolute_error(test[target], pred)
        rmse = mean_squared_error(test[target], pred) ** 0.5
        r2 = r2_score(test[target], pred)
        models[city][target] = model
        perf_rows.append({"City": city, "Target": target, "MAE": round(mae, 3),
                           "RMSE": round(rmse, 3), "R2": round(r2, 3)})
        print(f"{city:26s} {target:14s}  MAE={mae:.3f}  RMSE={rmse:.3f}  R2={r2:.3f}")

joblib.dump(models, os.path.join(os.path.dirname(__file__), "..", "models", "rf_models.joblib"))
perf_df = pd.DataFrame(perf_rows)
perf_df.to_csv(os.path.join(os.path.dirname(__file__), "..", "models", "model_performance.csv"), index=False)


daily_grid = {}
CITY_META = df.drop_duplicates("City").set_index("City")[["Latitude", "Longitude"]].to_dict("index")

for city in CITIES:
    cdf = df[df["City"] == city]
    doy_range = np.arange(1, 367)
    doy_sin = np.sin(2 * np.pi * doy_range / 365.25)
    doy_cos = np.cos(2 * np.pi * doy_range / 365.25)
    baseline_year = 2024

    city_grid = {}
    for target in TARGETS:
        fb = feature_basis[city][target]
        doy_clim_arr = np.array(fb["doy_mean"])
        trend_val_arr = fb["trend_slope"] * baseline_year + fb["trend_intercept"]
        Xpred = pd.DataFrame({
            "doy_sin": doy_sin, "doy_cos": doy_cos, "Year": baseline_year,
            "doy_clim": doy_clim_arr, "trend_val": trend_val_arr,
        }, columns=FEATURE_COLUMNS)
        mean_pred = models[city][target].predict(Xpred)
        stds = []
        for d in doy_range:
            window = cdf[(np.minimum(np.abs(cdf["DayOfYear"] - d), 366 - np.abs(cdf["DayOfYear"] - d))) <= 5]
            stds.append(window[target].std() if len(window) > 5 else cdf[target].std())
        city_grid[target] = {
            "mean": [round(float(v), 2) for v in mean_pred],
            "std": [round(float(v), 2) for v in stds],
        }

    # annual trend slope: linear fit of annual mean (or annual total for rain) vs year
    # -- this is the DISPLAY trend (fit on the full 1991-2024 record), distinct from
    # the TRAIN-ONLY trend_val feature used for model fitting above.
    annual = cdf.groupby("Year").agg(Tavg=("Tavg_C","mean"), Rain=("Rainfall_mm","sum"),
                                      RH=("Humidity_pct","mean"), Wind=("WindSpeed_kmh","mean")).reset_index()
    def slope(y, x=annual["Year"]):
        A = np.vstack([x, np.ones(len(x))]).T
        m, c = np.linalg.lstsq(A, y, rcond=None)[0]
        return float(m)

    trend = {
        "Tavg_C": round(slope(annual["Tavg"]), 5),
        "Rainfall_mm": round(slope(annual["Rain"]), 3),   # per-year change in ANNUAL total
        "Humidity_pct": round(slope(annual["RH"]), 5),
        "WindSpeed_kmh": round(slope(annual["Wind"]), 5),
    }

    daily_grid[city] = {
        "lat": CITY_META[city]["Latitude"], "lon": CITY_META[city]["Longitude"],
        "baseline_year": baseline_year,
        "grid": city_grid,
        "annual_trend_slope": trend,
        "feature_basis": feature_basis[city],
        "annual_series": {
            str(int(r.Year)): {
                "avg_temp": round(r.Tavg, 2), "total_rain": round(r.Rain, 1),
                "avg_humidity": round(r.RH, 1), "avg_wind": round(r.Wind, 2),
            }
            for r in annual.itertuples()
        }
    }

with open(os.path.join(os.path.dirname(__file__), "..", "models", "daily_climatology.json"), "w") as f:
    json.dump(daily_grid, f)

print("\nSaved models, performance metrics (MAE/RMSE/R2), and daily climatology grid (incl. feature_basis).")
print("Grid JSON size (bytes):", len(json.dumps(daily_grid)))
