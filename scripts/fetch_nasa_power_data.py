"""
Fetch NASA Climate Data

This script downloads real historical daily climate data for the eight selected Indian 
cities directly from NASA's POWER API. It replaces the sample dataset used in the project 
with actual satellite and reanalysis data. The downloaded dataset follows the same format 
as the project's dataset, so it can be used directly for model training without making any
changes.
"""
import os
import requests
import pandas as pd
import time

CITIES = {
    "Mumbai":    (19.0760, 72.8777),
    "Bangalore": (12.9716, 77.5946),
    "Jaipur":    (26.9124, 75.7873),
    "Delhi":     (28.7041, 77.1025),
    "Hyderabad": (17.3850, 78.4867),
    "Kanpur":    (26.4499, 80.3319),
    "Nagpur":    (21.1458, 79.0882),
    "Chhatrapati Sambhajinagar": (19.8762, 75.3433),
}

PARAMS = "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M"
BASE_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "climate_dataset_8_cities_REAL_DAILY.csv")


def fetch_range(lat, lon, start, end, retries=3):
    """Single request for one date range, with basic retry on failure."""
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(BASE_URL, params={
                "parameters": PARAMS,
                "community": "RE",
                "longitude": lon,
                "latitude": lat,
                "format": "JSON",
                "start": start,
                "end": end,
            }, timeout=120)
            r.raise_for_status()
            return r.json()["properties"]["parameter"]
        except (requests.RequestException, KeyError) as e:
            if attempt == retries:
                raise
            print(f"    retry {attempt}/{retries} after error: {e}")
            time.sleep(3 * attempt)


def fetch_city(city, lat, lon, start_year=1991, end_year=2024):
    """Fetches in ~10-year chunks -- the POWER API can be unreliable/slow
    on very long single-request ranges (34 years in one call), so this
    is safer than a single request for the whole period."""
    rows = []
    chunk_start = start_year
    while chunk_start <= end_year:
        chunk_end = min(chunk_start + 9, end_year)
        print(f"    {city}: fetching {chunk_start}-{chunk_end} ...")
        data = fetch_range(lat, lon, f"{chunk_start}0101", f"{chunk_end}1231")
        for key in data["T2M"].keys():
            date = pd.Timestamp(key)
            rows.append({
                "City": city, "Latitude": lat, "Longitude": lon,
                "Year": date.year, "Month": date.month, "Day": date.day,
                "DayOfYear": date.dayofyear,
                "Tmax_C": data["T2M_MAX"][key], "Tmin_C": data["T2M_MIN"][key],
                "Tavg_C": data["T2M"][key], "Rainfall_mm": data["PRECTOTCORR"][key],
                "Humidity_pct": data["RH2M"][key], "WindSpeed_kmh": data["WS2M"][key] * 3.6,
            })
        chunk_start = chunk_end + 1
        time.sleep(1)
    return rows


if __name__ == "__main__":
    all_rows = []
    for city, (lat, lon) in CITIES.items():
        print(f"Fetching {city} (1991-2024, in 10-year chunks) ...")
        all_rows.extend(fetch_city(city, lat, lon))

    df = pd.DataFrame(all_rows)
    df.to_csv(OUT_PATH, index=False)
    print(f"\nSaved {len(df)} rows to {OUT_PATH}")
    print("Next: run scripts/validate_against_nasa.py to compare this against "
          "the synthetic dataset, or point train_daily_models.py at this file "
          "directly to train on real data instead.")
