/**
 * Agent Hotel - Hotel Management Agent
 *
 * Manages hotels, rooms, guests, and hotel services.
 *
 * Usage: node agent-hotel.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   guest   - List guests
 *   list    - List all hotels
 */

class Hotel {
  constructor(config) {
    this.id = `hotel-${Date.now()}`;
    this.name = config.name;
    this.location = config.location;
    this.starRating = config.starRating || 4;
    this.totalRooms = config.totalRooms || 100;
    this.amenities = config.amenities || [];
    this.rooms = [];
    this.checkInTime = config.checkInTime || '15:00';
    this.checkOutTime = config.checkOutTime || '11:00';
  }

  addRoom(room) {
    this.rooms.push(room);
  }
}

class Room {
  constructor(config) {
    this.id = `room-${Date.now()}`;
    this.number = config.number;
    this.type = config.type; // standard, deluxe, suite, presidential
    this.capacity = config.capacity || 2;
    this.pricePerNight = config.pricePerNight;
    this.status = 'available'; // available, occupied, maintenance
    this.amenities = config.amenities || [];
    this.floor = config.floor || 1;
    this.currentGuest = null;
  }

  checkIn(guest) {
    this.status = 'occupied';
    this.currentGuest = guest;
  }

  checkOut() {
    this.status = 'available';
    this.currentGuest = null;
  }

  setMaintenance() {
    this.status = 'maintenance';
  }
}

class Guest {
  constructor(config) {
    this.id = `guest-${Date.now()}`;
    this.name = config.name;
    this.email = config.email;
    this.phone = config.phone;
    this.loyaltyLevel = config.loyaltyLevel || 'silver'; // bronze, silver, gold, platinum
    this.loyaltyPoints = config.loyaltyPoints || 0;
    this.stayHistory = [];
    this.currentStay = null;
  }

  addLoyaltyPoints(points) {
    this.loyaltyPoints += points;
    this.updateLevel();
  }

  updateLevel() {
    if (this.loyaltyPoints >= 50000) this.loyaltyLevel = 'platinum';
    else if (this.loyaltyPoints >= 25000) this.loyaltyLevel = 'gold';
    else if (this.loyaltyPoints >= 10000) this.loyaltyLevel = 'silver';
    else this.loyaltyLevel = 'bronze';
  }
}

class Stay {
  constructor(config) {
    this.id = `stay-${Date.now()}`;
    this.guestId = config.guestId;
    this.roomId = config.roomId;
    this.checkIn = config.checkIn;
    this.checkOut = config.checkOut;
    this.status = 'checked-in'; // checked-in, checked-out, cancelled
    this.totalBill = 0;
    this.services = [];
    this.notes = '';
  }

  completeStay() {
    this.status = 'checked-out';
  }

  addService(service) {
    this.services.push(service);
    this.totalBill += service.cost;
  }

  calculateNights() {
    if (!this.checkIn || !this.checkOut) return 0;
    return Math.ceil((new Date(this.checkOut) - new Date(this.checkIn)) / (1000 * 60 * 60 * 24));
  }
}

class HotelService {
  constructor(config) {
    this.id = `svc-${Date.now()}`;
    this.name = config.name;
    this.type = config.type; // room-service, spa, restaurant, transportation
    this.cost = config.cost;
    this.available = config.available !== false;
  }
}

class Booking {
  constructor(config) {
    this.id = `book-${Date.now()}`;
    this.guestId = config.guestId;
    this.hotelId = config.hotelId;
    this.roomType = config.roomType;
    this.checkIn = config.checkIn;
    this.checkOut = config.checkOut;
    this.guests = config.guests || 1;
    this.status = 'confirmed'; // confirmed, cancelled, completed
    this.totalPrice = 0;
    this.specialRequests = '';
  }

  cancel() {
    this.status = 'cancelled';
  }
}

class HotelAgent {
  constructor(config = {}) {
    this.hotels = new Map();
    this.guests = new Map();
    this.stays = new Map();
    this.bookings = new Map();
    this.services = new Map();
    this.stats = {
      totalGuests: 0,
      currentGuests: 0,
      staysCompleted: 0,
      revenue: 0
    };
    this.initDemoData();
  }

