/**
 * Agent Auction - Domain Auction Module
 *
 * Handles domain name auctions with bidding, bidding history, and auction management.
 *
 * Usage: node agent-auction.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   list       - List active auctions
 *   bid        - Place a bid
 *   history    - Get auction history
 */

class Auction {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.domain = config.domain;
    this.seller = config.seller;
    this.startingPrice = config.startingPrice || 10;
    this.currentPrice = config.currentPrice || config.startingPrice || 10;
    this.reservePrice = config.reservePrice || null; // Minimum price seller will accept
    this.startTime = config.startTime ? new Date(config.startTime) : new Date();
    this.endTime = config.endTime ? new Date(config.endTime) : this._calculateEndTime();
    this.status = config.status || 'active'; // upcoming, active, ended, cancelled
    this.highestBidder = config.highestBidder || null;
    this.bidCount = config.bidCount || 0;
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
  }

  _calculateEndTime() {
    // Default 7 day auction
    return new Date(this.startTime.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  isActive() {
    return this.status === 'active' && new Date() < this.endTime;
  }

  isEnded() {
    return new Date() >= this.endTime || this.status === 'ended';
  }
}

class Bid {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.auctionId = config.auctionId;
    this.bidder = config.bidder;
    this.amount = config.amount;
    this.maxBid = config.maxBid || null; // For proxy bidding
    this.timestamp = config.timestamp ? new Date(config.timestamp) : new Date();
    this.status = config.status || 'active'; // active, outbid, won, cancelled
  }
}

class AuctionManager {
  constructor() {
    this.auctions = new Map();
    this.bids = new Map();
    this.users = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    const sampleAuctions = [
      {
        domain: 'premiumdomains.com',
        seller: 'seller001',
        startingPrice: 500,
        currentPrice: 750,
        reservePrice: 1000,
        highestBidder: 'bidder123',
        bidCount: 5,
        startTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
      },
      {
        domain: 'cryptowallet.io',
        seller: 'seller002',
        startingPrice: 1000,
        currentPrice: 2500,
        reservePrice: 2000,
        highestBidder: 'crypto_fan',
        bidCount: 12,
        startTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      },
      {
        domain: 'aiventures.com',
        seller: 'seller001',
        startingPrice: 250,
        currentPrice: 250,
        reservePrice: null,
        startTime: new Date(),
        endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    ];

    sampleAuctions.forEach(a => {
      const auction = new Auction(a);
      this.auctions.set(auction.id, auction);
    });

    // Sample bids
    const sampleBids = [
      { auctionId: Array.from(this.auctions.values())[0].id, bidder: 'bidder123', amount: 600, timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
      { auctionId: Array.from(this.auctions.values())[0].id, bidder: 'bidder456', amount: 750, timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) },
      { auctionId: Array.from(this.auctions.values())[1].id, bidder: 'crypto_fan', amount: 1500, timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) },
      { auctionId: Array.from(this.auctions.values())[1].id, bidder: 'investor99', amount: 2000, timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      { auctionId: Array.from(this.auctions.values())[1].id, bidder: 'crypto_fan', amount: 2500, timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) }
    ];

    sampleBids.forEach(b => {
      const bid = new Bid(b);
      this.bids.set(bid.id, bid);
    });
  }

  createAuction(domain, seller, startingPrice, options = {}) {
    const auction = new Auction({
      domain,
      seller,
      startingPrice,
      currentPrice: startingPrice,
      reservePrice: options.reservePrice || null,
      startTime: options.startTime || new Date(),
      endTime: options.endTime || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'active'
    });

    this.auctions.set(auction.id, auction);
    return auction;
  }

  listAuctions(status = null) {
    let allAuctions = Array.from(this.auctions.values());

    if (status) {
      allAuctions = allAuctions.filter(a => a.status === status);
    }

    return allAuctions.sort((a, b) => b.startTime - a.startTime);
  }

  getActiveAuctions() {
    return Array.from(this.auctions.values())
      .filter(a => a.isActive())
      .sort((a, b) => a.endTime - b.endTime);
  }

  getAuction(id) {
    return this.auctions.get(id) || null;
  }

  getAuctionByDomain(domain) {
    return Array.from(this.auctions.values())
      .find(a => a.domain === domain) || null;
  }

  placeBid(auctionId, bidder, amount, maxBid = null) {
    const auction = this.auctions.get(auctionId);
    if (!auction) {
      throw new Error('Auction not found');
    }

    if (!auction.isActive()) {
      throw new Error('Auction is not active');
    }

    if (amount <= auction.currentPrice) {
      throw new Error(`Bid must be higher than current price: $${auction.currentPrice}`);
    }

    // Mark previous highest bid as outbid
    if (auction.highestBidder) {
      const previousBids = this.getBids(auctionId, auction.highestBidder);
      previousBids.forEach(b => b.status = 'outbid');
    }

    // Create new bid
    const bid = new Bid({
      auctionId,
      bidder,
      amount,
      maxBid,
      status: 'active'
    });

    this.bids.set(bid.id, bid);

    // Update auction
    auction.currentPrice = amount;
    auction.highestBidder = bidder;
    auction.bidCount += 1;

    return { auction, bid };
  }

  getBids(auctionId, bidder = null) {
    let allBids = Array.from(this.bids.values())
      .filter(b => b.auctionId === auctionId);

    if (bidder) {
      allBids = allBids.filter(b => b.bidder === bidder);
    }

    return allBids.sort((a, b) => b.amount - a.amount);
  }

  getAuctionHistory(domain) {
    const auction = this.getAuctionByDomain(domain);
    if (!auction) return [];

    const bids = this.getBids(auction.id);
    return {
      auction,
      bids
    };
  }

