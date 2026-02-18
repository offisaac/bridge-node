/**
 * Agent NFT - Non-Fungible Token Agent
 *
 * NFT management with minting, trading, and metadata.
 *
 * Usage: node agent-nft.js [command]
 * Commands:
 *   demo        - Run demonstration
 *   mint        - Test mint NFT
 *   collection  - Show collections
 */

class NFTCollection {
  constructor(config) {
    this.id = `collection-${Date.now()}`;
    this.name = config.name;
    this.symbol = config.symbol;
    this.address = config.address;
    this.owner = config.owner;
    this.totalSupply = config.totalSupply || 0;
    this.maxSupply = config.maxSupply || 10000;
    this.baseURI = config.baseURI || '';
    this.mintPrice = config.mintPrice || 0;
    this.blockchain = config.blockchain || 'ethereum';
  }
}

class NFT {
  constructor(config) {
    this.id = config.id;
    this.tokenId = config.tokenId;
    this.collectionAddress = config.collectionAddress;
    this.owner = config.owner;
    this.uri = config.uri;
    this.metadata = config.metadata || {};
    this.attributes = config.attributes || [];
    this.history = [];
  }
}

class NFTMetadata {
  constructor(config) {
    this.name = config.name;
    this.description = config.description;
    this.image = config.image;
    this.externalUrl = config.externalUrl;
    this.attributes = config.attributes || [];
  }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      image: this.image,
      external_url: this.externalUrl,
      attributes: this.attributes
    };
  }
}

class NFTAuction {
  constructor(config) {
    this.id = `auction-${Date.now()}`;
    this.tokenId = config.tokenId;
    this.collectionAddress = config.collectionAddress;
    this.seller = config.seller;
    this.startingPrice = config.startingPrice;
    this.currentPrice = config.startingPrice;
    this.highestBidder = null;
    this.endTime = config.endTime || Date.now() + 24 * 60 * 60 * 1000;
    this.status = 'active';
  }
}

class NFTListing {
  constructor(config) {
    this.id = `listing-${Date.now()}`;
    this.tokenId = config.tokenId;
    this.collectionAddress = config.collectionAddress;
    this.seller = config.seller;
    this.price = config.price;
    this.currency = config.currency || 'ETH';
    this.status = 'active';
    this.createdAt = Date.now();
  }
}

class NFTAgent {
  constructor(config = {}) {
    this.collections = new Map();
    this.nfts = new Map();
    this.listings = new Map();
    this.auctions = new Map();
    this.stats = {
      minted: 0,
      transferred: 0,
      sold: 0,
      burned: 0
    };
  }

  createCollection(name, symbol, options = {}) {
    const address = `0x${Math.random().toString(16).substr(2, 40)}`;

    const collection = new NFTCollection({
      name,
      symbol,
      address,
      owner: options.owner || '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1',
      maxSupply: options.maxSupply || 10000,
      mintPrice: options.mintPrice || 0,
      baseURI: options.baseURI || `https://api.example.com/${address}/`
    });

    this.collections.set(address, collection);
    console.log(`   Created collection: ${name} at ${address}`);

    return { success: true, address, collection };
  }

  async mint(collectionAddress, to, metadata = {}) {
    const collection = this.collections.get(collectionAddress);
    if (!collection) {
      return { success: false, reason: 'Collection not found' };
    }

    if (collection.totalSupply >= collection.maxSupply) {
      return { success: false, reason: 'Collection max supply reached' };
    }

    const tokenId = collection.totalSupply + 1;
    const uri = `${collection.baseURI}${tokenId}`;

    const nft = new NFT({
      id: `nft-${tokenId}`,
      tokenId,
      collectionAddress,
      owner: to,
      uri,
      metadata: {
        name: metadata.name || `${collection.name} #${tokenId}`,
        description: metadata.description || '',
        image: metadata.image || '',
        attributes: metadata.attributes || []
      },
      attributes: metadata.attributes || []
    });

    this.nfts.set(`${collectionAddress}-${tokenId}`, nft);
    collection.totalSupply++;
    this.stats.minted++;

    console.log(`   Minted NFT #${tokenId} to ${to}`);

    return {
      success: true,
      tokenId,
      owner: to,
      uri
    };
  }

