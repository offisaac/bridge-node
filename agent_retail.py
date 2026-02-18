"""Agent Retail Module

Retail domain agents including store sales analysis, inventory optimization,
customer behavior analysis, promotion optimization, membership management,
supply chain coordination, store location analysis, competitor monitoring,
e-commerce platform integration, and display optimization.
"""

import time
import uuid
import threading
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


# ============== Enums ==============

class SalesMetricType(str, Enum):
    """Sales metric types."""
    REVENUE = "revenue"
    TRANSACTIONS = "transactions"
    UNITS_SOLD = "units_sold"
    AVERAGE_ORDER_VALUE = "average_order_value"
    CONVERSION_RATE = "conversion_rate"


class InventoryStatus(str, Enum):
    """Inventory status types."""
    IN_STOCK = "in_stock"
    LOW_STOCK = "low_stock"
    OUT_OF_STOCK = "out_of_stock"
    OVERSTOCKED = "overstocked"
    REORDERING = "reordering"


class CustomerSegment(str, Enum):
    """Customer segment types."""
    VIP = "vip"
    REGULAR = "regular"
    NEW = "new"
    AT_RISK = "at_risk"
    INACTIVE = "inactive"


class PromotionType(str, Enum):
    """Promotion types."""
    DISCOUNT = "discount"
    BUNDLE = "bundle"
    BOGO = "bogo"
    LOYALTY_REWARD = "loyalty_reward"
    SEASONAL = "seasonal"
    FLASH_SALE = "flash_sale"


class MembershipTier(str, Enum):
    """Membership tier types."""
    PLATINUM = "platinum"
    GOLD = "gold"
    SILVER = "silver"
    BRONZE = "bronze"
    BASIC = "basic"


class SupplyChainStatus(str, Enum):
    """Supply chain status types."""
    PENDING = "pending"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    DELAYED = "delayed"
    CANCELLED = "cancelled"


class LocationScore(str, Enum):
    """Location score types."""
    EXCELLENT = "excellent"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"


class CompetitorMetric(str, Enum):
    """Competitor metric types."""
    PRICE = "price"
    PRODUCT_RANGE = "product_range"
    MARKET_PRESENCE = "market_presence"
    PROMOTIONS = "promotions"
    REVIEWS = "reviews"


class EcommercePlatform(str, Enum):
    """E-commerce platform types."""
    SHOPIFY = "shopify"
    WOOCOMMERCE = "woocommerce"
    MAGENTO = "magento"
    AMAZON = "amazon"
    EBAY = "ebay"
    CUSTOM = "custom"


class DisplayZone(str, Enum):
    """Display zone types."""
    ENTRANCE = "entrance"
    CHECKOUT = "checkout"
    AISLE = "aisle"
    WINDOW = "window"
    END_CAP = "end_cap"


# ============== Dataclasses ==============

@dataclass
class SalesData:
    """Sales data."""
    id: str
    store_id: str
    product_id: str
    quantity: int
    revenue: float
    timestamp: float
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SalesMetrics:
    """Sales metrics."""
    total_revenue: float
    transaction_count: int
    units_sold: int
    average_order_value: float
    conversion_rate: float
    period: str


@dataclass
class InventoryItem:
    """Inventory item."""
    id: str
    product_id: str
    store_id: str
    quantity: int
    reorder_point: int
    status: InventoryStatus
    last_updated: float


@dataclass
class InventoryRecommendation:
    """Inventory optimization recommendation."""
    product_id: str
    current_stock: int
    recommended_stock: int
    action: str  # restock, reduce, maintain
    reason: str


@dataclass
class CustomerProfile:
    """Customer profile."""
    id: str
    name: str
    email: str
    segment: CustomerSegment
    total_spent: float
    visit_count: int
    last_visit: float
    tags: List[str] = field(default_factory=list)


@dataclass
class CustomerBehavior:
    """Customer behavior analysis."""
    customer_id: str
    browsing_patterns: List[str]
    purchase_history: List[str]
    preferences: Dict[str, Any]
    churn_risk: float


