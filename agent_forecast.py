"""Agent Forecast Module

Resource forecasting system for agents including demand forecasting, capacity planning,
trend analysis, predictive analytics, and anomaly detection.
"""
import time
import uuid
import threading
import math
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class ForecastModel(str, Enum):
    """Forecasting models."""
    LINEAR = "linear"
    EXPONENTIAL = "exponential"
    POLYNOMIAL = "polynomial"
    MOVING_AVERAGE = "moving_average"
    WEIGHTED_MOVING_AVERAGE = "weighted_moving_average"
    HOLT_WINTERS = "holt_winters"


class ResourceType(str, Enum):
    """Resource types for forecasting."""
    CPU = "cpu"
    MEMORY = "memory"
    STORAGE = "storage"
    BANDWIDTH = "bandwidth"
    API_REQUESTS = "api_requests"
    CONCURRENT_USERS = "concurrent_users"
    QUEUE_DEPTH = "queue_depth"
    CUSTOM = "custom"


class ForecastHorizon(str, Enum):
    """Forecast horizons."""
    SHORT_TERM = "short_term"  # 1-7 days
    MEDIUM_TERM = "medium_term"  # 7-30 days
    LONG_TERM = "long_term"  # 30+ days


class TrendDirection(str, Enum):
    """Trend directions."""
    INCREASING = "increasing"
    DECREASING = "decreasing"
    STABLE = "stable"
    UNKNOWN = "unknown"


@dataclass
class DataPoint:
    """Data point for forecasting."""
    timestamp: float
    value: float
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ForecastResult:
    """Forecast result."""
    model: ForecastModel
    predictions: List[DataPoint]
    horizon: ForecastHorizon
    confidence: float
    trend: TrendDirection
    seasonality: bool = False
    anomaly_score: float = 0.0


@dataclass
class ForecastConfig:
    """Forecast configuration."""
    name: str
    resource_type: ResourceType
    model: ForecastModel = ForecastModel.LINEAR
    horizon: ForecastHorizon = ForecastHorizon.SHORT_TERM
    interval_seconds: int = 3600
    min_data_points: int = 24
    confidence_threshold: float = 0.8
    enable_anomaly_detection: bool = True
    seasonality_period: int = 24  # hours


@dataclass
class ForecastMetrics:
    """Forecast metrics."""
    accuracy: float = 0.0
    mape: float = 0.0  # Mean Absolute Percentage Error
    rmse: float = 0.0  # Root Mean Square Error
    mae: float = 0.0   # Mean Absolute Error


@dataclass
class Anomaly:
    """Detected anomaly."""
    id: str
    timestamp: float
    value: float
    expected_value: float
    deviation: float
    severity: str = "low"  # low, medium, high