  async transfer(from, to, tokenId, collectionAddress) {
    const nft = this.nfts.get(`${collectionAddress}-${tokenId}`);

    if (!nft) {
      return { success: false, reason: 'NFT not found' };
    }

    if (nft.owner !== from) {
      return { success: false, reason: 'Not the owner' };
    }

    const oldOwner = nft.owner;
    nft.owner = to;
    nft.history.push({
      action: 'transfer',
      from,
      to,
      timestamp: Date.now()
    });

    this.stats.transferred++;

    console.log(`   Transferred NFT #${tokenId} from ${from.substring(0, 10)}... to ${to.substring(0, 10)}...`);

    return { success: true, tokenId, from, to };
  }

  async list(collectionAddress, tokenId, seller, price, options = {}) {
    const nft = this.nfts.get(`${collectionAddress}-${tokenId}`);
    if (!nft) {
      return { success: false, reason: 'NFT not found' };
    }

    const listing = new NFTListing({
      tokenId,
      collectionAddress,
      seller,
      price,
      currency: options.currency || 'ETH'
    });

    this.listings.set(listing.id, listing);
    console.log(`   Listed NFT #${tokenId} for ${price} ETH`);

    return { success: true, listingId: listing.id, price };
  }

  async buy(collectionAddress, tokenId, buyer, options = {}) {
    const listing = Array.from(this.listings.values())
      .find(l => l.collectionAddress === collectionAddress && l.tokenId === tokenId && l.status === 'active');

    if (!listing) {
      return { success: false, reason: 'Listing not found' };
    }

    const nft = this.nfts.get(`${collectionAddress}-${tokenId}`);
    if (!nft) {
      return { success: false, reason: 'NFT not found' };
    }

    nft.owner = buyer;
    nft.history.push({
      action: 'sale',
      price: listing.price,
      buyer,
      timestamp: Date.now()
    });

    listing.status = 'sold';
    this.stats.sold++;

    console.log(`   Bought NFT #${tokenId} for ${listing.price} ETH`);

    return { success: true, tokenId, price: listing.price, buyer };
  }

  async createAuction(collectionAddress, tokenId, seller, startingPrice, duration = 24) {
    const nft = this.nfts.get(`${collectionAddress}-${tokenId}`);
    if (!nft) {
      return { success: false, reason: 'NFT not found' };
    }

    const auction = new NFTAuction({
      tokenId,
      collectionAddress,
      seller,
      startingPrice,
      endTime: Date.now() + duration * 60 * 60 * 1000
    });

    this.auctions.set(auction.id, auction);
    console.log(`   Created auction for NFT #${tokenId} starting at ${startingPrice} ETH`);

    return { success: true, auctionId: auction.id, startingPrice };
  }

  async bid(auctionId, bidder, amount) {
    const auction = this.auctions.get(auctionId);
    if (!auction) {
      return { success: false, reason: 'Auction not found' };
    }

    if (amount <= auction.currentPrice) {
      return { success: false, reason: 'Bid must be higher than current price' };
    }

    auction.currentPrice = amount;
    auction.highestBidder = bidder;
    console.log(`   New bid: ${amount} ETH from ${bidder.substring(0, 10)}...`);

    return { success: true, currentPrice: amount, bidder };
  }

  async burn(collectionAddress, tokenId) {
    const nft = this.nfts.get(`${collectionAddress}-${tokenId}`);
    if (!nft) {
      return { success: false, reason: 'NFT not found' };
    }

    const collection = this.collections.get(collectionAddress);
    if (collection) {
      collection.totalSupply--;
    }

    this.nfts.delete(`${collectionAddress}-${tokenId}`);
    this.stats.burned++;

    console.log(`   Burned NFT #${tokenId}`);

    return { success: true, tokenId };
  }

