/**
 * Agent Crypto - Cryptocurrency Agent
 *
 * Cryptocurrency operations with trading, portfolio, and market data.
 *
 * Usage: node agent-crypto.js [command]
 * Commands:
 *   demo        - Run demonstration
 *   price       - Get price
 *   portfolio   - Show portfolio
 */

class CryptoAsset {
  constructor(config) {
    this.symbol = config.symbol;
    this.name = config.name;
    this.price = config.price;
    this.change24h = config.change24h || 0;
    this.volume24h = config.volume24h || 0;
    this.marketCap = config.marketCap || 0;
    this.rank = config.rank || 0;
    this.holdings = config.holdings || 0;
  }

  get value() {
    return this.price * this.holdings;
  }
}

class CryptoWallet {
  constructor(config) {
    this.id = `wallet-${Date.now()}`;
    this.name = config.name;
    this.address = config.address;
    this.balances = new Map();
    this.totalValue = 0;
  }

  addBalance(symbol, amount) {
    this.balances.set(symbol, (this.balances.get(symbol) || 0) + amount);
  }

  getBalance(symbol) {
    return this.balances.get(symbol) || 0;
  }
}

class TradeOrder {
  constructor(config) {
    this.id = `order-${Date.now()}`;
    this.type = config.type; // market, limit, stop
    this.side = config.side; // buy, sell
    this.symbol = config.symbol;
    this.amount = config.amount;
    this.price = config.price;
    this.status = 'pending';
    this.filled = 0;
    this.createdAt = Date.now();
  }
}

class Portfolio {
  constructor(config = {}) {
    this.id = `portfolio-${Date.now()}`;
    this.name = config.name || 'Main Portfolio';
    this.assets = new Map();
    this.transactions = [];
    this.totalValue = 0;
    this.totalPnL = 0;
  }

  addAsset(symbol, amount, avgPrice) {
    const existing = this.assets.get(symbol);
    if (existing) {
      const newAmount = existing.amount + amount;
      const newAvgPrice = (existing.amount * existing.avgPrice + amount * avgPrice) / newAmount;
      this.assets.set(symbol, { amount: newAmount, avgPrice: newAvgPrice });
    } else {
      this.assets.set(symbol, { amount, avgPrice });
    }
  }

  removeAsset(symbol, amount) {
    const existing = this.assets.get(symbol);
    if (existing && existing.amount >= amount) {
      existing.amount -= amount;
      if (existing.amount === 0) {
        this.assets.delete(symbol);
      }
    }
  }

  getAsset(symbol) {
    return this.assets.get(symbol);
  }
}

class CryptoAgent {
  constructor(config = {}) {
    this.assets = new Map();
    this.wallets = new Map();
    this.portfolios = new Map();
    this.orders = new Map();
    this.stats = {
      trades: 0,
      volume: 0,
      profit: 0,
      loss: 0
    };

    this.initializeMarket();
  }

  initializeMarket() {
    const marketData = [
      { symbol: 'BTC', name: 'Bitcoin', price: 52000, change24h: 2.5, volume24h: 28000000000, marketCap: 1020000000000, rank: 1 },
      { symbol: 'ETH', name: 'Ethereum', price: 2800, change24h: 3.2, volume24h: 15000000000, marketCap: 336000000000, rank: 2 },
      { symbol: 'BNB', name: 'Binance Coin', price: 580, change24h: -1.2, volume24h: 1200000000, marketCap: 87000000000, rank: 3 },
      { symbol: 'SOL', name: 'Solana', price: 120, change24h: 5.8, volume24h: 2500000000, marketCap: 52000000000, rank: 4 },
      { symbol: 'XRP', name: 'Ripple', price: 0.55, change24h: 1.5, volume24h: 1500000000, marketCap: 28000000000, rank: 5 },
      { symbol: 'ADA', name: 'Cardano', price: 0.45, change24h: -0.8, volume24h: 400000000, marketCap: 16000000000, rank: 6 },
      { symbol: 'DOGE', name: 'Dogecoin', price: 0.08, change24h: 4.2, volume24h: 600000000, marketCap: 11000000000, rank: 7 },
      { symbol: 'DOT', name: 'Polkadot', price: 7.2, change24h: 2.1, volume24h: 300000000, marketCap: 9000000000, rank: 8 },
      { symbol: 'MATIC', name: 'Polygon', price: 0.85, change24h: -2.5, volume24h: 280000000, marketCap: 7800000000, rank: 9 },
      { symbol: 'LINK', name: 'Chainlink', price: 15, change24h: 1.8, volume24h: 450000000, marketCap: 7000000000, rank: 10 }
    ];

    marketData.forEach(m => this.assets.set(m.symbol, new CryptoAsset(m)));
  }

