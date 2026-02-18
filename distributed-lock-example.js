/**
 * Distributed Lock Example
 * 使用示例
 */

const { LockManager, RedisLock, FileLock, RedisSemaphore, createLockManager } = require('./distributed-lock');

// ========== Redis Lock Example ==========

async function redisLockExample() {
  console.log('=== Redis Lock Example ===');

  // 创建锁管理器
  const manager = createLockManager({
    redisUrl: 'redis://localhost:6379'
  });

  // 基础锁
  console.log('\n1. Basic Lock:');
  const lock = manager.getRedisLock('resource-1', { timeout: 10000 });

  const acquired = await lock.acquire();
  console.log(`   Acquired: ${acquired}`);
  console.log(`   Is locked: ${await lock.isLocked()}`);

  await lock.release();
  console.log('   Released');

  // 作用域锁
  console.log('\n2. Scoped Lock:');
  await manager.withLock('resource-2', async () => {
    console.log('   Inside lock scope');
    await new Promise(r => setTimeout(r, 100));
    console.log('   Leaving lock scope');
  });

  // 获取锁信息
  console.log('\n3. Lock Info:');
  const info = await manager.getLockInfo('resource-1');
  console.log('   ', info);

  await manager.close();
  console.log('\nRedis Lock Example Done');
}

// ========== File Lock Example ==========

async function fileLockExample() {
  console.log('\n=== File Lock Example ===');

  const manager = createLockManager({
    useRedis: false,
    fileLockDir: '/tmp/test-locks'
  });

  // 基础文件锁
  console.log('\n1. Basic File Lock:');
  const lock = manager.getFileLock('test-resource', { timeout: 5000 });

  const acquired = await lock.acquire();
  console.log(`   Acquired: ${acquired}`);
  console.log(`   Is locked: ${await lock.isLocked()}`);

  await lock.release();
  console.log('   Released');

  // 作用域锁
  console.log('\n2. Scoped File Lock:');
  await manager.withLock('test-resource-2', async () => {
    console.log('   Inside file lock scope');
  });

  console.log('\nFile Lock Example Done');
}

// ========== Semaphore Example ==========

async function semaphoreExample() {
  console.log('\n=== Semaphore Example ===');

  const manager = createLockManager({
    redisUrl: 'redis://localhost:6379'
  });

  // 创建信号量
  const sem = new RedisSemaphore(manager.redis, 'api-limit', 3);

  console.log('\n1. Acquire semaphores:');

  for (let i = 0; i < 5; i++) {
    const acquired = await sem.acquire(1000);
    const available = await sem.available();
    console.log(`   Attempt ${i + 1}: ${acquired ? 'OK' : 'FAILED'}, Available: ${available}`);
  }

  // 释放一个
  console.log('\n2. Release one:');
  await sem.release();
  console.log(`   Available: ${await sem.available()}`);

  await manager.close();
  console.log('\nSemaphore Example Done');
}

// ========== Run Examples ==========

async function main() {
  const args = process.argv.slice(2);
  const example = args[0] || 'redis';

  try {
    if (example === 'redis') {
      await redisLockExample();
    } else if (example === 'file') {
      await fileLockExample();
    } else if (example === 'semaphore') {
      await semaphoreExample();
    } else if (example === 'all') {
      await redisLockExample();
      await fileLockExample();
      await semaphoreExample();
    } else {
      console.log('Usage: node distributed-lock-example.js [redis|file|semaphore|all]');
    }
  } catch (error) {
    console.error('Error:', error.message);
    console.log('\nNote: Make sure Redis is running on localhost:6379');
  }
}

main();
