"""
Generate Daily Climate Dataset

This script creates a daily climate dataset for eight Indian cities covering the years 
1991 to 2024. It converts monthly climate averages into smooth daily values and adds 
realistic features such as long-term temperature trends, day-to-day weather variations,
and a simple rainfall model. The final output is a daily climate dataset that closely 
represents real climate patterns and is used for training the machine learning models.
"""
import os
import numpy as np
import pandas as pd
from datetime import date
from scipy.interpolate import CubicSpline

np.random.seed(7)

CITIES = {
    "Mumbai": {
        "lat": 19.0760, "lon": 72.8777,
        "tmax": [31,31,32,33,33,32,29,29,29,31,32,32],
        "tmin": [19,19,23,26,27,26,25,25,25,24,22,19],
        "rain": [2,1,0,1,17,529,798,447,297,88,25,4],
        "rh":   [66,65,68,70,73,84,87,86,83,72,63,61],
        "wind": [10,11,12,13,15,22,24,22,17,11,9,9],
    },
    "Bangalore": {
        "lat": 12.9716, "lon": 77.5946,
        "tmax": [28,31,34,35,33,29,27,27,28,28,27,27],
        "tmin": [15,17,19,21,21,20,20,20,19,19,17,15],
        "rain": [3,3,6,36,119,80,105,133,171,164,55,17],
        "rh":   [55,45,40,45,58,68,71,72,74,76,73,66],
        "wind": [7,8,9,10,11,15,16,15,11,7,6,6],
    },
    "Jaipur": {
        "lat": 26.9124, "lon": 75.7873,
        "tmax": [22,25,32,38,41,40,34,32,33,33,28,23],
        "tmin": [8,11,16,22,27,28,26,25,23,18,12,9],
        "rain": [7,6,4,3,10,49,164,178,73,7,3,4],
        "rh":   [51,40,28,20,25,42,64,68,55,37,42,52],
        "wind": [6,7,9,11,13,14,13,11,8,6,5,5],
    },
    "Delhi": {
        "lat": 28.7041, "lon": 77.1025,
        "tmax": [20,23,29,36,40,39,35,33,33,32,27,21],
        "tmin": [7,9,15,21,26,28,27,26,25,19,12,8],
        "rain": [21,19,16,7,16,65,211,247,127,25,4,10],
        "rh":   [63,54,42,30,29,42,64,71,63,49,52,60],
        "wind": [6,8,10,12,14,13,11,10,8,6,5,5],
    },
    "Hyderabad": {
        "lat": 17.3850, "lon": 78.4867,
        "tmax": [28,31,35,37,38,33,30,29,30,30,28,27],
        "tmin": [15,17,20,23,24,22,21,21,20,19,16,13],
        "rain": [3,6,10,23,29,109,166,164,163,90,26,5],
        "rh":   [53,43,35,36,40,60,71,74,72,62,55,54],
        "wind": [7,8,9,10,12,16,17,15,11,7,6,6],
    },
    "Kanpur": {
        "lat": 26.4499, "lon": 80.3319,
        "tmax": [22,26,32,38,41,39,34,32,32,32,28,23],
        "tmin": [8,10,15,21,26,28,27,26,24,18,12,8],
        "rain": [16,12,8,4,10,68,241,297,196,29,3,5],
        "rh":   [60,50,38,25,26,44,73,79,71,54,54,60],
        "wind": [5,6,8,10,12,12,10,9,7,5,4,4],
    },
    "Nagpur": {
        "lat": 21.1458, "lon": 79.0882,
        "tmax": [28,31,36,40,42,36,30,29,30,31,28,28],
        "tmin": [13,15,19,24,27,26,24,23,22,19,15,12],
        "rain": [12,17,15,15,13,168,282,238,163,55,15,8],
        "rh":   [46,35,26,20,22,49,75,79,71,55,49,47],
        "wind": [8,9,11,13,15,17,16,14,10,7,7,8],
    },
    "Chhatrapati Sambhajinagar": {
        "lat": 19.8762, "lon": 75.3433,
        "tmax": [29,32,36,39,38,32,28,27,29,31,29,28],
        "tmin": [12,14,18,23,25,23,22,21,20,17,13,11],
        "rain": [5,3,5,10,20,105,180,150,140,70,20,5],
        "rh":   [47,38,30,27,35,58,75,78,70,55,48,48],
        "wind": [7,8,10,12,13,14,12,11,9,7,6,6],
    },
}

