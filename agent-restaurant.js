/**
 * Agent Restaurant - Restaurant Management Agent
 *
 * Manages restaurants, menus, orders, and dining experiences.
 *
 * Usage: node agent-restaurant.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   order   - List orders
 *   list    - List all restaurants
 */

class Restaurant {
  constructor(config) {
    this.id = `rest-${Date.now()}`;
    this.name = config.name;
    this.cuisine = config.cuisine;
    this.location = config.location;
    this.rating = config.rating || 0;
    this.priceRange = config.priceRange || '$$'; // $, $$, $$$, $$$$
    this.capacity = config.capacity || 50;
    this.tables = config.tables || 10;
    this.openTime = config.openTime || '11:00';
    this.closeTime = config.closeTime || '22:00';
    this.features = config.features || []; // outdoor, vegan, wifi, parking
    this.menu = [];
  }

  addMenuItem(item) {
    this.menu.push(item);
  }
}

class MenuItem {
  constructor(config) {
    this.id = `item-${Date.now()}`;
    this.name = config.name;
    this.description = config.description;
    this.category = config.category; // appetizer, main, dessert, beverage
    this.price = config.price;
    this.availability = config.availability !== false;
    this.vegetarian = config.vegetarian || false;
    this.vegan = config.vegan || false;
    this.glutenFree = config.glutenFree || false;
    this.calories = config.calories || 0;
  }

  setAvailability(available) {
    this.availability = available;
  }
}

class Order {
  constructor(config) {
    this.id = `order-${Date.now()}`;
    this.restaurantId = config.restaurantId;
    this.userId = config.userId;
    this.items = [];
    this.status = 'pending'; // pending, confirmed, preparing, ready, delivered, cancelled
    this.total = 0;
    this.tableNumber = config.tableNumber || null;
    this.specialInstructions = '';
    this.createdAt = Date.now();
  }

  addItem(menuItem, quantity = 1) {
    this.items.push({ item: menuItem, quantity });
    this.total += menuItem.price * quantity;
  }

  confirm() {
    this.status = 'confirmed';
  }

  prepare() {
    this.status = 'preparing';
  }

  ready() {
    this.status = 'ready';
  }

  deliver() {
    this.status = 'delivered';
  }

  cancel() {
    this.status = 'cancelled';
  }
}

class Table {
  constructor(config) {
    this.id = `table-${Date.now()}`;
    this.number = config.number;
    this.capacity = config.capacity;
    this.status = 'available'; // available, occupied, reserved
    this.currentOrder = null;
  }

  occupy(order) {
    this.status = 'occupied';
    this.currentOrder = order;
  }

  release() {
    this.status = 'available';
    this.currentOrder = null;
  }
}

class Review {
  constructor(config) {
    this.id = `review-${Date.now()}`;
    this.restaurantId = config.restaurantId;
    this.userId = config.userId;
    this.rating = config.rating;
    this.comment = config.comment;
    this.date = Date.now();
  }
}

class RestaurantAgent {
  constructor(config = {}) {
    this.restaurants = new Map();
    this.orders = new Map();
    this.tables = new Map();
    this.reviews = new Map();
    this.stats = {
      restaurantsCreated: 0,
      ordersPlaced: 0,
      ordersDelivered: 0,
      revenue: 0
    };
    this.initDemoData();
  }

  initDemoData() {
    // Demo restaurant
    const restaurant = new Restaurant({
      name: 'Sakura Japanese',
      cuisine: 'Japanese',
      location: 'Downtown',
      rating: 4.7,
      priceRange: '$$$',
      capacity: 60,
      features: ['sushi-bar', 'private-room', 'wifi']
    });

    restaurant.addMenuItem(new MenuItem({
      name: 'Salmon Sashimi',
      description: 'Fresh salmon slices',
      category: 'appetizer',
      price: 18,
      vegetarian: false
    }));

    restaurant.addMenuItem(new MenuItem({
      name: 'Dragon Roll',
      description: 'Eel and avocado roll',
      category: 'main',
      price: 22,
      vegetarian: false
    }));

    restaurant.addMenuItem(new MenuItem({
      name: 'Veggie Tempura',
      description: 'Assorted vegetable tempura',
      category: 'main',
      price: 16,
      vegetarian: true,
      vegan: true
    }));

    restaurant.addMenuItem(new MenuItem({
      name: 'Green Tea Ice Cream',
      description: 'Traditional dessert',
      category: 'dessert',
      price: 6,
      vegetarian: true
    }));

    this.restaurants.set(restaurant.id, restaurant);
    this.stats.restaurantsCreated++;

    // Demo table
    const table = new Table({ number: 5, capacity: 4 });
    this.tables.set(table.id, table);

    // Demo order
    const order = new Order({
      restaurantId: restaurant.id,
      userId: 'user-1',
      tableNumber: 5
    });
    const menuItem = restaurant.menu[0];
    order.addItem(menuItem, 2);
    order.confirm();
    table.occupy(order);

    this.orders.set(order.id, order);
    this.stats.ordersPlaced++;
    this.stats.revenue += order.total;
  }

  createRestaurant(config) {
    const restaurant = new Restaurant(config);
    this.restaurants.set(restaurant.id, restaurant);
    this.stats.restaurantsCreated++;
    console.log(`   Created restaurant: ${restaurant.name}`);
    return restaurant;
  }

  addMenuItem(restaurantId, itemConfig) {
    const restaurant = this.restaurants.get(restaurantId);
    if (!restaurant) {
      return { success: false, reason: 'Restaurant not found' };
    }
    const item = new MenuItem(itemConfig);
    restaurant.addMenuItem(item);
    return { success: true, item };
  }

