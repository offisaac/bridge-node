/**
 * Agent Blockchain - Blockchain Integration Agent
 *
 * Blockchain network integration with wallets, transactions, and chain management.
 *
 * Usage: node agent-blockchain.js [command]
 * Commands:
 *   demo        - Run demonstration
 *   send        - Send test transaction
 *   wallets     - Show wallet management
 */

class BlockchainWallet {
  constructor(config) {
    this.address = config.address;
    this.publicKey = config.publicKey;
    this.privateKey = config.privateKey;
    this.balance = config.balance || 0;
    this.chain = config.chain || 'ethereum';
    this.nonce = 0;
  }
}

class BlockchainTransaction {
  constructor(config) {
    this.hash = `0x${Date.now().toString(16)}${Math.random().toString(16).substr(2, 16)}`;
    this.from = config.from;
    this.to = config.to;
    this.value = config.value;
    this.gas = config.gas || 21000;
    this.gasPrice = config.gasPrice || 0;
    this.nonce = config.nonce || 0;
    this.data = config.data || '0x';
    this.status = 'pending';
    this.blockNumber = null;
    this.timestamp = Date.now();
  }
}

class BlockchainBlock {
  constructor(config) {
    this.number = config.number;
    this.hash = config.hash;
    this.parentHash = config.parentHash;
    this.timestamp = config.timestamp || Date.now();
    this.transactions = config.transactions || [];
    this.gasUsed = config.gasUsed || 0;
    this.gasLimit = config.gasLimit || 30000000;
  }
}

class BlockchainContract {
  constructor(config) {
    this.address = config.address;
    this.abi = config.abi || [];
    this.name = config.name || 'Unknown';
    this.bytecode = config.bytecode || '';
  }
}

class BlockchainAgent {
  constructor(config = {}) {
    this.network = config.network || 'mainnet';
    this.chainId = config.chainId || 1;
    this.wallets = new Map();
    this.transactions = new Map();
    this.blocks = new Map();
    this.contracts = new Map();
    this.stats = {
      txSent: 0,
      txConfirmed: 0,
      blocksMined: 0,
      contractsDeployed: 0
    };
  }

  createWallet(name) {
    const address = `0x${Math.random().toString(16).substr(2, 40)}`;
    const wallet = new BlockchainWallet({
      address,
      balance: 0,
      chain: this.network
    });
    this.wallets.set(name, wallet);
    console.log(`   Created wallet: ${name} (${address})`);
    return wallet;
  }

  getWallet(name) {
    return this.wallets.get(name);
  }

  fundWallet(name, amount) {
    const wallet = this.wallets.get(name);
    if (wallet) {
      wallet.balance += amount;
      console.log(`   Funded wallet ${name}: +${amount} ETH`);
      return { success: true, balance: wallet.balance };
    }
    return { success: false, reason: 'Wallet not found' };
  }

  async sendTransaction(fromName, toAddress, value, options = {}) {
    const fromWallet = this.wallets.get(fromName);
    if (!fromWallet) {
      return { success: false, reason: 'Sender wallet not found' };
    }

    if (fromWallet.balance < value) {
      return { success: false, reason: 'Insufficient balance' };
    }

    const toWallet = Array.from(this.wallets.values())
      .find(w => w.address === toAddress);

    const tx = new BlockchainTransaction({
      from: fromWallet.address,
      to: toAddress,
      value,
      gas: options.gas,
      gasPrice: options.gasPrice || 50000000000,
      nonce: fromWallet.nonce++
    });

    fromWallet.balance -= value;
    if (toWallet) {
      toWallet.balance += value;
    }

    this.transactions.set(tx.hash, tx);
    this.stats.txSent++;

    console.log(`   Sent transaction: ${tx.hash.substring(0, 18)}...`);
    return { success: true, hash: tx.hash, from: fromWallet.address, to: toAddress, value };
  }

  async confirmTransaction(txHash) {
    const tx = this.transactions.get(txHash);
    if (tx) {
      tx.status = 'confirmed';
      tx.blockNumber = this.blocks.size + 1;
      this.stats.txConfirmed++;
      console.log(`   Confirmed transaction in block ${tx.blockNumber}`);
      return { success: true, blockNumber: tx.blockNumber };
    }
    return { success: false, reason: 'Transaction not found' };
  }

  async getBalance(walletName) {
    const wallet = this.wallets.get(walletName);
    if (wallet) {
      return { success: true, balance: wallet.balance, address: wallet.address };
    }
    return { success: false, reason: 'Wallet not found' };
  }

  async deployContract(name, contract, options = {}) {
    const address = `0x${Math.random().toString(16).substr(2, 40)}`;
    const deployedContract = new BlockchainContract({
      address,
      abi: contract.abi || [],
      name: contract.name || name,
      bytecode: contract.bytecode || ''
    });

    this.contracts.set(name, deployedContract);
    this.stats.contractsDeployed++;

    console.log(`   Deployed contract: ${name} at ${address}`);
    return { success: true, address, name };
  }