  initDemoData() {
    // Demo hotel
    const hotel = new Hotel({
      name: 'Grand Plaza Hotel',
      location: 'Downtown',
      starRating: 5,
      totalRooms: 200,
      amenities: ['pool', 'spa', 'gym', 'restaurant', 'wifi', 'parking']
    });

    // Add rooms
    for (let i = 1; i <= 5; i++) {
      hotel.addRoom(new Room({
        number: `${i}01`,
        type: 'standard',
        capacity: 2,
        pricePerNight: 150,
        floor: i
      }));
    }

    for (let i = 1; i <= 3; i++) {
      hotel.addRoom(new Room({
        number: `${i}01`,
        type: 'suite',
        capacity: 4,
        pricePerNight: 350,
        floor: i + 5
      }));
    }

    this.hotels.set(hotel.id, hotel);

    // Demo guest
    const guest = new Guest({
      name: 'John Smith',
      email: 'john@example.com',
      phone: '+1-555-0123',
      loyaltyLevel: 'gold',
      loyaltyPoints: 25000
    });
    this.guests.set(guest.id, guest);
    this.stats.totalGuests++;

    // Demo stay
    const room = hotel.rooms[0];
    const stay = new Stay({
      guestId: guest.id,
      roomId: room.id,
      checkIn: '2024-04-01',
      checkOut: '2024-04-05'
    });
    room.checkIn(guest);
    stay.totalBill = 4 * room.pricePerNight;
    this.stays.set(stay.id, stay);
    guest.currentStay = stay;
    this.stats.currentGuests++;
    this.stats.revenue += stay.totalBill;
  }

  createHotel(config) {
    const hotel = new Hotel(config);
    this.hotels.set(hotel.id, hotel);
    console.log(`   Created hotel: ${hotel.name}`);
    return hotel;
  }

  addRoom(hotelId, roomConfig) {
    const hotel = this.hotels.get(hotelId);
    if (!hotel) {
      return { success: false, reason: 'Hotel not found' };
    }
    const room = new Room(roomConfig);
    hotel.addRoom(room);
    return { success: true, room };
  }

  registerGuest(config) {
    const guest = new Guest(config);
    this.guests.set(guest.id, guest);
    this.stats.totalGuests++;
    console.log(`   Registered guest: ${guest.name}`);
    return guest;
  }

  createBooking(config) {
    const booking = new Booking(config);
    // Calculate price based on room type
    const hotel = this.hotels.get(booking.hotelId);
    if (hotel) {
      const room = hotel.rooms.find(r => r.type === booking.roomType);
      if (room) {
        const nights = Math.ceil((new Date(booking.checkOut) - new Date(booking.checkIn)) / (1000 * 60 * 60 * 24));
        booking.totalPrice = nights * room.pricePerNight;
      }
    }
    this.bookings.set(booking.id, booking);
    console.log(`   Created booking: $${booking.totalPrice}`);
    return booking;
  }

  checkIn(bookingId) {
    const booking = this.bookings.get(bookingId);
    if (!booking) {
      return { success: false, reason: 'Booking not found' };
    }

    const guest = this.guests.get(booking.guestId);
    const hotel = this.hotels.get(booking.hotelId);
    if (!guest || !hotel) {
      return { success: false, reason: 'Guest or hotel not found' };
    }

    // Find available room
    const room = hotel.rooms.find(r => r.type === booking.roomType && r.status === 'available');
    if (!room) {
      return { success: false, reason: 'No rooms available' };
    }

    // Create stay
    const stay = new Stay({
      guestId: guest.id,
      roomId: room.id,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut
    });

    room.checkIn(guest);
    guest.currentStay = stay;
    this.stays.set(stay.id, stay);
    this.stats.currentGuests++;
    this.stats.revenue += booking.totalPrice;

    // Add loyalty points
    guest.addLoyaltyPoints(Math.floor(booking.totalPrice / 10));

    return { success: true, stay, room };
  }

  checkOut(stayId) {
    const stay = this.stays.get(stayId);
    if (!stay) {
      return { success: false, reason: 'Stay not found' };
    }

    const guest = this.guests.get(stay.guestId);
    if (!guest) {
      return { success: false, reason: 'Guest not found' };
    }

    // Find and free the room
    for (const hotel of this.hotels.values()) {
      const room = hotel.rooms.find(r => r.id === stay.roomId);
      if (room) {
        room.checkOut();
        break;
      }
    }

    stay.completeStay();
    guest.currentStay = null;
    this.stats.currentGuests--;
    this.stats.staysCompleted++;

    return { success: true, stay, totalBill: stay.totalBill };
  }

