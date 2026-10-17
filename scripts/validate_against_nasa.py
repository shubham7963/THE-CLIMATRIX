"""
Validate Synthetic Dataset Against Real NASA POWER Data

Run this AFTER scripts/fetch_nasa_power_data.py has produced
data/climate_dataset_8_cities_REAL_DAILY.csv.

Compares the project's synthetic dataset against real satellite/reanalysis
data on the same cities and years: monthly average temperature, monthly
total rainfall, and monthly average humidity/wind. Produces a per-city,
per-variable report showing how close the synthetic data is to reality --
this is what you cite in your report as data validation.

Usage:
    python scripts/validate_against_nasa.py
"""
import os
import pandas as pd
import numpy as np

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
SYNTH_PATH = os.path.join(DATA_DIR, "climate_dataset_8_cities_DAILY.csv")
REAL_PATH = os.path.join(DATA_DIR, "climate_dataset_8_cities_REAL_DAILY.csv")
REPORT_PATH = os.path.join(DATA_DIR, "..", "docs", "nasa_validation_report.csv")

VARS = ["Tavg_C", "Rainfall_mm", "Humidity_pct", "WindSpeed_kmh"]


def monthly_profile(df, value_col, agg):
    """Average-year monthly profile: mean across all years for temp/RH/wind,
    or mean of annual monthly totals for rainfall."""
    if agg == "mean":
        return df.groupby("Month")[value_col].mean()
    # "sum_then_mean": total per (Year, Month), then averaged across years
    per_year_month = df.groupby(["Year", "Month"])[value_col].sum()
    return per_year_month.groupby("Month").mean()


def main():
    if not os.path.exists(REAL_PATH):
        print(f"Real dataset not found at {REAL_PATH}.")
        print("Run scripts/fetch_nasa_power_data.py first (needs internet access "
              "to power.larc.nasa.gov -- this won't work from a sandboxed environment, "
              "run it on your own machine).")
        return

    synth = pd.read_csv(SYNTH_PATH)
    real = pd.read_csv(REAL_PATH)

    agg_map = {
        "Tavg_C": "mean", "Humidity_pct": "mean",
        "WindSpeed_kmh": "mean", "Rainfall_mm": "sum_then_mean",
    }

    rows = []
    for city in sorted(set(synth["City"]) & set(real["City"])):
        s_city = synth[synth["City"] == city]
        r_city = real[real["City"] == city]
        for var in VARS:
            s_profile = monthly_profile(s_city, var, agg_map[var])
            r_profile = monthly_profile(r_city, var, agg_map[var])
            months = sorted(set(s_profile.index) & set(r_profile.index))
            s_vals = s_profile.loc[months].values
            r_vals = r_profile.loc[months].values

            mae = np.mean(np.abs(s_vals - r_vals))
            corr = np.corrcoef(s_vals, r_vals)[0, 1] if len(months) > 1 else float("nan")
            rows.append({
                "City": city, "Variable": var,
                "Synthetic_mean": round(float(s_vals.mean()), 2),
                "Real_mean": round(float(r_vals.mean()), 2),
                "Monthly_MAE": round(float(mae), 2),
                "Seasonal_shape_correlation": round(float(corr), 3),
            })

    report = pd.DataFrame(rows)
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    report.to_csv(REPORT_PATH, index=False)

    print(f"Saved validation report to {REPORT_PATH}\n")
    print(report.to_string(index=False))
    print("\nSeasonal_shape_correlation close to 1.0 means the synthetic data's "
          "month-to-month pattern (e.g. monsoon peak, winter dip) matches the "
          "real satellite data's pattern, even if absolute values differ slightly.")


if __name__ == "__main__":
    main()
