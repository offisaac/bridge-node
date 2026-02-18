"""Stock Fetcher Module for BridgeNode

Provides stock data fetching capabilities from Yahoo Finance API.
Supports real-time quotes, historical data, and cryptocurrency prices.
"""
import asyncio
import hashlib
import logging
from datetime import datetime, timedelta
from typing import List, Any

import aiohttp

logger = logging.getLogger(__name__)

# Supported stock symbols
SUPPORTED_SYMBOLS = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "BTC-USD", "ETH-USD"]

# Yahoo Finance API base URLs (multiple fallback options)
YAHOO_FINANCE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}?modules=price"

# Alternative free API: Twelve Data (requires key, but has free tier)
# Using a mock/simulation mode for demonstration when API is unavailable

# Exchange rate API (fallback)
EXCHANGE_RATE_URL = "https://api.exchangerate-api.com/v4/latest/USD"


class StockCache:
    """Simple in-memory cache for stock data."""

    def __init__(self, ttl_minutes: int = 5):
        self._cache: dict[str, tuple[datetime, dict[str, Any]]] = {}
        self._ttl = timedelta(minutes=ttl_minutes)

    def get(self, key: str) -> dict[str, Any] | None:
        """Get cached stock data."""
        if key not in self._cache:
            return None
        timestamp, data = self._cache[key]
        if datetime.now() - timestamp > self._ttl:
            del self._cache[key]
            return None
        return data

    def set(self, key: str, data: dict[str, Any]) -> None:
        """Set cached stock data."""
        self._cache[key] = (datetime.now(), data)

    def clear(self) -> None:
        """Clear all cached items."""
        self._cache.clear()


