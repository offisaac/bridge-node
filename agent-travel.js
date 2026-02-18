/**
 * Agent Travel - Travel Management Agent
 *
 * Manages travel bookings, itineraries, destinations, and travel preferences.
 *
 * Usage: node agent-travel.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   trip    - List trips
 *   list    - List all travel data
 */

class Destination {
  constructor(config) {
    this.id = `dest-${Date.now()}`;
    this.name = config.name;
    this.country = config.country;
    this.region = config.region; // asia, europe, americas, africa, oceania
    this.category = config.category || []; // beach, mountain, city, cultural
    this.rating = config.rating || 0;
    this.avgCost = config.avgCost || 0; // daily cost
    this.bestSeason = config.bestSeason || [];
    this.attractions = [];
  }

  addAttraction(attraction) {
    this.attractions.push(attraction);
  }
}

class Trip {
  constructor(config) {
    this.id = `trip-${Date.now()}`;
    this.userId = config.userId;
    this.name = config.name;
    this.destination = config.destination;
    this.startDate = config.startDate;
    this.endDate = config.endDate;
    this.status = config.status || 'planned'; // planned, booked, ongoing, completed, cancelled
    this.itinerary = [];
    this.budget = config.budget || 0;
    this.actualCost = 0;
    this.notes = '';
  }

  addItineraryItem(item) {
    this.itinerary.push({
      ...item,
      day: this.itinerary.length + 1
    });
  }

  complete() {
    this.status = 'completed';
  }

  cancel() {
    this.status = 'cancelled';
  }

  calculateDuration() {
    if (!this.startDate || !this.endDate) return 0;
    const start = new Date(this.startDate);
    const end = new Date(this.endDate);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  }
}

class TravelPreferences {
  constructor(config) {
    this.id = `pref-${Date.now()}`;
    this.userId = config.userId;
    this.preferredAirline = config.preferredAirline || '';
    this.preferredHotelChain = config.preferredHotelChain || '';
    this.seatPreference = config.seatPreference || 'window'; // window, aisle, middle
    this.mealPreference = config.mealPreference || 'none'; // vegetarian, vegan, halal, none
    this.budgetLevel = config.budgetLevel || 'medium'; // low, medium, high, luxury
    this.travelStyle = config.travelStyle || []; // adventure, relax, cultural, foodie
  }
}

class TravelAgent {
  constructor(config = {}) {
    this.destinations = new Map();
    this.trips = new Map();
    this.preferences = new Map();
    this.bookings = new Map();
    this.stats = {
      tripsCreated: 0,
      tripsCompleted: 0,
      totalDestinations: 0
    };
    this.initDemoData();
  }

  initDemoData() {
    // Demo destinations
    const destinations = [
      { name: 'Tokyo', country: 'Japan', region: 'asia', category: ['city', 'cultural'], rating: 4.8, avgCost: 150, bestSeason: ['spring', 'fall'] },
      { name: 'Paris', country: 'France', region: 'europe', category: ['city', 'cultural'], rating: 4.7, avgCost: 200, bestSeason: ['spring', 'fall'] },
      { name: 'Bali', country: 'Indonesia', region: 'asia', category: ['beach', 'relax'], rating: 4.6, avgCost: 100, bestSeason: ['dry'] },
      { name: 'New York', country: 'USA', region: 'americas', category: ['city'], rating: 4.5, avgCost: 250, bestSeason: ['spring', 'fall'] },
      { name: 'Swiss Alps', country: 'Switzerland', region: 'europe', category: ['mountain', 'adventure'], rating: 4.9, avgCost: 300, bestSeason: ['winter', 'summer'] }
    ];

    destinations.forEach(d => {
      const dest = new Destination(d);
      this.destinations.set(dest.id, dest);
      this.stats.totalDestinations++;
    });

    // Demo trips
    const trip = new Trip({
      userId: 'user-1',
      name: 'Tokyo Adventure',
      destination: 'Tokyo',
      startDate: '2024-04-01',
      endDate: '2024-04-07',
      budget: 2000
    });
    trip.addItineraryItem({ activity: 'Visit Senso-ji Temple', time: '09:00', location: 'Asakusa' });
    trip.addItineraryItem({ activity: 'Explore Shibuya Crossing', time: '14:00', location: 'Shibuya' });
    trip.status = 'booked';
    this.trips.set(trip.id, trip);
    this.stats.tripsCreated++;
    this.stats.tripsCompleted++;
  }

  addDestination(config) {
    const dest = new Destination(config);
    this.destinations.set(dest.id, dest);
    this.stats.totalDestinations++;
    console.log(`   Added destination: ${dest.name}, ${dest.country}`);
    return dest;
  }

  createTrip(config) {
    const trip = new Trip(config);
    this.trips.set(trip.id, trip);
    this.stats.tripsCreated++;
    console.log(`   Created trip: ${trip.name} to ${trip.destination}`);
    return trip;
  }

