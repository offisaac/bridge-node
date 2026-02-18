/**
 * Webhooks Example
 * Webhooks 使用示例
 */

const { WebhookManager, WebhookEvent } = require('./webhooks');

async function main() {
  console.log('=== Webhooks Example ===\n');

  const manager = new WebhookManager({
    maxConcurrent: 3
  });

  // Create webhook
  console.log('1. Creating webhook...');
  const webhook = manager.createWebhook(
    'https://httpbin.org/post', // Test endpoint
    ['user.created', 'session.created', '*'], // Events
    {
      name: 'Test Webhook',
      secret: 'my-secret-key',
      retry: 2,
      timeout: 5000
    }
  );
  console.log('   Created:', webhook.toJSON());

  // List webhooks
  console.log('\n2. List webhooks:');
  const webhooks = manager.listWebhooks();
  webhooks.forEach(w => console.log('  -', w.name, w.url));

  // Trigger events
  console.log('\n3. Triggering events...');

  // Trigger user.created
  console.log('   Triggering user.created...');
  let deliveries = await manager.trigger(WebhookEvent.USER_CREATED, {
    user: { id: 1, username: 'john', email: 'john@example.com' }
  });
  console.log('   Deliveries:', deliveries.length);

  // Trigger session.created
  console.log('   Triggering session.created...');
  deliveries = await manager.trigger(WebhookEvent.SESSION_CREATED, {
    session: { id: 'abc123', name: 'Test Session' }
  });
  console.log('   Deliveries:', deliveries.length);

  // Wait for deliveries to complete
  await new Promise(r => setTimeout(r, 2000));

  // Check stats
  console.log('\n4. Stats:');
  const stats = manager.getStats();
  console.log('  ', stats);

  // Get delivery history
  console.log('\n5. Delivery history:');
  const history = manager.getDeliveries(webhook.id, 5);
  history.forEach(d => {
    console.log('  -', d.event, ':', d.status, 'attempts:', d.attempts);
  });

  // Test webhook
  console.log('\n6. Testing webhook...');
  const testResult = await manager.testWebhook(webhook.id);
  console.log('  Test result:', testResult.status, testResult.response?.status);

  // Update webhook
  console.log('\n7. Updating webhook...');
  manager.updateWebhook(webhook.id, { enabled: false });
  console.log('  Disabled webhook');

  // Delete webhook
  console.log('\n8. Deleting webhook...');
  manager.deleteWebhook(webhook.id);
  console.log('  Deleted webhook');

  console.log('\n=== Done ===');
}

main().catch(console.error);