class StockFetcher:
    """Fetch stock data from Yahoo Finance."""

    def __init__(self, session: aiohttp.ClientSession | None = None, max_retries: int = 3):
        self._session = session
        self._cache = StockCache(ttl_minutes=5)
        self._timeout = aiohttp.ClientTimeout(total=30)
        self._max_retries = max_retries

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=self._timeout,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            )
        return self._session

    async def close(self) -> None:
        """Close HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()

    async def fetch_stock(self, symbol: str) -> dict[str, Any]:
        """Fetch stock data for a single symbol.

        Args:
            symbol: Stock symbol (e.g., "AAPL", "BTC-USD")

        Returns:
            Dict with stock data: symbol, price, change, changePercent,
            volume, marketCap, timestamp
        """
        cache_key = f"stock:{symbol.upper()}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        # Try Yahoo Finance Chart API first
        result = await self._fetch_from_yahoo_chart(symbol)
        if result and "error" not in result:
            self._cache.set(cache_key, result)
            return result

        # Fallback: Try Yahoo Finance Quote API
        result = await self._fetch_from_yahoo_quote(symbol)
        if result and "error" not in result:
            self._cache.set(cache_key, result)
            return result

        # If all APIs fail, return simulated data for demo
        logger.warning(f"All APIs failed for {symbol}, returning simulated data")
        return self._simulate_stock_data(symbol)

    async def _fetch_from_yahoo_chart(self, symbol: str) -> dict[str, Any] | None:
        """Fetch from Yahoo Finance chart API."""
        try:
            url = YAHOO_FINANCE_URL.format(symbol=symbol.upper())
            session = await self._get_session()

            for attempt in range(self._max_retries):
                async with session.get(url) as response:
                    if response.status == 429:
                        wait_time = 2 ** attempt
                        logger.warning(f"Rate limited for {symbol}, retrying in {wait_time}s...")
                        await asyncio.sleep(wait_time)
                        continue
                    elif response.status != 200:
                        logger.error(f"Failed to fetch stock {symbol}: HTTP {response.status}")
                        return self._error_response(symbol, f"HTTP error: {response.status}")
                    break

                data = await response.json()
                return self._parse_stock_data(symbol.upper(), data)

        except asyncio.TimeoutError:
            logger.error(f"Timeout fetching stock {symbol}")
            return self._error_response(symbol, "Request timeout")
        except aiohttp.ClientError as e:
            logger.error(f"Network error fetching stock {symbol}: {e}")
            return self._error_response(symbol, f"Network error: {str(e)}")
        except Exception as e:
            logger.error(f"Error fetching stock {symbol}: {e}")
            return self._error_response(symbol, str(e))

    async def _fetch_from_yahoo_quote(self, symbol: str) -> dict[str, Any] | None:
        """Fetch from Yahoo Finance quote API (fallback)."""
        try:
            url = YAHOO_QUOTE_URL.format(symbol=symbol.upper())
            session = await self._get_session()

            async with session.get(url) as response:
                if response.status != 200:
                    return None

                data = await response.json()
                return self._parse_quote_data(symbol.upper(), data)

        except Exception as e:
            logger.error(f"Error fetching quote for {symbol}: {e}")
            return None

    def _parse_stock_data(self, symbol: str, data: dict[str, Any]) -> dict[str, Any] | None:
        """Parse Yahoo Finance API response."""
        try:
            chart = data.get("chart", {})
            result = chart.get("result")

            if not result or len(result) == 0:
                logger.error(f"No data returned for {symbol}")
                return None

            result_data = result[0]
            meta = result_data.get("meta", {})
            indicators = result_data.get("indicators", {})
            quote = indicators.get("quote", [{}])[0]

            # Get current price and previous close
            current_price = meta.get("regularMarketPrice")
            previous_close = meta.get("previousClose") or meta.get("chartPreviousClose")

            # Calculate change and change percent
            change = 0.0
            change_percent = 0.0
            if current_price and previous_close:
                change = current_price - previous_close
                if previous_close != 0:
                    change_percent = (change / previous_close) * 100

            # Get volume
            volume = meta.get("regularMarketVolume") or quote.get("volume") or 0

            # Get market cap (not always available)
            market_cap = meta.get("marketCap", 0)

            # Get timestamp
            timestamp = meta.get("regularMarketTime")
            if timestamp:
                dt = datetime.fromtimestamp(timestamp)
                timestamp_str = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
            else:
                timestamp_str = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

            return {
                "symbol": symbol,
                "price": round(current_price, 2) if current_price else 0.0,
                "change": round(change, 2),
                "changePercent": round(change_percent, 2),
                "volume": int(volume) if volume else 0,
                "marketCap": int(market_cap) if market_cap else 0,
                "timestamp": timestamp_str
            }

        except (KeyError, IndexError, TypeError) as e:
            logger.error(f"Error parsing stock data for {symbol}: {e}")
            return None

    def _error_response(self, symbol: str, error: str) -> dict[str, Any]:
        """Create error response."""
        return {
            "symbol": symbol,
            "price": 0.0,
            "change": 0.0,
            "changePercent": 0.0,
            "volume": 0,
            "marketCap": 0,
            "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "error": error
        }

    def _parse_quote_data(self, symbol: str, data: dict[str, Any]) -> dict[str, Any] | None:
        """Parse Yahoo Finance quote summary API response."""
        try:
            quote = data.get("quoteSummary", {}).get("result", [{}])[0].get("price", {})

            if not quote:
                return None

            current_price = quote.get("regularMarketPrice", {}).get("raw")
            previous_close = quote.get("regularMarketPreviousClose", {}).get("raw")
            volume = quote.get("regularMarketVolume", {}).get("raw", 0)
            market_cap = quote.get("marketCap", {}).get("raw", 0)

            change = 0.0
            change_percent = 0.0
            if current_price and previous_close:
                change = current_price - previous_close
                if previous_close != 0:
                    change_percent = (change / previous_close) * 100

            timestamp = quote.get("regularMarketTime", 0)
            if timestamp:
                timestamp_str = datetime.fromtimestamp(timestamp).strftime("%Y-%m-%dT%H:%M:%SZ")
            else:
                timestamp_str = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

            return {
                "symbol": symbol,
                "price": round(current_price, 2) if current_price else 0.0,
                "change": round(change, 2),
                "changePercent": round(change_percent, 2),
                "volume": int(volume) if volume else 0,
                "marketCap": int(market_cap) if market_cap else 0,
                "timestamp": timestamp_str
            }

        except (KeyError, IndexError, TypeError) as e:
            logger.error(f"Error parsing quote data for {symbol}: {e}")
            return None

    def _simulate_stock_data(self, symbol: str) -> dict[str, Any]:
        """Generate simulated stock data when API is unavailable."""
        import random

        # Base prices for common symbols
        base_prices = {
            "AAPL": 185.0,
            "GOOGL": 175.0,
            "MSFT": 420.0,
            "AMZN": 185.0,
            "TSLA": 250.0,
            "BTC-USD": 65000.0,
            "ETH-USD": 3500.0
        }

        price = base_prices.get(symbol.upper(), 100.0)
        # Add small random variation
        price *= (1 + random.uniform(-0.02, 0.02))

        change = random.uniform(-5.0, 5.0)
        change_percent = (change / price) * 100

        volume = random.randint(10000000, 100000000)
        market_cap = int(price * random.randint(1000000000, 5000000000))

        return {
            "symbol": symbol.upper(),
            "price": round(price, 2),
            "change": round(change, 2),
            "changePercent": round(change_percent, 2),
            "volume": volume,
            "marketCap": market_cap,
            "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "simulated": True
        }

    async def fetch_multiple(self, symbols: List[str]) -> dict[str, dict[str, Any]]:
        """Fetch stock data for multiple symbols concurrently.

        Args:
            symbols: List of stock symbols

        Returns:
            Dict mapping symbol to stock data
        """
        # Filter valid symbols and remove duplicates
        valid_symbols = list(set(s.upper() for s in symbols if s))

        tasks = [self.fetch_stock(symbol) for symbol in valid_symbols]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        output = {}
        for symbol, result in zip(valid_symbols, results):
            if isinstance(result, Exception):
                logger.error(f"Error fetching {symbol}: {result}")
                output[symbol] = self._error_response(symbol, str(result))
            else:
                output[symbol] = result

        return output

    async def fetch_all_supported(self) -> dict[str, dict[str, Any]]:
        """Fetch data for all supported stock symbols.

        Returns:
            Dict mapping symbol to stock data
        """
        return await self.fetch_multiple(SUPPORTED_SYMBOLS)

    async def get_exchange_rate(self, base: str = "USD", target: str = "CNY") -> float | None:
        """Fetch exchange rate from USD to target currency.

        Args:
            base: Base currency code (default: USD)
            target: Target currency code (default: CNY)

        Returns:
            Exchange rate or None on error
        """
        cache_key = f"exchange:{base}:{target}"
        cached = self._cache.get(cache_key)
        if cached:
            return cached.get("rate")

        try:
            url = EXCHANGE_RATE_URL.format(base=base)
            session = await self._get_session()

            async with session.get(url) as response:
                if response.status != 200:
                    logger.error(f"Failed to fetch exchange rate: HTTP {response.status}")
                    return None

                data = await response.json()
                rate = data.get("rates", {}).get(target)

                if rate:
                    self._cache.set(cache_key, {"rate": rate})

                return rate

        except Exception as e:
            logger.error(f"Error fetching exchange rate: {e}")
            return None


async def create_stock_fetcher() -> StockFetcher:
    """Create a configured stock fetcher instance."""
    return StockFetcher()


# Convenience functions for quick usage
async def fetch_stock(symbol: str) -> dict[str, Any]:
    """Fetch stock data for a single symbol."""
    fetcher = await create_stock_fetcher()
    try:
        return await fetcher.fetch_stock(symbol)
    finally:
        await fetcher.close()


async def fetch_multiple(symbols: List[str]) -> dict[str, dict[str, Any]]:
    """Fetch stock data for multiple symbols."""
    fetcher = await create_stock_fetcher()
    try:
        return await fetcher.fetch_multiple(symbols)
    finally:
        await fetcher.close()


async def fetch_all_supported() -> dict[str, dict[str, Any]]:
    """Fetch all supported stock symbols."""
    fetcher = await create_stock_fetcher()
    try:
        return await fetcher.fetch_all_supported()
    finally:
        await fetcher.close()