  getPrice(symbol) {
    const asset = this.assets.get(symbol.toUpperCase());
    return asset ? asset.price : null;
  }

  getMarketData(symbol) {
    return this.assets.get(symbol.toUpperCase());
  }

  getTopGainers() {
    return Array.from(this.assets.values())
      .sort((a, b) => b.change24h - a.change24h)
      .slice(0, 5);
  }

  getTopLosers() {
    return Array.from(this.assets.values())
      .sort((a, b) => a.change24h - b.change24h)
      .slice(0, 5);
  }

  createWallet(name) {
    const address = `0x${Math.random().toString(16).substr(2, 40)}`;
    const wallet = new CryptoWallet({ name, address });
    this.wallets.set(name, wallet);
    console.log(`   Created wallet: ${name} (${address.substring(0, 10)}...)`);
    return wallet;
  }

  createPortfolio(name) {
    const portfolio = new Portfolio({ name });
    this.portfolios.set(name, portfolio);
    console.log(`   Created portfolio: ${name}`);
    return portfolio;
  }

  async placeOrder(type, side, symbol, amount, price = null) {
    const order = new TradeOrder({
      type,
      side,
      symbol: symbol.toUpperCase(),
      amount,
      price: price || this.getPrice(symbol)
    });

    order.status = 'filled';
    order.filled = amount;
    this.orders.set(order.id, order);

    if (side === 'buy') {
      this.stats.trades++;
      this.stats.volume += amount * order.price;
    }

    console.log(`   Placed ${side} order: ${amount} ${symbol} @ $${order.price}`);

    return {
      success: true,
      orderId: order.id,
      status: order.status,
      filled: order.filled,
      price: order.price
    };
  }

  addToPortfolio(portfolioName, symbol, amount, price) {
    const portfolio = this.portfolios.get(portfolioName);
    if (!portfolio) {
      return { success: false, reason: 'Portfolio not found' };
    }

    portfolio.addAsset(symbol.toUpperCase(), amount, price);

    const asset = this.assets.get(symbol.toUpperCase());
    if (asset) {
      asset.holdings = (asset.holdings || 0) + amount;
      portfolio.totalValue += amount * price;
    }

    portfolio.transactions.push({
      type: 'buy',
      symbol: symbol.toUpperCase(),
      amount,
      price,
      timestamp: Date.now()
    });

    console.log(`   Added ${amount} ${symbol} to portfolio ${portfolioName}`);

    return { success: true, amount, price };
  }

  calculatePortfolioValue(portfolioName) {
    const portfolio = this.portfolios.get(portfolioName);
    if (!portfolio) return 0;

    let totalValue = 0;
    let totalCost = 0;

    for (const [symbol, holding] of portfolio.assets) {
      const asset = this.assets.get(symbol);
      if (asset) {
        totalValue += holding.amount * asset.price;
        totalCost += holding.amount * holding.avgPrice;
      }
    }

    portfolio.totalValue = totalValue;
    portfolio.totalPnL = totalValue - totalCost;

    return totalValue;
  }

  async simulatePrice(symbol, targetPrice) {
    const asset = this.assets.get(symbol.toUpperCase());
    if (!asset) {
      return { success: false, reason: 'Asset not found' };
    }

    const currentPrice = asset.price;
    const change = ((targetPrice - currentPrice) / currentPrice) * 100;

    console.log(`   Simulated ${symbol}: $${currentPrice} -> $${targetPrice} (${change.toFixed(2)}%)`);

    return {
      success: true,
      symbol,
      currentPrice,
      targetPrice,
      change: change.toFixed(2) + '%'
    };
  }

  getOrderHistory(symbol = null) {
    const orders = Array.from(this.orders.values());
    if (symbol) {
      return orders.filter(o => o.symbol === symbol.toUpperCase());
    }
    return orders;
  }