  bookTrip(tripId) {
    const trip = this.trips.get(tripId);
    if (!trip) {
      return { success: false, reason: 'Trip not found' };
    }
    trip.status = 'booked';
    return { success: true, trip };
  }

  completeTrip(tripId) {
    const trip = this.trips.get(tripId);
    if (!trip) {
      return { success: false, reason: 'Trip not found' };
    }
    trip.complete();
    this.stats.tripsCompleted++;
    return { success: true, trip };
  }

  searchDestinations(criteria) {
    const dests = Array.from(this.destinations.values());
    return dests.filter(d => {
      if (criteria.region && d.region !== criteria.region) return false;
      if (criteria.category && !d.category.includes(criteria.category)) return false;
      if (criteria.maxCost && d.avgCost > criteria.maxCost) return false;
      return true;
    });
  }

  getRecommendations(userId) {
    const prefs = this.preferences.get(userId);
    const dests = Array.from(this.destinations.values());

    if (!prefs) return dests.slice(0, 3);

    return dests
      .filter(d => d.category.some(c => prefs.travelStyle.includes(c)))
      .slice(0, 5);
  }

  savePreferences(config) {
    const prefs = new TravelPreferences(config);
    this.preferences.set(prefs.userId, prefs);
    return prefs;
  }

  listTrips(status = null) {
    const trips = Array.from(this.trips.values());
    if (status) {
      return trips.filter(t => t.status === status);
    }
    return trips;
  }

  getStats() {
    return {
      ...this.stats,
      destinations: this.destinations.size,
      trips: this.trips.size,
      preferences: this.preferences.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const travel = new TravelAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Travel Demo\n');

    // 1. List Destinations
    console.log('1. Destinations:');
    const dests = Array.from(travel.destinations.values());
    dests.forEach(d => {
      console.log(`   - ${d.name}, ${d.country}: $${d.avgCost}/day (${d.rating}★)`);
    });

    // 2. Add Destination
    console.log('\n2. Add Destination:');
    travel.addDestination({
      name: 'Barcelona',
      country: 'Spain',
      region: 'europe',
      category: ['city', 'beach'],
      rating: 4.6,
      avgCost: 180,
      bestSeason: ['summer', 'spring']
    });

    // 3. Create Trip
    console.log('\n3. Create Trip:');
    const newTrip = travel.createTrip({
      userId: 'user-2',
      name: 'Paris Romantic Getaway',
      destination: 'Paris',
      startDate: '2024-06-15',
      endDate: '2024-06-20',
      budget: 3000
    });

    // 4. Add Itinerary
    console.log('\n4. Add Itinerary:');
    newTrip.addItineraryItem({ activity: 'Eiffel Tower Visit', time: '10:00', location: 'Champ de Mars' });
    newTrip.addItineraryItem({ activity: 'Louvre Museum', time: '14:00', location: 'Louvre' });
    console.log(`   Added ${newTrip.itinerary.length} itinerary items`);

    // 5. Book Trip
    console.log('\n5. Book Trip:');
    travel.bookTrip(newTrip.id);
    console.log(`   Trip status: ${newTrip.status}`);

    // 6. Search Destinations
    console.log('\n6. Search Destinations:');
    const asiaDests = travel.searchDestinations({ region: 'asia', maxCost: 150 });
    asiaDests.forEach(d => {
      console.log(`   Found: ${d.name} ($${d.avgCost}/day)`);
    });

    // 7. Save Preferences
    console.log('\n7. Save Preferences:');
    travel.savePreferences({
      userId: 'user-1',
      preferredAirline: 'Japan Airlines',
      seatPreference: 'window',
      budgetLevel: 'high',
      travelStyle: ['cultural', 'foodie']
    });
    console.log('   Preferences saved');

    // 8. Get Recommendations
    console.log('\n8. Recommendations:');
    const recs = travel.getRecommendations('user-1');
    recs.forEach(d => {
      console.log(`   - ${d.name}: ${d.category.join(', ')}`);
    });

    // 9. List Trips
    console.log('\n9. Trips:');
    travel.listTrips().forEach(t => {
      console.log(`   - ${t.name}: ${t.status}`);
    });

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = travel.getStats();
    console.log(`   Total Destinations: ${stats.destinations}`);
    console.log(`   Trips Created: ${stats.tripsCreated}`);
    console.log(`   Trips Completed: ${stats.tripsCompleted}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'trip':
    console.log('Trips:');
    travel.listTrips().forEach(t => {
      console.log(`  ${t.name}: ${t.status}`);
    });
    break;

  case 'list':
    console.log('All Travel Data:');
    console.log(`Destinations: ${travel.destinations.size}`);
    console.log(`Trips: ${travel.trips.size}`);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-travel.js [demo|trip|list]');
}