  createOrder(config) {
    const order = new Order(config);
    this.orders.set(order.id, order);
    this.stats.ordersPlaced++;
    console.log(`   Created order #${order.id.slice(-6)}`);
    return order;
  }

  addToOrder(orderId, menuItem, quantity = 1) {
    const order = this.orders.get(orderId);
    if (!order) {
      return { success: false, reason: 'Order not found' };
    }
    order.addItem(menuItem, quantity);
    this.stats.revenue += menuItem.price * quantity;
    return { success: true, order };
  }

  updateOrderStatus(orderId, status) {
    const order = this.orders.get(orderId);
    if (!order) {
      return { success: false, reason: 'Order not found' };
    }

    switch (status) {
      case 'confirm':
        order.confirm();
        break;
      case 'prepare':
        order.prepare();
        break;
      case 'ready':
        order.ready();
        break;
      case 'deliver':
        order.deliver();
        this.stats.ordersDelivered++;
        break;
      case 'cancel':
        order.cancel();
        break;
    }

    return { success: true, order };
  }

  searchRestaurants(cuisine = null, priceRange = null, rating = null) {
    let results = Array.from(this.restaurants.values());

    if (cuisine) {
      results = results.filter(r => r.cuisine.toLowerCase().includes(cuisine.toLowerCase()));
    }
    if (priceRange) {
      results = results.filter(r => r.priceRange === priceRange);
    }
    if (rating) {
      results = results.filter(r => r.rating >= rating);
    }

    return results;
  }

  getRestaurantMenu(restaurantId) {
    const restaurant = this.restaurants.get(restaurantId);
    return restaurant ? restaurant.menu : [];
  }

  listOrders(status = null) {
    let orders = Array.from(this.orders.values());
    if (status) {
      orders = orders.filter(o => o.status === status);
    }
    return orders;
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const restaurant = new RestaurantAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Restaurant Demo\n');

    // 1. List Restaurants
    console.log('1. Restaurants:');
    const rests = Array.from(restaurant.restaurants.values());
    rests.forEach(r => {
      console.log(`   - ${r.name}: ${r.cuisine} (${r.priceRange}) ${r.rating}★`);
    });

    // 2. Create Restaurant
    console.log('\n2. Create Restaurant:');
    const newRest = restaurant.createRestaurant({
      name: 'Pasta Palace',
      cuisine: 'Italian',
      location: 'Midtown',
      rating: 4.5,
      priceRange: '$$',
      features: ['outdoor', 'wifi', 'live-music']
    });

    // 3. Add Menu Items
    console.log('\n3. Add Menu Items:');
    restaurant.addMenuItem(newRest.id, {
      name: 'Margherita Pizza',
      description: 'Classic tomato and mozzarella',
      category: 'main',
      price: 16,
      vegetarian: true
    });
    restaurant.addMenuItem(newRest.id, {
      name: 'Tiramisu',
      description: 'Coffee-flavored dessert',
      category: 'dessert',
      price: 8,
      vegetarian: true
    });
    console.log(`   Added ${newRest.menu.length} menu items`);

    // 4. Search Restaurants
    console.log('\n4. Search Restaurants:');
    const japanese = restaurant.searchRestaurants('japanese');
    japanese.forEach(r => console.log(`   - ${r.name}`));

    // 5. Create Order
    console.log('\n5. Create Order:');
    const menuItems = rests[0].menu;
    const order = restaurant.createOrder({
      restaurantId: rests[0].id,
      userId: 'user-2',
      tableNumber: 8
    });
    restaurant.addToOrder(order.id, menuItems[1], 2);
    console.log(`   Order total: $${order.total}`);

    // 6. Update Order Status
    console.log('\n6. Update Order Status:');
    restaurant.updateOrderStatus(order.id, 'confirm');
    console.log(`   Status: ${order.status}`);

    restaurant.updateOrderStatus(order.id, 'prepare');
    console.log(`   Status: ${order.status}`);

    restaurant.updateOrderStatus(order.id, 'ready');
    console.log(`   Status: ${order.status}`);

    restaurant.updateOrderStatus(order.id, 'deliver');
    console.log(`   Status: ${order.status}`);

    // 7. List Orders
    console.log('\n7. Orders:');
    const allOrders = restaurant.listOrders();
    allOrders.forEach(o => {
      console.log(`   - Order #${o.id.slice(-6)}: $${o.total} [${o.status}]`);
    });

    // 8. List Pending Orders
    console.log('\n8. Pending Orders:');
    const pending = restaurant.listOrders('pending');
    console.log(`   Count: ${pending.length}`);

    // 9. Get Menu
    console.log('\n9. Menu:');
    const menu = restaurant.getRestaurantMenu(rests[0].id);
    menu.forEach(item => {
      console.log(`   - ${item.name}: $${item.price} [${item.category}]`);
    });

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = restaurant.getStats();
    console.log(`   Restaurants: ${stats.restaurantsCreated}`);
    console.log(`   Orders Placed: ${stats.ordersPlaced}`);
    console.log(`   Orders Delivered: ${stats.ordersDelivered}`);
    console.log(`   Revenue: $${stats.revenue}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'order':
    console.log('Orders:');
    restaurant.listOrders().forEach(o => {
      console.log(`  #${o.id.slice(-6)}: $${o.total} [${o.status}]`);
    });
    break;

  case 'list':
    console.log('All Restaurants:');
    restaurant.restaurants.forEach(r => {
      console.log(`  ${r.name}: ${r.cuisine}`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-restaurant.js [demo|order|list]');
}