  addService(stayId, serviceConfig) {
    const stay = this.stays.get(stayId);
    if (!stay) {
      return { success: false, reason: 'Stay not found' };
    }

    const service = new HotelService(serviceConfig);
    stay.addService(service);
    this.services.set(service.id, service);

    return { success: true, service };
  }

  searchHotels(location = null, starRating = null, amenities = null) {
    let results = Array.from(this.hotels.values());

    if (location) {
      results = results.filter(h => h.location.toLowerCase().includes(location.toLowerCase()));
    }
    if (starRating) {
      results = results.filter(h => h.starRating >= starRating);
    }
    if (amenities) {
      results = results.filter(h => amenities.every(a => h.amenities.includes(a)));
    }

    return results;
  }

  listGuests(status = null) {
    if (status === 'checked-in') {
      return Array.from(this.guests.values()).filter(g => g.currentStay !== null);
    }
    return Array.from(this.guests.values());
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const hotel = new HotelAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Hotel Demo\n');

    // 1. List Hotels
    console.log('1. Hotels:');
    const hotels = Array.from(hotel.hotels.values());
    hotels.forEach(h => {
      console.log(`   - ${h.name}: ${h.location} (${h.starRating}★)`);
    });

    // 2. Create Hotel
    console.log('\n2. Create Hotel:');
    const newHotel = hotel.createHotel({
      name: 'Seaside Resort',
      location: 'Coastal Bay',
      starRating: 4,
      totalRooms: 150,
      amenities: ['pool', 'beach', 'spa', 'restaurant']
    });

    // 3. Add Rooms
    console.log('\n3. Add Rooms:');
    hotel.addRoom(newHotel.id, {
      number: '101',
      type: 'deluxe',
      capacity: 2,
      pricePerNight: 200
    });
    hotel.addRoom(newHotel.id, {
      number: '201',
      type: 'suite',
      capacity: 4,
      pricePerNight: 400
    });
    console.log(`   Total rooms: ${newHotel.rooms.length}`);

    // 4. Register Guest
    console.log('\n4. Register Guest:');
    const newGuest = hotel.registerGuest({
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+1-555-0456',
      loyaltyPoints: 5000
    });
    console.log(`   Level: ${newGuest.loyaltyLevel}, Points: ${newGuest.loyaltyPoints}`);

    // 5. Create Booking
    console.log('\n5. Create Booking:');
    const booking = hotel.createBooking({
      guestId: newGuest.id,
      hotelId: hotels[0].id,
      roomType: 'suite',
      checkIn: '2024-05-01',
      checkOut: '2024-05-05',
      guests: 2
    });
    console.log(`   Price: $${booking.totalPrice}`);

    // 6. Check In
    console.log('\n6. Check In:');
    const checkedIn = hotel.checkIn(booking.id);
    console.log(`   Room: ${checkedIn.room.number}`);

    // 7. Add Service
    console.log('\n7. Add Service:');
    const service = hotel.addService(checkedIn.stay.id, {
      name: 'Spa Treatment',
      type: 'spa',
      cost: 150
    });
    console.log(`   Service: ${service.service.name}, Cost: $${service.service.cost}`);

    // 8. Check Out
    console.log('\n8. Check Out:');
    const checkedOut = hotel.checkOut(checkedIn.stay.id);
    console.log(`   Total Bill: $${checkedOut.totalBill}`);
    console.log(`   Loyalty Points: ${newGuest.loyaltyPoints}`);

    // 9. Search Hotels
    console.log('\n9. Search Hotels:');
    const found = hotel.searchHotels('Downtown', 4);
    found.forEach(h => console.log(`   - ${h.name}`));

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = hotel.getStats();
    console.log(`   Total Guests: ${stats.totalGuests}`);
    console.log(`   Current Guests: ${stats.currentGuests}`);
    console.log(`   Stays Completed: ${stats.staysCompleted}`);
    console.log(`   Revenue: $${stats.revenue}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'guest':
    console.log('Guests:');
    hotel.listGuests().forEach(g => {
      console.log(`  ${g.name}: ${g.loyaltyLevel} (${g.loyaltyPoints} pts)`);
    });
    break;

  case 'list':
    console.log('All Hotels:');
    hotel.hotels.forEach(h => {
      console.log(`  ${h.name}: ${h.rooms.length} rooms`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-hotel.js [demo|guest|list]');
}