WARMING_RATE_PER_DECADE = {
    "Mumbai": 0.18, "Bangalore": 0.20, "Jaipur": 0.22, "Delhi": 0.24,
    "Hyderabad": 0.19, "Kanpur": 0.23, "Nagpur": 0.21,
    "Chhatrapati Sambhajinagar": 0.21,
}

YEARS = list(range(1991, date.today().year + 1))  # always covers through "now" -- a hardcoded end year
                                                     # is exactly what caused Model Validation to go blank
                                                     # for any date after the old cutoff (2024)
MONTH_MID_DOY = np.array([15,45,74,105,135,166,196,227,258,288,319,349])  # approx mid-month day-of-year

def periodic_spline(values):
    """Fit a periodic cubic spline through 12 monthly midpoints, wrapping year-end to year-start."""
    x = np.concatenate([MONTH_MID_DOY, [MONTH_MID_DOY[0] + 365]])
    y = np.concatenate([values, [values[0]]])
    return CubicSpline(x, y, bc_type='periodic')

rows = []
for city, meta in CITIES.items():
    warm_rate = WARMING_RATE_PER_DECADE[city]
    tmax_spline = periodic_spline(np.array(meta["tmax"], dtype=float))
    tmin_spline = periodic_spline(np.array(meta["tmin"], dtype=float))
    rh_spline   = periodic_spline(np.array(meta["rh"], dtype=float))
    wind_spline = periodic_spline(np.array(meta["wind"], dtype=float))
    # rainfall: spline the *daily average* (monthly total / days in month) for smoothness
    days_in_month = np.array([31,28,31,30,31,30,31,31,30,31,30,31])
    rain_daily_avg = np.array(meta["rain"], dtype=float) / days_in_month
    rain_spline = periodic_spline(rain_daily_avg)

    for year in YEARS:
        years_since_start = year - YEARS[0]
        trend_c = warm_rate * (years_since_start / 10.0)
        is_leap = (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0))
        n_days = 366 if is_leap else 365
        dates = pd.date_range(f"{year}-01-01", periods=n_days, freq="D")
        doy = np.arange(1, n_days + 1)

        tmax = tmax_spline(doy) + trend_c + np.random.normal(0, 2.0, n_days)
        tmin = tmin_spline(doy) + trend_c + np.random.normal(0, 1.7, n_days)
        rh = np.clip(rh_spline(doy) + np.random.normal(0, 6, n_days), 5, 100)
        wind = np.clip(wind_spline(doy) + np.random.normal(0, 1.8, n_days), 2, None)

        # simple wet/dry day rainfall model: rain probability follows the
        # seasonal daily-average curve (higher avg -> higher chance + amount)
        daily_avg_rain = np.clip(rain_spline(doy), 0, None)
        rain_prob = np.clip(daily_avg_rain / (daily_avg_rain.max() + 1e-6) * 0.85 + 0.03, 0, 0.95)
        is_wet = np.random.random(n_days) < rain_prob
        # when wet, amount drawn from a gamma scaled so long-run mean matches daily_avg_rain/rain_prob
        gamma_scale = (daily_avg_rain / np.clip(rain_prob, 0.03, None)) / 2.0
        rain_amt = np.where(is_wet, np.random.gamma(2.0, np.clip(gamma_scale, 0.1, None)), 0.0)

        for i in range(n_days):
            rows.append((
                city, meta["lat"], meta["lon"], year, dates[i].month, dates[i].day, int(doy[i]),
                round(float(tmax[i]), 2), round(float(tmin[i]), 2),
                round(float((tmax[i]+tmin[i])/2), 2),
                round(float(rain_amt[i]), 2), round(float(rh[i]), 1), round(float(wind[i]), 2)
            ))

df = pd.DataFrame(rows, columns=[
    "City","Latitude","Longitude","Year","Month","Day","DayOfYear",
    "Tmax_C","Tmin_C","Tavg_C","Rainfall_mm","Humidity_pct","WindSpeed_kmh"
])
df.to_csv(os.path.join(os.path.dirname(__file__), "..", "data", "climate_dataset_8_cities_DAILY.csv"), index=False)
print(df.shape)
print(df.head())
