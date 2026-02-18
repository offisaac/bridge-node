/**
 * Agent DeFi - Decentralized Finance Agent
 *
 * DeFi protocol integration with lending, swapping, and yield farming.
 *
 * Usage: node agent-defi.js [command]
 * Commands:
 *   demo        - Run demonstration
 *   swap        - Test token swap
 *   pools       - Show liquidity pools
 */

class Token {
  constructor(config) {
    this.symbol = config.symbol;
    this.name = config.name;
    this.address = config.address;
    this.decimals = config.decimals || 18;
    this.price = config.price || 0;
    this.totalSupply = config.totalSupply || 0;
  }
}

class LiquidityPool {
  constructor(config) {
    this.id = `pool-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    this.tokenA = config.tokenA;
    this.tokenB = config.tokenB;
    this.reserveA = config.reserveA || 0;
    this.reserveB = config.reserveB || 0;
    this.liquidity = config.liquidity || 0;
    this.fee = config.fee || 0.003;
  }
}

class LendingPool {
  constructor(config) {
    this.id = `lending-${Date.now()}`;
    this.collateralToken = config.collateralToken;
    this.borrowToken = config.borrowToken;
    this.collateralFactor = config.collateralFactor || 0.75;
    this.liquidationThreshold = config.liquidationThreshold || 0.8;
    this.borrowRate = config.borrowRate || 0.05;
    this.supplyRate = config.supplyRate || 0.02;
    this.totalSupplied = config.totalSupplied || 0;
    this.totalBorrowed = config.totalBorrowed || 0;
  }
}

class YieldFarm {
  constructor(config) {
    this.id = `farm-${Date.now()}`;
    this.rewardToken = config.rewardToken;
    this.stakedToken = config.stakedToken;
    this.totalStaked = config.totalStaked || 0;
    this.rewardRate = config.rewardRate || 0.1;
    this.apy = config.apy || 0;
    this.startTime = Date.now();
    this.endTime = config.endTime || Date.now() + 365 * 24 * 60 * 60 * 1000;
  }
}

class SwapResult {
  constructor(config) {
    this.fromToken = config.fromToken;
    this.toToken = config.toToken;
    this.fromAmount = config.fromAmount;
    this.toAmount = config.toAmount;
    this.priceImpact = config.priceImpact || 0;
    this.route = config.route || [];
    this.slippage = config.slippage || 0;
  }
}

class DeFiAgent {
  constructor(config = {}) {
    this.tokens = new Map();
    this.pools = new Map();
    this.lendingPools = new Map();
    this.farms = new Map();
    this.swaps = [];
    this.stats = {
      swaps: 0,
      liquidityAdded: 0,
      borrowed: 0,
      farmed: 0
    };

    // Initialize default tokens
    this.initializeTokens();
  }

  initializeTokens() {
    const defaultTokens = [
      { symbol: 'ETH', name: 'Ethereum', address: '0x0000000000000000000000000000000000000000', price: 2500 },
      { symbol: 'USDC', name: 'USD Coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', price: 1 },
      { symbol: 'USDT', name: 'Tether', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', price: 1 },
      { symbol: 'WBTC', name: 'Wrapped Bitcoin', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', price: 45000 },
      { symbol: 'DAI', name: 'Dai', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', price: 1 },
      { symbol: 'UNI', name: 'Uniswap', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', price: 7.5 },
      { symbol: 'AAVE', name: 'Aave', address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', price: 95 },
      { symbol: 'LINK', name: 'Chainlink', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', price: 15 }
    ];

    defaultTokens.forEach(t => this.tokens.set(t.symbol, new Token(t)));
  }

  addLiquidity(tokenA, tokenB, amountA, amountB) {
    const poolId = `${tokenA}-${tokenB}`;

    let pool = this.pools.get(poolId);
    if (!pool) {
      pool = new LiquidityPool({
        tokenA: tokenA,
        tokenB: tokenB,
        reserveA: amountA,
        reserveB: amountB,
        liquidity: Math.sqrt(amountA * amountB)
      });
      this.pools.set(poolId, pool);
    } else {
      pool.reserveA += amountA;
      pool.reserveB += amountB;
      pool.liquidity = Math.sqrt(pool.reserveA * pool.reserveB);
    }

    this.stats.liquidityAdded++;

    console.log(`   Added liquidity to ${poolId}: ${amountA} ${tokenA} / ${amountB} ${tokenB}`);
    return { success: true, poolId, liquidity: pool.liquidity };
  }

  async swap(fromToken, toToken, amount, options = {}) {
    const from = this.tokens.get(fromToken);
    const to = this.tokens.get(toToken);

    if (!from || !to) {
      return { success: false, reason: 'Token not found' };
    }

    // Calculate swap output (simplified)
    const rate = from.price / to.price;
    const outputAmount = amount * rate * (1 - 0.003); // 0.3% fee
    const priceImpact = (amount / (amount + 1000)) * 100;
    const slippage = options.slippage || 0.5;

    const result = new SwapResult({
      fromToken,
      toToken,
      fromAmount: amount,
      toAmount: outputAmount,
      priceImpact,
      route: [fromToken, toToken],
      slippage
    });

    this.swaps.push(result);
    this.stats.swaps++;

    console.log(`   Swapped ${amount} ${fromToken} -> ${outputAmount.toFixed(2)} ${toToken}`);
    return {
      success: true,
      fromAmount: amount,
      toAmount: outputAmount,
      priceImpact,
      route: result.route
    };
  }

  async lend(token, amount, options = {}) {
    const tokenObj = this.tokens.get(token);
    if (!tokenObj) {
      return { success: false, reason: 'Token not found' };
    }

    const poolId = `${token}-lending`;
    let pool = this.lendingPools.get(poolId);

    if (!pool) {
      pool = new LendingPool({
        collateralToken: token,
        borrowToken: 'USDC'
      });
      this.lendingPools.set(poolId, pool);
    }

    pool.totalSupplied += amount;
    pool.supplyRate = 0.02 + (pool.totalSupplied / 1000000) * 0.01;

    console.log(`   Supplied ${amount} ${token} to lending pool`);
    return {
      success: true,
      supplied: amount,
      apy: (pool.supplyRate * 100).toFixed(2) + '%'
    };
  }

  async borrow(collateralAmount, collateralToken, borrowToken, borrowAmount) {
    const poolId = `${collateralToken}-lending`;
    const pool = this.lendingPools.get(poolId);

    if (!pool) {
      return { success: false, reason: 'Lending pool not found' };
    }

    const maxBorrow = collateralAmount * pool.collateralFactor;
    if (borrowAmount > maxBorrow) {
      return { success: false, reason: 'Insufficient collateral' };
    }

    pool.totalBorrowed += borrowAmount;
    this.stats.borrowed += borrowAmount;

    console.log(`   Borrowed ${borrowAmount} ${borrowToken} (collateral: ${collateralAmount} ${collateralToken})`);
    return {
      success: true,
      borrowed: borrowAmount,
      borrowRate: (pool.borrowRate * 100).toFixed(2) + '%'
    };
  }

  async stake(token, amount, farmId) {
    let farm = this.farms.get(farmId);

    if (!farm) {
      const rewardToken = this.tokens.get('UNI');
      farm = new YieldFarm({
        rewardToken: 'UNI',
        stakedToken: token,
        apy: 0.25
      });
      this.farms.set(farmId, farm);
    }

    farm.totalStaked += amount;
    farm.apy = farm.rewardRate * 100 * 365;

    this.stats.farmed++;

    console.log(`   Staked ${amount} ${token} in farm`);
    return {
      success: true,
      staked: amount,
      apy: (farm.apy * 100).toFixed(2) + '%',
      pendingRewards: (amount * farm.apy / 365).toFixed(4)
    };
  }

  async harvest(farmId) {
    const farm = this.farms.get(farmId);
    if (!farm) {
      return { success: false, reason: 'Farm not found' };
    }

    const rewards = farm.totalStaked * farm.rewardRate;
    console.log(`   Harvested ${rewards.toFixed(4)} ${farm.rewardToken}`);

    return { success: true, harvested: rewards, token: farm.rewardToken };
  }

  getPool(tokenA, tokenB) {
    return this.pools.get(`${tokenA}-${tokenB}`) || this.pools.get(`${tokenB}-${tokenA}`);
  }

  getPrice(tokenA, tokenB) {
    const a = this.tokens.get(tokenA);
    const b = this.tokens.get(tokenB);
    if (!a || !b) return null;
    return a.price / b.price;
  }

  getStats() {
    return {
      ...this.stats,
      tokens: this.tokens.size,
      pools: this.pools.size,
      lendingPools: this.lendingPools.size,
      farms: this.farms.size,
      totalSwaps: this.swaps.length
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new DeFiAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent DeFi Demo\n');

    // 1. Initialize Tokens
    console.log('1. Token Overview:');
    console.log(`   ETH: $${agent.tokens.get('ETH').price}`);
    console.log(`   USDC: $${agent.tokens.get('USDC').price}`);
    console.log(`   WBTC: $${agent.tokens.get('WBTC').price}`);
    console.log(`   Total Tokens: ${agent.tokens.size}`);

    // 2. Add Liquidity
    console.log('\n2. Add Liquidity:');
    agent.addLiquidity('ETH', 'USDC', 100, 250000);
    agent.addLiquidity('WBTC', 'ETH', 10, 25000);

    // 3. Get Price
    console.log('\n3. Get Price:');
    const price = agent.getPrice('ETH', 'USDC');
    console.log(`   ETH/USDC: ${price}`);

    // 4. Swap Tokens
    console.log('\n4. Swap Tokens:');
    const swapResult = await agent.swap('ETH', 'USDC', 10);
    console.log(`   Status: ${swapResult.success ? 'success' : 'failed'}`);

    // 5. Lending
    console.log('\n5. Lend Assets:');
    const lendResult = await agent.lend('ETH', 50);
    console.log(`   APY: ${lendResult.apy}`);

    // 6. Borrow
    console.log('\n6. Borrow Assets:');
    const borrowResult = await agent.borrow(50, 'ETH', 'USDC', 30);
    console.log(`   Status: ${borrowResult.success ? 'success' : 'failed'}`);

    // 7. Yield Farming
    console.log('\n7. Stake & Farm:');
    const stakeResult = await agent.stake('UNI', 1000, 'uni-eth-farm');
    console.log(`   APY: ${stakeResult.apy}`);

    // 8. Harvest Rewards
    console.log('\n8. Harvest Rewards:');
    const harvestResult = await agent.harvest('uni-eth-farm');
    console.log(`   Status: ${harvestResult.success ? 'success' : 'failed'}`);

    // 9. Get Pool Info
    console.log('\n9. Pool Information:');
    const pool = agent.getPool('ETH', 'USDC');
    if (pool) {
      console.log(`   ETH Reserve: ${pool.reserveA}`);
      console.log(`   USDC Reserve: ${pool.reserveB}`);
      console.log(`   Liquidity: ${pool.liquidity.toFixed(0)}`);
    }

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = agent.getStats();
    console.log(`   Total Swaps: ${stats.swaps}`);
    console.log(`   Liquidity Added: ${stats.liquidityAdded}`);
    console.log(`   Total Borrowed: ${stats.borrowed}`);
    console.log(`   Active Farms: ${stats.farms}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'swap':
    console.log('Testing token swap...');
    const result = await agent.swap('ETH', 'USDC', 1);
    console.log(`Result: ${result.success ? 'Success' : 'Failed'}`);
    break;

  case 'pools':
    console.log('Liquidity Pools:');
    for (const [id, pool] of agent.pools) {
      console.log(`  - ${pool.tokenA}/${pool.tokenB}: ${pool.reserveA} / ${pool.reserveB}`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-defi.js [demo|swap|pools]');
}