  async callContract(contractName, method, params = []) {
    const contract = this.contracts.get(contractName);
    if (!contract) {
      return { success: false, reason: 'Contract not found' };
    }

    console.log(`   Called ${contractName}.${method}`);
    return { success: true, method, params, result: '0x' + Math.random().toString(16).substr(2, 8) };
  }

  async mineBlock() {
    const blockNumber = this.blocks.size + 1;
    const block = new BlockchainBlock({
      number: blockNumber,
      hash: `0x${Math.random().toString(16).substr(2, 64)}`,
      parentHash: this.blocks.size > 0
        ? Array.from(this.blocks.values())[this.blocks.size - 1].hash
        : '0x0000000000000000000000000000000000000000000000000000000000000000'
    });

    this.blocks.set(blockNumber, block);
    this.stats.blocksMined++;

    console.log(`   Mined block #${blockNumber}`);
    return { success: true, blockNumber };
  }

  async getTransactionReceipt(txHash) {
    const tx = this.transactions.get(txHash);
    if (tx) {
      return {
        success: true,
        hash: tx.hash,
        status: tx.status,
        blockNumber: tx.blockNumber,
        gasUsed: tx.gas
      };
    }
    return { success: false, reason: 'Transaction not found' };
  }

  getStats() {
    return {
      ...this.stats,
      wallets: this.wallets.size,
      transactions: this.transactions.size,
      blocks: this.blocks.size,
      contracts: this.contracts.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new BlockchainAgent({ network: 'ethereum', chainId: 1 });

switch (command) {
  case 'demo':
    console.log('=== Agent Blockchain Demo\n');

    // 1. Create Wallets
    console.log('1. Wallet Management:');
    agent.createWallet('alice');
    agent.createWallet('bob');
    agent.createWallet('treasury');
    console.log(`   Total wallets: ${agent.wallets.size}`);

    // 2. Fund Wallets
    console.log('\n2. Fund Wallets:');
    agent.fundWallet('alice', 100);
    agent.fundWallet('bob', 50);
    agent.fundWallet('treasury', 1000);

    // 3. Check Balances
    console.log('\n3. Check Balances:');
    const aliceBal = await agent.getBalance('alice');
    console.log(`   Alice: ${aliceBal.balance} ETH`);

    // 4. Send Transaction
    console.log('\n4. Send Transaction:');
    const tx = await agent.sendTransaction('alice', '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1', 25);
    console.log(`   Status: ${tx.success ? 'success' : 'failed'}`);

    // 5. Deploy Contract
    console.log('\n5. Deploy Contract:');
    const contract = {
      name: 'Token',
      abi: [
        { name: 'transfer', type: 'function', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }] },
        { name: 'balanceOf', type: 'function', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] }
      ],
      bytecode: '0x608060405234801561001057600080fd5b50...'
    };
    await agent.deployContract('ERC20Token', contract);

    // 6. Call Contract
    console.log('\n6. Call Contract:');
    const result = await agent.callContract('ERC20Token', 'balanceOf', ['0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1']);
    console.log(`   Status: ${result.success ? 'success' : 'failed'}`);

    // 7. Mine Block
    console.log('\n7. Mine Block:');
    await agent.mineBlock();
    await agent.mineBlock();

    // 8. Confirm Transaction
    console.log('\n8. Confirm Transaction:');
    if (tx.hash) {
      await agent.confirmTransaction(tx.hash);
    }

    // 9. Get Transaction Receipt
    console.log('\n9. Transaction Receipt:');
    if (tx.hash) {
      const receipt = await agent.getTransactionReceipt(tx.hash);
      console.log(`   Status: ${receipt.success ? 'confirmed' : 'pending'}`);
    }

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = agent.getStats();
    console.log(`   Transactions Sent: ${stats.txSent}`);
    console.log(`   Transactions Confirmed: ${stats.txConfirmed}`);
    console.log(`   Blocks Mined: ${stats.blocksMined}`);
    console.log(`   Contracts Deployed: ${stats.contractsDeployed}`);
    console.log(`   Total Wallets: ${stats.wallets}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'send':
    console.log('Sending test transaction...');
    agent.createWallet('sender');
    agent.fundWallet('sender', 10);
    const result = await agent.sendTransaction('sender', '0x742d35Cc6634C0532925a3b844Bc9e7595f0eB1', 1);
    console.log(`Result: ${result.success ? 'Success' : 'Failed'}`);
    break;

  case 'wallets':
    console.log('Wallets:');
    for (const [name, wallet] of agent.wallets) {
      console.log(`  - ${name}: ${wallet.address} (${wallet.balance} ETH)`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-blockchain.js [demo|send|wallets]');
}