@dataclass
class Promotion:
    """Promotion data."""
    id: str
    name: str
    type: PromotionType
    discount_percent: float
    start_date: float
    end_date: float
    target_products: List[str]
    status: str  # active, scheduled, expired


@dataclass
class PromotionPerformance:
    """Promotion performance metrics."""
    promotion_id: str
    revenue_lift: float
    units_lift: int
    customer_acquisition: int
    roi: float


@dataclass
class Member:
    """Membership data."""
    id: str
    customer_id: str
    tier: MembershipTier
    points: int
    join_date: float
    expiration_date: float
    benefits: List[str] = field(default_factory=list)


@dataclass
class SupplyOrder:
    """Supply order data."""
    id: str
    supplier_id: str
    product_ids: List[str]
    quantities: List[int]
    status: SupplyChainStatus
    order_date: float
    expected_delivery: float
    actual_delivery: float = 0.0


@dataclass
class StoreLocation:
    """Store location data."""
    id: str
    address: str
    latitude: float
    longitude: float
    score: LocationScore
    population_density: int
    competitor_count: int
    foot_traffic: int


@dataclass
class LocationAnalysis:
    """Store location analysis result."""
    location_id: str
    score: float
    strengths: List[str]
    weaknesses: List[str]
    recommendations: List[str]


@dataclass
class CompetitorInfo:
    """Competitor information."""
    id: str
    name: str
    location: str
    metrics: Dict[CompetitorMetric, Any]
    last_updated: float


@dataclass
class CompetitorReport:
    """Competitor monitoring report."""
    competitor_id: str
    price_changes: List[Dict[str, Any]]
    new_products: List[str]
    promotions: List[str]
    market_share_estimate: float


@dataclass
class EcommerceOrder:
    """E-commerce order."""
    id: str
    platform: EcommercePlatform
    customer_id: str
    items: List[Dict[str, Any]]
    total: float
    status: str
    created_at: float


@dataclass
class EcommerceSync:
    """E-commerce sync status."""
    platform: EcommercePlatform
    last_sync: float
    orders_synced: int
    products_synced: int
    status: str


@dataclass
class DisplayConfig:
    """Display configuration."""
    id: str
    zone: DisplayZone
    product_ids: List[str]
    layout: str
    start_date: float
    end_date: float


@dataclass
class DisplayPerformance:
    """Display performance metrics."""
    config_id: str
    zone: DisplayZone
    sales_lift: float
    visibility_score: float
    customer_interaction: int


# ============== Managers ==============

class SalesAnalysisManager:
    """Store sales analysis engine."""

    def __init__(self):
        self._lock = threading.RLock()
        self._sales_data: Dict[str, SalesData] = {}
        self._metrics_cache: Dict[str, SalesMetrics] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_sales_data(self, data: SalesData) -> str:
        with self._lock:
            self._sales_data[data.id] = data
            self._invalidate_cache(data.store_id)
        self._trigger_hook("sales_added", data)
        return data.id

    def get_sales_metrics(self, store_id: str, period: str = "daily") -> SalesMetrics:
        with self._lock:
            cache_key = f"{store_id}:{period}"
            if cache_key in self._metrics_cache:
                return self._metrics_cache[cache_key]

            store_sales = [s for s in self._sales_data.values() if s.store_id == store_id]
            total_revenue = sum(s.revenue for s in store_sales)
            transaction_count = len(store_sales)
            units_sold = sum(s.quantity for s in store_sales)
            average_order_value = total_revenue / transaction_count if transaction_count > 0 else 0.0

            metrics = SalesMetrics(
                total_revenue=total_revenue,
                transaction_count=transaction_count,
                units_sold=units_sold,
                average_order_value=average_order_value,
                conversion_rate=0.0,
                period=period
            )
            self._metrics_cache[cache_key] = metrics
            return metrics

    def _invalidate_cache(self, store_id: str):
        keys_to_remove = [k for k in self._metrics_cache.keys() if k.startswith(store_id)]
        for key in keys_to_remove:
            del self._metrics_cache[key]

    def register_hook(self, event: str, callback: Callable):
        self._hooks[event].append(callback)

    def _trigger_hook(self, event: str, data: Any):
        for callback in self._hooks.get(event, []):
            try:
                callback(data)
            except Exception:
                pass


