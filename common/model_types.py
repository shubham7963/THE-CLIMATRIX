"""
Shared custom model classes.

These live in their own module (instead of inline in the training script)
because joblib/pickle needs to be able to import the exact same class
definition at load time -- both train_daily_models.py (when saving) and
backend/app.py (when loading) import from here.
"""
import numpy as np
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor


class TwoStageRainfallModel:
    """
    Rainfall is mostly zero with occasional large bursts, which a single
    regressor struggles to fit well (low R^2). This splits the problem into
    two easier sub-problems, the standard approach for "zero-inflated"
    targets like rainfall:

      Stage 1 (classifier): P(rain falls at all on this day)
      Stage 2 (regressor):  expected amount, given that it *does* rain
                             (trained only on wet days)

    Final prediction = P(rain) * E[amount | rain]

    Exposes the same .fit(X, y) / .predict(X) interface as a normal
    sklearn regressor, so it drops into the existing training and
    inference code without any other changes.
    """

    def __init__(self, wet_threshold=0.1, random_state=42):
        self.wet_threshold = wet_threshold
        self.classifier = RandomForestClassifier(
            n_estimators=80, max_depth=8, min_samples_leaf=10,
            random_state=random_state, n_jobs=-1,
        )
        self.regressor = RandomForestRegressor(
            n_estimators=80, max_depth=8, min_samples_leaf=10,
            random_state=random_state, n_jobs=-1,
        )

    def fit(self, X, y):
        y = np.asarray(y, dtype=float)
        is_wet = (y > self.wet_threshold).astype(int)
        self.classifier.fit(X, is_wet)

        wet_mask = is_wet == 1
        if wet_mask.sum() > 10:
            self.regressor.fit(X[wet_mask], y[wet_mask])
        else:
            # fallback for pathological cases with almost no wet days
            self.regressor.fit(X, y)
        return self

    def predict(self, X):
        p_rain = self.classifier.predict_proba(X)[:, 1]
        amount_if_rain = np.clip(self.regressor.predict(X), 0, None)
        return p_rain * amount_if_rain

    def predict_components(self, X):
        """Returns (probability_of_rain, expected_amount_if_rain) separately
        -- useful for the dashboard to show 'X% chance of rain' as its own
        figure instead of only the blended expected value."""
        p_rain = self.classifier.predict_proba(X)[:, 1]
        amount_if_rain = np.clip(self.regressor.predict(X), 0, None)
        return p_rain, amount_if_rain

    @property
    def feature_importances_(self):
        """Averages the classifier's and regressor's importances so this
        model exposes the same explainability interface as a plain
        RandomForestRegressor, for the prediction explainability feature."""
        return (self.classifier.feature_importances_ + self.regressor.feature_importances_) / 2


class HistoricalBaselineModel:
    """
    A deliberately naive baseline for model comparison: predicts the smoothed
    historical average for that day-of-year, ignoring year entirely (no
    warming trend, no interactions). If Linear Regression / Random Forest /
    Gradient Boosting can't beat this, they aren't earning their extra
    complexity -- this is what "compared against a baseline" should mean,
    rather than only comparing fancier models against each other.

    Expects X to be a DataFrame with a raw "DayOfYear" column (1-366), not
    the cyclical doy_sin/doy_cos encoding the other models use.
    """

    def __init__(self, half_window=7):
        self.half_window = half_window
        self.norm_by_doy = None

    def _extract_doy(self, X):
        return np.asarray(X["DayOfYear"]) if hasattr(X, "columns") else np.asarray(X).reshape(-1)

    def fit(self, X, y):
        doy = self._extract_doy(X)
        y = np.asarray(y, dtype=float)
        sums, counts = np.zeros(366), np.zeros(366)
        for d, v in zip(doy, y):
            sums[int(d) - 1] += v
            counts[int(d) - 1] += 1
        counts[counts == 0] = 1
        raw = sums / counts

        smoothed = np.zeros(366)
        for i in range(366):
            idxs = [(i + off) % 366 for off in range(-self.half_window, self.half_window + 1)]
            smoothed[i] = raw[idxs].mean()
        self.norm_by_doy = smoothed
        return self

    def predict(self, X):
        doy = self._extract_doy(X)
        return np.array([self.norm_by_doy[int(d) - 1] for d in doy])