  endAuction(auctionId) {
    const auction = this.auctions.get(auctionId);
    if (!auction) {
      throw new Error('Auction not found');
    }

    if (auction.status === 'ended') {
      throw new Error('Auction already ended');
    }

    auction.status = 'ended';

    // Determine winner
    if (auction.highestBidder) {
      // Check if reserve price was met
      if (auction.reservePrice && auction.currentPrice < auction.reservePrice) {
        return {
          auction,
          winner: null,
          reason: 'Reserve price not met'
        };
      }

      // Mark winning bid
      const winningBid = this.getBids(auctionId, auction.highestBidder)[0];
      if (winningBid) winningBid.status = 'won';

      return {
        auction,
        winner: auction.highestBidder,
        finalPrice: auction.currentPrice
      };
    }

    return {
      auction,
      winner: null,
      reason: 'No bids placed'
    };
  }

  cancelAuction(auctionId, reason = '') {
    const auction = this.auctions.get(auctionId);
    if (!auction) {
      throw new Error('Auction not found');
    }

    if (auction.bidCount > 0) {
      throw new Error('Cannot cancel auction with existing bids');
    }

    auction.status = 'cancelled';
    return { auction, reason };
  }

  // Get auctions ending soon
  getEndingSoon(hours = 24) {
    const now = new Date();
    const threshold = new Date(now.getTime() + hours * 60 * 60 * 1000);

    return Array.from(this.auctions.values())
      .filter(a => a.isActive() && a.endTime <= threshold)
      .sort((a, b) => a.endTime - b.endTime);
  }

  // Get user's bids across all auctions
  getUserBids(bidder) {
    return Array.from(this.bids.values())
      .filter(b => b.bidder === bidder && b.status === 'active');
  }

  // Get user watchlist (auctions user has bid on)
  getUserWatchlist(bidder) {
    const userBidAuctions = new Set(
      Array.from(this.bids.values())
        .filter(b => b.bidder === bidder)
        .map(b => b.auctionId)
    );

    return Array.from(userBidAuctions)
      .map(id => this.auctions.get(id))
      .filter(a => a !== undefined && a.isActive());
  }
}

function runDemo() {
  console.log('=== Agent Auction Demo\n');

  const mgr = new AuctionManager();

  console.log('1. List Active Auctions:');
  const activeAuctions = mgr.getActiveAuctions();
  console.log(`   Active: ${activeAuctions.length}`);
  activeAuctions.forEach(a => {
    console.log(`   - ${a.domain} - $${a.currentPrice} (${a.bidCount} bids)`);
  });

  console.log('\n2. Create New Auction:');
  const newAuction = mgr.createAuction('techstartups.ai', 'seller999', 100, {
    reservePrice: 500,
    endTime: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
  });
  console.log(`   Created: ${newAuction.domain}`);
  console.log(`   Starting: $${newAuction.startingPrice}`);
  console.log(`   Ends: ${newAuction.endTime}`);

  console.log('\n3. Place Bid:');
  const bidResult = mgr.placeBid(newAuction.id, 'newbidder', 150);
  console.log(`   Bid placed: $${bidResult.bid.amount} by ${bidResult.bid.bidder}`);
  console.log(`   New price: $${bidResult.auction.currentPrice}`);

  console.log('\n4. Place Higher Bid:');
  const bidResult2 = mgr.placeBid(newAuction.id, 'competitor', 200);
  console.log(`   Bid placed: $${bidResult2.bid.amount} by ${bidResult2.bid.bidder}`);

  console.log('\n5. Get Auction Bids:');
  const bids = mgr.getBids(newAuction.id);
  console.log(`   Total bids: ${bids.length}`);
  bids.forEach(b => console.log(`   - ${b.bidder}: $${b.amount} (${b.status})`));

  console.log('\n6. Get Auction History:');
  const history = mgr.getAuctionHistory('cryptowallet.io');
  console.log(`   Domain: ${history.auction.domain}`);
  console.log(`   Final price: $${history.auction.currentPrice}`);
  console.log(`   Bids: ${history.bids.length}`);

  console.log('\n7. Get Ending Soon:');
  const endingSoon = mgr.getEndingSoon(48);
  console.log(`   Ending in 48h: ${endingSoon.length}`);

  console.log('\n8. User Watchlist:');
  const watchlist = mgr.getUserWatchlist('bidder123');
  console.log(`   Watching: ${watchlist.length} auctions`);

  console.log('\n9. End Auction:');
  const endResult = mgr.endAuction(newAuction.id);
  console.log(`   Winner: ${endResult.winner || 'None'} (${endResult.reason || ''})`);
  console.log(`   Final price: $${endResult.finalPrice}`);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new AuctionManager();

if (command === 'demo') runDemo();
else if (command === 'list') {
  const auctions = mgr.listAuctions('active');
  console.log(JSON.stringify(auctions, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
}
else if (command === 'bid') {
  const [auctionId, bidder, amount] = args.slice(1);
  if (!auctionId || !bidder || !amount) {
    console.log('Usage: node agent-auction.js bid <auctionId> <bidder> <amount>');
    process.exit(1);
  }
  try {
    const result = mgr.placeBid(auctionId, bidder, parseFloat(amount));
    console.log(JSON.stringify(result, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}
else if (command === 'history') {
  const [domain] = args.slice(1);
  if (!domain) {
    console.log('Usage: node agent-auction.js history <domain>');
    process.exit(1);
  }
  const result = mgr.getAuctionHistory(domain);
  console.log(JSON.stringify(result, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
}
else console.log('Usage: node agent-auction.js [demo|list|bid|history]');