class InventoryManager:
    """Inventory optimization engine."""

    def __init__(self):
        self._lock = threading.RLock()
        self._inventory: Dict[str, InventoryItem] = {}
        self._recommendations: List[InventoryRecommendation] = []
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_inventory_item(self, item: InventoryItem) -> str:
        with self._lock:
            self._inventory[item.id] = item
            self._generate_recommendations()
        self._trigger_hook("inventory_updated", item)
        return item.id

    def get_inventory_status(self, product_id: str = None) -> List[InventoryItem]:
        with self._lock:
            if product_id:
                return [item for item in self._inventory.values() if item.product_id == product_id]
            return list(self._inventory.values())

    def get_recommendations(self, store_id: str = None) -> List[InventoryRecommendation]:
        with self._lock:
            if store_id:
                store_items = [item for item in self._inventory.values() if item.store_id == store_id]
                product_ids = [item.product_id for item in store_items]
                return [rec for rec in self._recommendations if rec.product_id in product_ids]
            return self._recommendations

    def _generate_recommendations(self):
        self._recommendations = []
        for item in self._inventory.values():
            if item.status == InventoryStatus.OUT_OF_STOCK:
                self._recommendations.append(InventoryRecommendation(
                    product_id=item.product_id,
                    current_stock=item.quantity,
                    recommended_stock=item.reorder_point * 2,
                    action="restock",
                    reason="Item is out of stock"
                ))
            elif item.status == InventoryStatus.OVERSTOCKED:
                self._recommendations.append(InventoryRecommendation(
                    product_id=item.product_id,
                    current_stock=item.quantity,
                    recommended_stock=item.reorder_point,
                    action="reduce",
                    reason="Item is overstocked"
                ))

    def register_hook(self, event: str, callback: Callable):
        self._hooks[event].append(callback)

    def _trigger_hook(self, event: str, data: Any):
        for callback in self._hooks.get(event, []):
            try:
                callback(data)
            except Exception:
                pass


class CustomerBehaviorManager:
    """Customer behavior analysis engine."""

    def __init__(self):
        self._lock = threading.RLock()
        self._customers: Dict[str, CustomerProfile] = {}
        self._behaviors: Dict[str, CustomerBehavior] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_customer(self, profile: CustomerProfile) -> str:
        with self._lock:
            self._customers[profile.id] = profile
        self._trigger_hook("customer_added", profile)
        return profile.id

    def get_customer(self, customer_id: str) -> Optional[CustomerProfile]:
        with self._lock:
            return self._customers.get(customer_id)

    def analyze_behavior(self, customer_id: str) -> Optional[CustomerBehavior]:
        with self._lock:
            return self._behaviors.get(customer_id)

    def update_behavior(self, behavior: CustomerBehavior) -> str:
        with self._lock:
            self._behaviors[behavior.customer_id] = behavior
        self._trigger_hook("behavior_updated", behavior)
        return behavior.customer_id

    def get_segment_customers(self, segment: CustomerSegment) -> List[CustomerProfile]:
        with self._lock:
            return [c for c in self._customers.values() if c.segment == segment]

    def register_hook(self, event: str, callback: Callable):
        self._hooks[event].append(callback)

    def _trigger_hook(self, event: str, data: Any):
        for callback in self._hooks.get(event, []):
            try:
                callback(data)
            except Exception:
                pass