class ForecastEngine:
    """Forecasting engine."""

    def __init__(self, config: ForecastConfig):
        self.config = config
        self._lock = threading.RLock()
        self._historical_data: List[DataPoint] = []
        self._predictions: List[DataPoint] = []
        self._anomalies: List[Anomaly] = []
        self._metrics = ForecastMetrics()
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_data_point(self, timestamp: float, value: float, metadata: Dict[str, Any] = None):
        """Add a data point to historical data."""
        with self._lock:
            point = DataPoint(
                timestamp=timestamp,
                value=value,
                metadata=metadata or {}
            )
            self._historical_data.append(point)
            # Keep only last 1000 points
            if len(self._historical_data) > 1000:
                self._historical_data = self._historical_data[-1000:]

    def _get_horizon_hours(self) -> int:
        """Get forecast horizon in hours."""
        if self.config.horizon == ForecastHorizon.SHORT_TERM:
            return 24 * 3  # 3 days
        elif self.config.horizon == ForecastHorizon.MEDIUM_TERM:
            return 24 * 14  # 14 days
        else:
            return 24 * 30  # 30 days

    def _linear_forecast(self) -> List[DataPoint]:
        """Linear regression forecast."""
        n = len(self._historical_data)
        if n < 2:
            return []

        # Simple linear regression
        times = [(p.timestamp - self._historical_data[0].timestamp) / 3600 for p in self._historical_data]
        values = [p.value for p in self._historical_data]

        # Calculate coefficients
        n = len(times)
        sum_x = sum(times)
        sum_y = sum(values)
        sum_xy = sum(t * v for t, v in zip(times, values))
        sum_x2 = sum(t * t for t in times)

        denom = n * sum_x2 - sum_x * sum_x
        if denom == 0:
            return []

        slope = (n * sum_xy - sum_x * sum_y) / denom
        intercept = (sum_y - slope * sum_x) / n

        # Generate predictions
        predictions = []
        last_timestamp = self._historical_data[-1].timestamp
        horizon_hours = self._get_horizon_hours()

        for i in range(1, horizon_hours + 1):
            t = horizon_hours + i  # hours from start
            pred_value = slope * t + intercept
            pred_timestamp = last_timestamp + (i * 3600)

            predictions.append(DataPoint(
                timestamp=pred_timestamp,
                value=max(0, pred_value)  # Values can't be negative
            ))

        return predictions

    def _moving_average_forecast(self, window: int = 7) -> List[DataPoint]:
        """Moving average forecast."""
        n = len(self._historical_data)
        if n < window:
            return []

        # Calculate moving average
        recent_values = [p.value for p in self._historical_data[-window:]]
        avg = sum(recent_values) / window

        predictions = []
        last_timestamp = self._historical_data[-1].timestamp
        horizon_hours = self._get_horizon_hours()

        for i in range(1, horizon_hours + 1):
            pred_timestamp = last_timestamp + (i * 3600)
            predictions.append(DataPoint(
                timestamp=pred_timestamp,
                value=avg
            ))

        return predictions

    def _weighted_moving_average_forecast(self, window: int = 7) -> List[DataPoint]:
        """Weighted moving average forecast."""
        n = len(self._historical_data)
        if n < window:
            return []

        # More weight to recent values
        recent_values = [p.value for p in self._historical_data[-window:]]
        weights = list(range(1, window + 1))
        weighted_sum = sum(v * w for v, w in zip(recent_values, weights))
        weight_total = sum(weights)
        wma = weighted_sum / weight_total

        predictions = []
        last_timestamp = self._historical_data[-1].timestamp
        horizon_hours = self._get_horizon_hours()

        for i in range(1, horizon_hours + 1):
            pred_timestamp = last_timestamp + (i * 3600)
            predictions.append(DataPoint(
                timestamp=pred_timestamp,
                value=wma
            ))

        return predictions

    def _exponential_smoothing_forecast(self, alpha: float = 0.3) -> List[DataPoint]:
        """Simple exponential smoothing forecast."""
        n = len(self._historical_data)
        if n < 2:
            return []

        # Calculate smoothed value
        values = [p.value for p in self._historical_data]
        smoothed = values[0]

        for v in values[1:]:
            smoothed = alpha * v + (1 - alpha) * smoothed

        predictions = []
        last_timestamp = self._historical_data[-1].timestamp
        horizon_hours = self._get_horizon_hours()

        for i in range(1, horizon_hours + 1):
            pred_timestamp = last_timestamp + (i * 3600)
            predictions.append(DataPoint(
                timestamp=pred_timestamp,
                value=smoothed
            ))

        return predictions

    def _calculate_confidence(self, predictions: List[DataPoint]) -> float:
        """Calculate forecast confidence."""
        if not predictions:
            return 0.0

        n = len(self._historical_data)
        if n < self.config.min_data_points:
            return 0.5

        # Simple confidence based on data points
        confidence = min(1.0, n / 100) * self.config.confidence_threshold
        return confidence

    def _detect_trend(self) -> TrendDirection:
        """Detect trend direction."""
        n = len(self._historical_data)
        if n < 10:
            return TrendDirection.UNKNOWN

        # Compare first half to second half
        first_half = self._historical_data[:n//2]
        second_half = self._historical_data[n//2:]

        first_avg = sum(p.value for p in first_half) / len(first_half)
        second_avg = sum(p.value for p in second_half) / len(second_half)

        if first_avg > 0:
            change = (second_avg - first_avg) / first_avg

            if change > 0.1:
                return TrendDirection.INCREASING
            elif change < -0.1:
                return TrendDirection.DECREASING

        return TrendDirection.STABLE

    def _detect_anomalies(self) -> List[Anomaly]:
        """Detect anomalies in historical data."""
        anomalies = []

        if not self.config.enable_anomaly_detection:
            return anomalies

        n = len(self._historical_data)
        if n < 10:
            return anomalies

        # Calculate mean and std deviation
        values = [p.value for p in self._historical_data]
        mean = sum(values) / n
        variance = sum((v - mean) ** 2 for v in values) / n
        std_dev = math.sqrt(variance)

        if std_dev == 0:
            return anomalies

        # Find anomalies (more than 2 std deviations)
        for point in self._historical_data[-50:]:  # Check recent points
            deviation = abs(point.value - mean) / std_dev

            if deviation > 2.0:
                severity = "low"
                if deviation > 3.0:
                    severity = "high"
                elif deviation > 2.5:
                    severity = "medium"

                anomaly = Anomaly(
                    id=str(uuid.uuid4())[:8],
                    timestamp=point.timestamp,
                    value=point.value,
                    expected_value=mean,
                    deviation=deviation,
                    severity=severity
                )
                anomalies.append(anomaly)

        return anomalies

    def _calculate_metrics(self):
        """Calculate forecast metrics."""
        if len(self._historical_data) < 10:
            return

        # Split data into train and test
        split = int(len(self._historical_data) * 0.8)
        train_data = self._historical_data[:split]
        test_data = self._historical_data[split:]

        if not test_data:
            return

        # Calculate predictions for test period
        test_values = [p.value for p in test_data]
        predicted_value = sum(p.value for p in train_data[-7:]) / 7  # Simple average

        # Calculate errors
        errors = [abs(t - predicted_value) for t in test_values]
        mae = sum(errors) / len(errors)

        # MAPE
        non_zero = [t for t in test_values if t != 0]
        if non_zero:
            mape = sum(abs(t - predicted_value) / t for t in non_zero) / len(non_zero) * 100
        else:
            mape = 0

        # RMSE
        mse = sum(e * e for e in errors) / len(errors)
        rmse = math.sqrt(mse)

        self._metrics = ForecastMetrics(
            accuracy=max(0, 100 - mape),
            mape=mape,
            rmse=rmse,
            mae=mae
        )

    def generate_forecast(self) -> Optional[ForecastResult]:
        """Generate forecast based on configured model."""
        with self._lock:
            if len(self._historical_data) < self.config.min_data_points:
                return None

            # Select forecast method
            if self.config.model == ForecastModel.LINEAR:
                predictions = self._linear_forecast()
            elif self.config.model == ForecastModel.MOVING_AVERAGE:
                predictions = self._moving_average_forecast()
            elif self.config.model == ForecastModel.WEIGHTED_MOVING_AVERAGE:
                predictions = self._weighted_moving_average_forecast()
            elif self.config.model == ForecastModel.EXPONENTIAL:
                predictions = self._exponential_smoothing_forecast()
            else:
                predictions = self._linear_forecast()

            if not predictions:
                return None

            # Calculate metrics
            self._calculate_metrics()

            # Detect anomalies
            anomalies = self._detect_anomalies()

            # Calculate confidence
            confidence = self._calculate_confidence(predictions)

            # Detect trend
            trend = self._detect_trend()

            # Store predictions
            self._predictions = predictions

            # Check for seasonality (simple check)
            has_seasonality = len(self._historical_data) >= self.config.seasonality_period * 2

            return ForecastResult(
                model=self.config.model,
                predictions=predictions,
                horizon=self.config.horizon,
                confidence=confidence,
                trend=trend,
                seasonality=has_seasonality,
                anomaly_score=len(anomalies) / max(1, len(self._historical_data))
            )

    def get_historical_data(self) -> List[DataPoint]:
        """Get historical data."""
        with self._lock:
            return list(self._historical_data)

    def get_predictions(self) -> List[DataPoint]:
        """Get forecast predictions."""
        with self._lock:
            return list(self._predictions)

    def get_anomalies(self) -> List[Anomaly]:
        """Get detected anomalies."""
        with self._lock:
            return list(self._anomalies)

    def get_metrics(self) -> Dict[str, float]:
        """Get forecast metrics."""
        return {
            "accuracy": self._metrics.accuracy,
            "mape": self._metrics.mape,
            "rmse": self._metrics.rmse,
            "mae": self._metrics.mae
        }

    def clear_data(self):
        """Clear historical data."""
        with self._lock:
            self._historical_data.clear()
            self._predictions.clear()
            self._anomalies.clear()


class AgentForecast:
    """Agent resource forecasting system."""

    def __init__(self):
        self._lock = threading.RLock()
        self._forecasters: Dict[str, ForecastEngine] = {}
        self._configs: Dict[str, ForecastConfig] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def create_forecast(
        self,
        name: str,
        resource_type: ResourceType,
        model: ForecastModel = ForecastModel.LINEAR,
        horizon: ForecastHorizon = ForecastHorizon.SHORT_TERM,
        interval_seconds: int = 3600,
        min_data_points: int = 24,
        confidence_threshold: float = 0.8,
        enable_anomaly_detection: bool = True,
        seasonality_period: int = 24
    ) -> str:
        """Create a new forecast."""
        with self._lock:
            forecast_id = str(uuid.uuid4())[:8]

            config = ForecastConfig(
                name=name,
                resource_type=resource_type,
                model=model,
                horizon=horizon,
                interval_seconds=interval_seconds,
                min_data_points=min_data_points,
                confidence_threshold=confidence_threshold,
                enable_anomaly_detection=enable_anomaly_detection,
                seasonality_period=seasonality_period
            )

            forecaster = ForecastEngine(config)
            self._forecasters[forecast_id] = forecaster
            self._configs[forecast_id] = config

            return forecast_id

    def get_forecast(self, forecast_id: str) -> Optional[ForecastEngine]:
        """Get forecast by ID."""
        with self._lock:
            return self._forecasters.get(forecast_id)

    def delete_forecast(self, forecast_id: str) -> bool:
        """Delete a forecast."""
        with self._lock:
            if forecast_id in self._forecasters:
                del self._forecasters[forecast_id]
                if forecast_id in self._configs:
                    del self._configs[forecast_id]
                return True
            return False

    def list_forecasts(self) -> List[Dict[str, Any]]:
        """List all forecasts."""
        with self._lock:
            return [
                {
                    "id": fid,
                    "name": fc.name,
                    "resource_type": fc.resource_type.value,
                    "model": fc.model.value,
                    "horizon": fc.horizon.value,
                    "data_points": len(f._historical_data)
                }
                for fid, (f, fc) in zip(self._forecasters.keys(), [
                    (self._forecasters[fid], self._configs[fid])
                    for fid in self._forecasters.keys()
                ])
            ]

    def add_data_point(
        self,
        forecast_id: str,
        timestamp: float,
        value: float,
        metadata: Dict[str, Any] = None
    ) -> bool:
        """Add a data point to a forecast."""
        forecaster = self.get_forecast(forecast_id)
        if not forecaster:
            return False

        forecaster.add_data_point(timestamp, value, metadata)
        return True

    def generate_forecast(self, forecast_id: str) -> Optional[Dict[str, Any]]:
        """Generate forecast for a forecast ID."""
        forecaster = self.get_forecast(forecast_id)
        if not forecaster:
            return None

        result = forecaster.generate_forecast()
        if not result:
            return None

        return {
            "model": result.model.value,
            "predictions": [
                {"timestamp": p.timestamp, "value": p.value}
                for p in result.predictions
            ],
            "horizon": result.horizon.value,
            "confidence": result.confidence,
            "trend": result.trend.value,
            "seasonality": result.seasonality,
            "anomaly_score": result.anomaly_score
        }

    def get_historical_data(self, forecast_id: str) -> List[Dict[str, Any]]:
        """Get historical data for a forecast."""
        forecaster = self.get_forecast(forecast_id)
        if not forecaster:
            return []

        data = forecaster.get_historical_data()
        return [
            {"timestamp": p.timestamp, "value": p.value, "metadata": p.metadata}
            for p in data
        ]

    def get_predictions(self, forecast_id: str) -> List[Dict[str, Any]]:
        """Get predictions for a forecast."""
        forecaster = self.get_forecast(forecast_id)
        if not forecaster:
            return []

        predictions = forecaster.get_predictions()
        return [
            {"timestamp": p.timestamp, "value": p.value}
            for p in predictions
        ]

    def get_anomalies(self, forecast_id: str) -> List[Dict[str, Any]]:
        """Get anomalies for a forecast."""
        forecaster = self.get_forecast(forecast_id)
        if not forecaster:
            return []

        anomalies = forecaster.get_anomalies()
        return [
            {
                "id": a.id,
                "timestamp": a.timestamp,
                "value": a.value,
                "expected_value": a.expected_value,
                "deviation": a.deviation,
                "severity": a.severity
            }
            for a in anomalies
        ]

    def get_metrics(self, forecast_id: str) -> Optional[Dict[str, float]]:
        """Get forecast metrics."""
        forecaster = self.get_forecast(forecast_id)
        if not forecaster:
            return None
        return forecaster.get_metrics()

    def get_all_metrics(self) -> Dict[str, Dict[str, float]]:
        """Get metrics for all forecasts."""
        return {
            fid: f.get_metrics()
            for fid, f in self._forecasters.items()
        }

    def clear_forecast_data(self, forecast_id: str) -> bool:
        """Clear historical data for a forecast."""
        forecaster = self.get_forecast(forecast_id)
        if not forecaster:
            return False

        forecaster.clear_data()
        return True


# Global forecast instance
agent_forecast = AgentForecast()