  getPortfolioAllocation(portfolioName) {
    const portfolio = this.portfolios.get(portfolioName);
    if (!portfolio) return [];

    const total = this.calculatePortfolioValue(portfolioName);
    if (total === 0) return [];

    const allocation = [];
    for (const [symbol, holding] of portfolio.assets) {
      const asset = this.assets.get(symbol);
      if (asset) {
        const value = holding.amount * asset.price;
        allocation.push({
          symbol,
          amount: holding.amount,
          value,
          percentage: (value / total * 100).toFixed(2) + '%'
        });
      }
    }

    return allocation.sort((a, b) => b.value - a.value);
  }

  getStats() {
    return {
      ...this.stats,
      assets: this.assets.size,
      wallets: this.wallets.size,
      portfolios: this.portfolios.size,
      orders: this.orders.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new CryptoAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Crypto Demo\n');

    // 1. Market Overview
    console.log('1. Market Overview:');
    const btc = agent.getMarketData('BTC');
    const eth = agent.getMarketData('ETH');
    console.log(`   BTC: $${btc.price} (${btc.change24h > 0 ? '+' : ''}${btc.change24h}%)`);
    console.log(`   ETH: $${eth.price} (${eth.change24h > 0 ? '+' : ''}${eth.change24h}%)`);
    console.log(`   Total Assets: ${agent.assets.size}`);

    // 2. Top Gainers
    console.log('\n2. Top Gainers:');
    const gainers = agent.getTopGainers();
    gainers.forEach((g, i) => console.log(`   ${i + 1}. ${g.symbol}: +${g.change24h}%`));

    // 3. Top Losers
    console.log('\n3. Top Losers:');
    const losers = agent.getTopLosers();
    losers.forEach((l, i) => console.log(`   ${i + 1}. ${l.symbol}: ${l.change24h}%`));

    // 4. Create Wallet
    console.log('\n4. Create Wallet:');
    agent.createWallet('main');
    agent.createWallet('trading');

    // 5. Create Portfolio
    console.log('\n5. Create Portfolio:');
    agent.createPortfolio('Growth');
    agent.createPortfolio('HODL');

    // 6. Place Orders
    console.log('\n6. Place Orders:');
    await agent.placeOrder('market', 'buy', 'BTC', 0.5);
    await agent.placeOrder('limit', 'buy', 'ETH', 10, 2700);
    await agent.placeOrder('market', 'sell', 'SOL', 50);

    // 7. Add to Portfolio
    console.log('\n7. Add to Portfolio:');
    agent.addToPortfolio('Growth', 'BTC', 0.5, 50000);
    agent.addToPortfolio('Growth', 'ETH', 5, 2700);
    agent.addToPortfolio('Growth', 'SOL', 100, 115);

    // 8. Calculate Portfolio Value
    console.log('\n8. Portfolio Value:');
    const growthValue = agent.calculatePortfolioValue('Growth');
    console.log(`   Growth Portfolio: $${growthValue.toFixed(2)}`);

    // 9. Portfolio Allocation
    console.log('\n9. Portfolio Allocation:');
    const allocation = agent.getPortfolioAllocation('Growth');
    allocation.forEach(a => console.log(`   ${a.symbol}: ${a.percentage} ($${a.value.toFixed(2)})`));

    // 10. Order History
    console.log('\n10. Order History:');
    const orders = agent.getOrderHistory();
    console.log(`   Total Orders: ${orders.length}`);

    // 11. Statistics
    console.log('\n11. Statistics:');
    const stats = agent.getStats();
    console.log(`   Total Trades: ${stats.trades}`);
    console.log(`   Trading Volume: $${stats.volume.toFixed(2)}`);
    console.log(`   Active Portfolios: ${stats.portfolios}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'price':
    console.log('Getting price data...');
    const price = agent.getPrice('BTC');
    console.log(`BTC: $${price}`);
    break;

  case 'portfolio':
    console.log('Portfolios:');
    for (const [name, portfolio] of agent.portfolios) {
      const value = agent.calculatePortfolioValue(name);
      console.log(`  - ${name}: $${value.toFixed(2)}`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-crypto.js [demo|price|portfolio]');
}