  getNFT(collectionAddress, tokenId) {
    return this.nfts.get(`${collectionAddress}-${tokenId}`);
  }

  getCollection(address) {
    return this.collections.get(address);
  }

  getListings(collectionAddress) {
    return Array.from(this.listings.values())
      .filter(l => l.collectionAddress === collectionAddress && l.status === 'active');
  }

  getStats() {
    return {
      ...this.stats,
      collections: this.collections.size,
      nfts: this.nfts.size,
      activeListings: Array.from(this.listings.values()).filter(l => l.status === 'active').length,
      activeAuctions: Array.from(this.auctions.values()).filter(a => a.status === 'active').length
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new NFTAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent NFT Demo\n');

    // 1. Create Collection
    console.log('1. Create Collection:');
    const collection = agent.createCollection('CryptoPunks2', 'CPK2', {
      maxSupply: 10000,
      mintPrice: 0.05
    });
    const collectionAddress = collection.address;

    // 2. Mint NFTs
    console.log('\n2. Mint NFTs:');
    await agent.mint(collectionAddress, '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1', {
      name: 'CryptoPunk #1',
      image: 'ipfs://Qm123...',
      attributes: [{ trait_type: 'Type', value: 'Zombie' }, { trait_type: 'Accessory', value: 'Cap' }]
    });
    await agent.mint(collectionAddress, '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1', {
      name: 'CryptoPunk #2',
      image: 'ipfs://Qm456...',
      attributes: [{ trait_type: 'Type', value: 'Ape' }, { trait_type: 'Accessory', value: 'Glasses' }]
    });

    // 3. Transfer NFT
    console.log('\n3. Transfer NFT:');
    await agent.transfer(
      '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1',
      '0x1234567890123456789012345678901234567890',
      1,
      collectionAddress
    );

    // 4. List for Sale
    console.log('\n4. List for Sale:');
    await agent.list(
      collectionAddress,
      2,
      '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1',
      1.5
    );

    // 5. Buy NFT
    console.log('\n5. Buy NFT:');
    await agent.buy(
      collectionAddress,
      2,
      '0x9999999999999999999999999999999999999999'
    );

    // 6. Create Auction
    console.log('\n6. Create Auction:');
    const auction = await agent.createAuction(
      collectionAddress,
      1,
      '0x1234567890123456789012345678901234567890',
      5.0,
      24
    );

    // 7. Place Bids
    console.log('\n7. Place Bids:');
    await agent.bid(auction.auctionId, '0xaaaaaaaabbbbbbbbcccccccciiiiidddddddd', 6.0);
    await agent.bid(auction.auctionId, '0x5555555555555555555555555555555555555555', 7.5);

    // 8. Burn NFT
    console.log('\n8. Burn NFT:');
    await agent.mint(collectionAddress, '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1', {
      name: 'Test NFT'
    });
    await agent.burn(collectionAddress, 4);

    // 9. Get NFT Info
    console.log('\n9. NFT Information:');
    const nft = agent.getNFT(collectionAddress, 1);
    if (nft) {
      console.log(`   Owner: ${nft.owner.substring(0, 14)}...`);
      console.log(`   URI: ${nft.uri}`);
    }

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = agent.getStats();
    console.log(`   NFTs Minted: ${stats.minted}`);
    console.log(`   NFTs Transferred: ${stats.transferred}`);
    console.log(`   NFTs Sold: ${stats.sold}`);
    console.log(`   NFTs Burned: ${stats.burned}`);
    console.log(`   Collections: ${stats.collections}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'mint':
    console.log('Minting test NFT...');
    const col = agent.createCollection('TestCollection', 'TEST');
    const result = await agent.mint(col.address, '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1', {
      name: 'Test NFT #1'
    });
    console.log(`Result: ${result.success ? 'Success' : 'Failed'}`);
    break;

  case 'collection':
    console.log('NFT Collections:');
    for (const [address, col] of agent.collections) {
      console.log(`  - ${col.name} (${col.symbol}): ${col.totalSupply}/${col.maxSupply}`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-nft.js [demo|mint|collection]');
}