class PromotionManager:
    """Promotion optimization engine."""

    def __init__(self):
        self._lock = threading.RLock()
        self._promotions: Dict[str, Promotion] = {}
        self._performance: Dict[str, PromotionPerformance] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def create_promotion(self, promotion: Promotion) -> str:
        with self._lock:
            self._promotions[promotion.id] = promotion
        self._trigger_hook("promotion_created", promotion)
        return promotion.id

    def get_promotion(self, promotion_id: str) -> Optional[Promotion]:
        with self._lock:
            return self._promotions.get(promotion_id)

    def get_active_promotions(self) -> List[Promotion]:
        with self._lock:
            now = time.time()
            return [p for p in self._promotions.values()
                   if p.status == "active" and p.start_date <= now <= p.end_date]

    def record_performance(self, performance: PromotionPerformance) -> str:
        with self._lock:
            self._performance[performance.promotion_id] = performance
        self._trigger_hook("performance_recorded", performance)
        return performance.promotion_id

    def get_performance(self, promotion_id: str) -> Optional[PromotionPerformance]:
        with self._lock:
            return self._performance.get(promotion_id)

    def optimize_promotion(self, promotion_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            perf = self._performance.get(promotion_id)
            if not perf:
                return None
            return {
                "promotion_id": promotion_id,
                "optimal_discount": min(perf.discount_percent * 1.1, 50.0) if perf.roi < 2.0 else perf.discount_percent,
                "target_audience": "high_value_customers",
                "recommended_duration": 7 if perf.roi < 1.5 else 14
            }

    def register_hook(self, event: str, callback: Callable):
        self._hooks[event].append(callback)

    def _trigger_hook(self, event: str, data: Any):
        for callback in self._hooks.get(event, []):
            try:
                callback(data)
            except Exception:
                pass


class MembershipManager:
    """Membership management engine."""

    def __init__(self):
        self._lock = threading.RLock()
        self._members: Dict[str, Member] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_member(self, member: Member) -> str:
        with self._lock:
            self._members[member.id] = member
        self._trigger_hook("member_added", member)
        return member.id

    def get_member(self, member_id: str) -> Optional[Member]:
        with self._lock:
            return self._members.get(member_id)

    def get_tier_members(self, tier: MembershipTier) -> List[Member]:
        with self._lock:
            return [m for m in self._members.values() if m.tier == tier]

    def update_points(self, member_id: str, points_delta: int) -> Optional[Member]:
        with self._lock:
            member = self._members.get(member_id)
            if not member:
                return None
            member.points += points_delta
            self._check_tier_upgrade(member)
        self._trigger_hook("points_updated", member)
        return member

    def _check_tier_upgrade(self, member: Member):
        tier_thresholds = {
            MembershipTier.PLATINUM: 50000,
            MembershipTier.GOLD: 25000,
            MembershipTier.SILVER: 10000,
            MembershipTier.BRONZE: 5000,
            MembershipTier.BASIC: 0
        }
        for tier, threshold in tier_thresholds.items():
            if member.points >= threshold and member.tier != tier:
                member.tier = tier
                self._trigger_hook("tier_upgraded", member)
                break

    def get_member_benefits(self, member_id: str) -> List[str]:
        with self._lock:
            member = self._members.get(member_id)
            if not member:
                return []
            benefits_map = {
                MembershipTier.PLATINUM: ["free_shipping", "priority_support", "exclusive_offers", "early_access", "birthday_bonus"],
                MembershipTier.GOLD: ["free_shipping", "priority_support", "exclusive_offers"],
                MembershipTier.SILVER: ["free_shipping", "priority_support"],
                MembershipTier.BRONZE: ["free_shipping"],
                MembershipTier.BASIC: ["member_discount"]
            }
            return benefits_map.get(member.tier, [])

    def register_hook(self, event: str, callback: Callable):
        self._hooks[event].append(callback)

    def _trigger_hook(self, event: str, data: Any):
        for callback in self._hooks.get(event, []):
            try:
                callback(data)
            except Exception:
                pass


class SupplyChainManager:
    """Supply chain coordination engine."""

    def __init__(self):
        self._lock = threading.RLock()
        self._orders: Dict[str, SupplyOrder] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def create_order(self, order: SupplyOrder) -> str:
        with self._lock:
            self._orders[order.id] = order
        self._trigger_hook("order_created", order)
        return order.id

    def get_order(self, order_id: str) -> Optional[SupplyOrder]:
        with self._lock:
            return self._orders.get(order_id)

    def update_status(self, order_id: str, status: SupplyChainStatus) -> Optional[SupplyOrder]:
        with self._lock:
            order = self._orders.get(order_id)
            if not order:
                return None
            order.status = status
            if status == SupplyChainStatus.DELIVERED:
                order.actual_delivery = time.time()
        self._trigger_hook("status_updated", order)
        return order

    def get_pending_orders(self) -> List[SupplyOrder]:
        with self._lock:
            return [o for o in self._orders.values() if o.status == SupplyChainStatus.PENDING]

    def get_delayed_orders(self) -> List[SupplyOrder]:
        with self._lock:
            now = time.time()
            return [o for o in self._orders.values()
                   if o.status == SupplyChainStatus.IN_TRANSIT and o.expected_delivery < now]

    def optimize_delivery(self, order_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            order = self._orders.get(order_id)
            if not order:
                return None
            return {
                "order_id": order_id,
                "suggested_route": "express",
                "estimated_savings": "15%",
                "alternative_suppliers": ["supplier_b", "supplier_c"]
            }

    def register_hook(self, event: str, callback: Callable):
        self._hooks[event].append(callback)

    def _trigger_hook(self, event: str, data: Any):
        for callback in self._hooks.get(event, []):
            try:
                callback(data)
            except Exception:
                pass


class LocationAnalysisManager:
    """Store location analysis engine."""

    def __init__(self):
        self._lock = threading.RLock()
        self._locations: Dict[str, StoreLocation] = {}
        self._analyses: Dict[str, LocationAnalysis] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_location(self, location: StoreLocation) -> str:
        with self._lock:
            self._locations[location.id] = location
        self._trigger_hook("location_added", location)
        return location.id

    def get_location(self, location_id: str) -> Optional[StoreLocation]:
        with self._lock:
            return self._locations.get(location_id)

    def analyze_location(self, location_id: str) -> Optional[LocationAnalysis]:
        with self._lock:
            location = self._locations.get(location_id)
            if not location:
                return None

            score = 0.0
            strengths = []
            weaknesses = []

            if location.population_density > 10000:
                score += 0.3
                strengths.append("High population density")
            else:
                weaknesses.append("Low population density")

            if location.competitor_count < 3:
                score += 0.3
                strengths.append("Low competition")
            else:
                weaknesses.append("High competition")

            if location.foot_traffic > 5000:
                score += 0.4
                strengths.append("High foot traffic")
            else:
                weaknesses.append("Low foot traffic")

            analysis = LocationAnalysis(
                location_id=location_id,
                score=min(score, 1.0),
                strengths=strengths,
                weaknesses=weaknesses,
                recommendations=["Consider promotional activities"] if score < 0.5 else ["Location is optimal"]
            )
            self._analyses[location_id] = analysis
            return analysis

    def compare_locations(self, location_ids: List[str]) -> List[LocationAnalysis]:
        results = []
        for loc_id in location_ids:
            analysis = self.analyze_location(loc_id)
            if analysis:
                results.append(analysis)
        return results

    def find_optimal_locations(self, criteria: Dict[str, Any]) -> List[StoreLocation]:
        with self._lock:
            results = []
            for loc in self._locations.values():
                if loc.score in [LocationScore.EXCELLENT, LocationScore.GOOD]:
                    results.append(loc)
            return results[:10]

    def register_hook(self, event: str, callback: Callable):
        self._hooks[event].append(callback)

    def _trigger_hook(self, event: str, data: Any):
        for callback in self._hooks.get(event, []):
            try:
                callback(data)
            except Exception:
                pass


class CompetitorMonitor:
    """Competitor monitoring engine."""

    def __init__(self):
        self._lock = threading.RLock()
        self._competitors: Dict[str, CompetitorInfo] = {}
        self._reports: Dict[str, List[CompetitorReport]] = defaultdict(list)
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_competitor(self, info: CompetitorInfo) -> str:
        with self._lock:
            self._competitors[info.id] = info
        self._trigger_hook("competitor_added", info)
        return info.id

    def get_competitor(self, competitor_id: str) -> Optional[CompetitorInfo]:
        with self._lock:
            return self._competitors.get(competitor_id)

    def get_all_competitors(self) -> List[CompetitorInfo]:
        with self._lock:
            return list(self._competitors.values())

    def add_report(self, report: CompetitorReport) -> str:
        with self._lock:
            self._reports[report.competitor_id].append(report)
        self._trigger_hook("report_added", report)
        return report.competitor_id

    def get_latest_report(self, competitor_id: str) -> Optional[CompetitorReport]:
        with self._lock:
            reports = self._reports.get(competitor_id, [])
            return reports[-1] if reports else None

    def get_price_comparison(self, product_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            comparison = []
            for comp in self._competitors.values():
                if CompetitorMetric.PRICE in comp.metrics:
                    comparison.append({
                        "competitor": comp.name,
                        "price": comp.metrics[CompetitorMetric.PRICE]
                    })
            return comparison

    def analyze_market_position(self) -> Dict[str, Any]:
        with self._lock:
            total_presence = sum(
                c.metrics.get(CompetitorMetric.MARKET_PRESENCE, 0)
                for c in self._competitors.values()
            )
            return {
                "total_competitors": len(self._competitors),
                "total_market_presence": total_presence,
                "average_presence": total_presence / len(self._competitors) if self._competitors else 0
            }

    def register_hook(self, event: str, callback: Callable):
        self._hooks[event].append(callback)

    def _trigger_hook(self, event: str, data: Any):
        for callback in self._hooks.get(event, []):
            try:
                callback(data)
            except Exception:
                pass


class EcommerceIntegration:
    """E-commerce platform integration engine."""

    def __init__(self):
        self._lock = threading.RLock()
        self._orders: Dict[str, EcommerceOrder] = {}
        self._syncs: Dict[EcommercePlatform, EcommerceSync] = {}
        self._platform_configs: Dict[EcommercePlatform, Dict[str, Any]] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_order(self, order: EcommerceOrder) -> str:
        with self._lock:
            self._orders[order.id] = order
        self._trigger_hook("order_added", order)
        return order.id

    def get_order(self, order_id: str) -> Optional[EcommerceOrder]:
        with self._lock:
            return self._orders.get(order_id)

    def get_platform_orders(self, platform: EcommercePlatform) -> List[EcommerceOrder]:
        with self._lock:
            return [o for o in self._orders.values() if o.platform == platform]

    def sync_platform(self, platform: EcommercePlatform) -> EcommerceSync:
        with self._lock:
            sync = EcommerceSync(
                platform=platform,
                last_sync=time.time(),
                orders_synced=len([o for o in self._orders.values() if o.platform == platform]),
                products_synced=0,
                status="success"
            )
            self._syncs[platform] = sync
        self._trigger_hook("platform_synced", sync)
        return sync

    def get_sync_status(self, platform: EcommercePlatform) -> Optional[EcommerceSync]:
        with self._lock:
            return self._syncs.get(platform)

    def configure_platform(self, platform: EcommercePlatform, config: Dict[str, Any]) -> bool:
        with self._lock:
            self._platform_configs[platform] = config
        self._trigger_hook("platform_configured", {"platform": platform, "config": config})
        return True

    def get_platform_config(self, platform: EcommercePlatform) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._platform_configs.get(platform)

    def aggregate_sales(self) -> Dict[str, float]:
        with self._lock:
            sales_by_platform = {}
            for order in self._orders.values():
                platform_name = order.platform.value
                sales_by_platform[platform_name] = sales_by_platform.get(platform_name, 0) + order.total
            return sales_by_platform

    def register_hook(self, event: str, callback: Callable):
        self._hooks[event].append(callback)

    def _trigger_hook(self, event: str, data: Any):
        for callback in self._hooks.get(event, []):
            try:
                callback(data)
            except Exception:
                pass


class DisplayOptimizer:
    """Display optimization engine."""

    def __init__(self):
        self._lock = threading.RLock()
        self._configs: Dict[str, DisplayConfig] = {}
        self._performances: Dict[str, List[DisplayPerformance]] = defaultdict(list)
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_config(self, config: DisplayConfig) -> str:
        with self._lock:
            self._configs[config.id] = config
        self._trigger_hook("config_added", config)
        return config.id

    def get_config(self, config_id: str) -> Optional[DisplayConfig]:
        with self._lock:
            return self._configs.get(config_id)

    def get_zone_configs(self, zone: DisplayZone) -> List[DisplayConfig]:
        with self._lock:
            return [c for c in self._configs.values() if c.zone == zone]

    def record_performance(self, performance: DisplayPerformance) -> str:
        with self._lock:
            self._performances[performance.config_id].append(performance)
        self._trigger_hook("performance_recorded", performance)
        return performance.config_id

    def get_performance_summary(self, config_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            perfs = self._performances.get(config_id, [])
            if not perfs:
                return None
            return {
                "config_id": config_id,
                "average_sales_lift": sum(p.sales_lift for p in perfs) / len(perfs),
                "average_visibility": sum(p.visibility_score for p in perfs) / len(perfs),
                "total_interactions": sum(p.customer_interaction for p in perfs)
            }

    def optimize_display(self, zone: DisplayZone) -> Optional[Dict[str, Any]]:
        with self._lock:
            zone_configs = self.get_zone_configs(zone)
            if not zone_configs:
                return None

            best_config = None
            best_score = -1

            for config in zone_configs:
                perfs = self._performances.get(config.id, [])
                if perfs:
                    avg_lift = sum(p.sales_lift for p in perfs) / len(perfs)
                    if avg_lift > best_score:
                        best_score = avg_lift
                        best_config = config

            if best_config:
                return {
                    "config_id": best_config.id,
                    "recommended_products": best_config.product_ids,
                    "expected_lift": best_score,
                    "optimization_tips": [
                        "Place high-margin items at eye level",
                        "Use contrasting colors for promotions",
                        "Limit to 3-4 products per display"
                    ]
                }
            return None

    def register_hook(self, event: str, callback: Callable):
        self._hooks[event].append(callback)

    def _trigger_hook(self, event: str, data: Any):
        for callback in self._hooks.get(event, []):
            try:
                callback(data)
            except Exception:
                pass


# ============== Main Agent Class ==============

class AgentRetail:
    """Main Retail Agent coordinating all retail operations."""

    def __init__(self):
        self.sales_analysis = SalesAnalysisManager()
        self.inventory = InventoryManager()
        self.customer_behavior = CustomerBehaviorManager()
        self.promotions = PromotionManager()
        self.membership = MembershipManager()
        self.supply_chain = SupplyChainManager()
        self.location_analysis = LocationAnalysisManager()
        self.competitor_monitor = CompetitorMonitor()
        self.ecommerce = EcommerceIntegration()
        self.display_optimizer = DisplayOptimizer()
        self._lock = threading.RLock()
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "sales_analysis_active": True,
                "inventory_tracking_active": True,
                "customer_behavior_active": True,
                "promotions_active": True,
                "membership_active": True,
                "supply_chain_active": True,
                "location_analysis_active": True,
                "competitor_monitor_active": True,
                "ecommerce_integration_active": True,
                "display_optimizer_active": True
            }

    def register_hook(self, event: str, callback: Callable):
        self._hooks[event].append(callback)

    def _trigger_hook(self, event: str, data: Any):
        for callback in self._hooks.get(event, []):
            try:
                callback(data)
            except Exception:
                pass


# Global instance
agent_retail = AgentRetail()
