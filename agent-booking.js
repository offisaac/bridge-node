/**
 * Agent Booking - Booking Management Agent
 *
 * Manages flight, hotel, car rentals, and package bookings.
 *
 * Usage: node agent-booking.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   book    - List bookings
 *   list    - List all bookings
 */

class FlightBooking {
  constructor(config) {
    this.id = `flight-${Date.now()}`;
    this.userId = config.userId;
    this.airline = config.airline;
    this.flightNumber = config.flightNumber;
    this.origin = config.origin;
    this.destination = config.destination;
    this.departureDate = config.departureDate;
    this.departureTime = config.departureTime;
    this.arrivalTime = config.arrivalTime;
    this.class = config.class || 'economy'; // economy, business, first
    this.price = config.price;
    this.status = config.status || 'pending'; // pending, confirmed, cancelled
    this.seatNumber = null;
    this.bookingRef = this.generateRef();
  }

  generateRef() {
    return 'BK' + Math.random().toString(36).substr(2, 6).toUpperCase();
  }

  confirm() {
    this.status = 'confirmed';
  }

  cancel() {
    this.status = 'cancelled';
  }

  assignSeat(seat) {
    this.seatNumber = seat;
  }
}

class HotelBooking {
  constructor(config) {
    this.id = `hotel-${Date.now()}`;
    this.userId = config.userId;
    this.hotelName = config.hotelName;
    this.location = config.location;
    this.checkIn = config.checkIn;
    this.checkOut = config.checkOut;
    this.roomType = config.roomType; // standard, deluxe, suite
    this.guests = config.guests || 1;
    this.pricePerNight = config.pricePerNight;
    this.totalPrice = this.calculateTotal();
    this.status = config.status || 'pending';
    this.bookingRef = this.generateRef();
    this.amenities = [];
  }

  generateRef() {
    return 'HT' + Math.random().toString(36).substr(2, 6).toUpperCase();
  }

  calculateTotal() {
    if (!this.checkIn || !this.checkOut) return 0;
    const nights = Math.ceil((new Date(this.checkOut) - new Date(this.checkIn)) / (1000 * 60 * 60 * 24));
    return nights * this.pricePerNight;
  }

  confirm() {
    this.status = 'confirmed';
  }

  cancel() {
    this.status = 'cancelled';
  }

  addAmenity(amenity) {
    this.amenities.push(amenity);
  }
}

class CarRental {
  constructor(config) {
    this.id = `car-${Date.now()}`;
    this.userId = config.userId;
    this.company = config.company;
    this.carType = config.carType; // sedan, suv, luxury
    this.pickupLocation = config.pickupLocation;
    this.dropoffLocation = config.dropoffLocation;
    this.pickupDate = config.pickupDate;
    this.dropoffDate = config.dropoffDate;
    this.dailyRate = config.dailyRate;
    this.totalPrice = this.calculateTotal();
    this.status = config.status || 'pending';
    this.bookingRef = this.generateRef();
  }

  generateRef() {
    return 'CR' + Math.random().toString(36).substr(2, 6).toUpperCase();
  }

  calculateTotal() {
    if (!this.pickupDate || !this.dropoffDate) return 0;
    const days = Math.ceil((new Date(this.dropoffDate) - new Date(this.pickupDate)) / (1000 * 60 * 60 * 24));
    return days * this.dailyRate;
  }

  confirm() {
    this.status = 'confirmed';
  }

  cancel() {
    this.status = 'cancelled';
  }
}

class BookingPackage {
  constructor(config) {
    this.id = `pkg-${Date.now()}`;
    this.userId = config.userId;
    this.name = config.name;
    this.flights = [];
    this.hotels = [];
    this.carRentals = [];
    this.totalPrice = 0;
    this.status = 'pending';
    this.bookingRef = this.generateRef();
  }

  generateRef() {
    return 'PK' + Math.random().toString(36).substr(2, 6).toUpperCase();
  }

  addFlight(flight) {
    this.flights.push(flight);
    this.totalPrice += flight.price;
  }

  addHotel(hotel) {
    this.hotels.push(hotel);
    this.totalPrice += hotel.totalPrice;
  }

  addCar(car) {
    this.carRentals.push(car);
    this.totalPrice += car.totalPrice;
  }

  confirm() {
    this.status = 'confirmed';
    this.flights.forEach(f => f.confirm());
    this.hotels.forEach(h => h.confirm());
    this.carRentals.forEach(c => c.confirm());
  }

  cancel() {
    this.status = 'cancelled';
    this.flights.forEach(f => f.cancel());
    this.hotels.forEach(h => h.cancel());
    this.carRentals.forEach(c => c.cancel());
  }
}

class BookingAgent {
  constructor(config = {}) {
    this.flights = new Map();
    this.hotels = new Map();
    this.cars = new Map();
    this.packages = new Map();
    this.stats = {
      flightsBooked: 0,
      hotelsBooked: 0,
      carsBooked: 0,
      packagesCreated: 0,
      revenue: 0
    };
    this.initDemoData();
  }

  initDemoData() {
    // Demo flight
    const flight = new FlightBooking({
      userId: 'user-1',
      airline: 'Japan Airlines',
      flightNumber: 'JL001',
      origin: 'Tokyo',
      destination: 'Paris',
      departureDate: '2024-04-01',
      departureTime: '11:30',
      arrivalTime: '18:45',
      class: 'business',
      price: 2500
    });
    flight.confirm();
    this.flights.set(flight.id, flight);
    this.stats.flightsBooked++;
    this.stats.revenue += flight.price;

    // Demo hotel
    const hotel = new HotelBooking({
      userId: 'user-1',
      hotelName: 'Grand Hyatt Tokyo',
      location: 'Tokyo',
      checkIn: '2024-04-01',
      checkOut: '2024-04-07',
      roomType: 'deluxe',
      guests: 2,
      pricePerNight: 350
    });
    hotel.confirm();
    hotel.addAmenity('WiFi');
    hotel.addAmenity('Breakfast');
    this.hotels.set(hotel.id, hotel);
    this.stats.hotelsBooked++;
    this.stats.revenue += hotel.totalPrice;
  }

  bookFlight(config) {
    const flight = new FlightBooking(config);
    flight.confirm();
    this.flights.set(flight.id, flight);
    this.stats.flightsBooked++;
    this.stats.revenue += flight.price;
    console.log(`   Booked flight: ${flight.airline} ${flight.flightNumber}`);
    return flight;
  }

  bookHotel(config) {
    const hotel = new HotelBooking(config);
    hotel.confirm();
    this.hotels.set(hotel.id, hotel);
    this.stats.hotelsBooked++;
    this.stats.revenue += hotel.totalPrice;
    console.log(`   Booked hotel: ${hotel.hotelName}`);
    return hotel;
  }

  bookCar(config) {
    const car = new CarRental(config);
    car.confirm();
    this.cars.set(car.id, car);
    this.stats.carsBooked++;
    this.stats.revenue += car.totalPrice;
    console.log(`   Booked car: ${car.carType} from ${car.company}`);
    return car;
  }

  createPackage(config) {
    const pkg = new BookingPackage(config);
    this.packages.set(pkg.id, pkg);
    this.stats.packagesCreated++;
    console.log(`   Created package: ${pkg.name}`);
    return pkg;
  }

  cancelBooking(type, bookingId) {
    let booking;
    switch (type) {
      case 'flight':
        booking = this.flights.get(bookingId);
        break;
      case 'hotel':
        booking = this.hotels.get(bookingId);
        break;
      case 'car':
        booking = this.cars.get(bookingId);
        break;
      case 'package':
        booking = this.packages.get(bookingId);
        break;
    }

    if (!booking) {
      return { success: false, reason: 'Booking not found' };
    }

    booking.cancel();
    return { success: true, booking };
  }

  listBookings(type = null) {
    switch (type) {
      case 'flight':
        return Array.from(this.flights.values());
      case 'hotel':
        return Array.from(this.hotels.values());
      case 'car':
        return Array.from(this.cars.values());
      case 'package':
        return Array.from(this.packages.values());
      default:
        return {
          flights: Array.from(this.flights.values()),
          hotels: Array.from(this.hotels.values()),
          cars: Array.from(this.cars.values()),
          packages: Array.from(this.packages.values())
        };
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const booking = new BookingAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Booking Demo\n');

    // 1. List Bookings
    console.log('1. Existing Bookings:');
    const flights = booking.listBookings('flight');
    flights.forEach(f => {
      console.log(`   - Flight: ${f.origin} → ${f.destination} (${f.status})`);
    });

    const hotels = booking.listBookings('hotel');
    hotels.forEach(h => {
      console.log(`   - Hotel: ${h.hotelName} (${h.status})`);
    });

    // 2. Book New Flight
    console.log('\n2. Book Flight:');
    const newFlight = booking.bookFlight({
      userId: 'user-2',
      airline: 'Air France',
      flightNumber: 'AF293',
      origin: 'Paris',
      destination: 'New York',
      departureDate: '2024-06-15',
      departureTime: '14:00',
      arrivalTime: '16:30',
      class: 'economy',
      price: 800
    });
    console.log(`   Ref: ${newFlight.bookingRef}`);

    // 3. Book Hotel
    console.log('\n3. Book Hotel:');
    const newHotel = booking.bookHotel({
      userId: 'user-2',
      hotelName: 'The Plaza NYC',
      location: 'New York',
      checkIn: '2024-06-15',
      checkOut: '2024-06-20',
      roomType: 'suite',
      guests: 2,
      pricePerNight: 800
    });
    console.log(`   Ref: ${newHotel.bookingRef}, Total: $${newHotel.totalPrice}`);

    // 4. Book Car
    console.log('\n4. Book Car:');
    const newCar = booking.bookCar({
      userId: 'user-2',
      company: 'Hertz',
      carType: 'luxury',
      pickupLocation: 'JFK Airport',
      dropoffLocation: 'JFK Airport',
      pickupDate: '2024-06-15',
      dropoffDate: '2024-06-20',
      dailyRate: 150
    });
    console.log(`   Ref: ${newCar.bookingRef}, Total: $${newCar.totalPrice}`);

    // 5. Create Package
    console.log('\n5. Create Package:');
    const pkg = booking.createPackage({
      userId: 'user-3',
      name: 'Europe Tour'
    });
    const flight1 = booking.bookFlight({
      userId: 'user-3',
      airline: 'British Airways',
      flightNumber: 'BA123',
      origin: 'London',
      destination: 'Rome',
      departureDate: '2024-09-01',
      departureTime: '08:00',
      arrivalTime: '11:30',
      class: 'economy',
      price: 200
    });
    pkg.addFlight(flight1);

    const hotel1 = booking.bookHotel({
      userId: 'user-3',
      hotelName: 'Hotel Roma',
      location: 'Rome',
      checkIn: '2024-09-01',
      checkOut: '2024-09-05',
      roomType: 'standard',
      guests: 2,
      pricePerNight: 120
    });
    pkg.addHotel(hotel1);
    pkg.confirm();

    console.log(`   Package: ${pkg.name}, Total: $${pkg.totalPrice}`);
    console.log(`   Ref: ${pkg.bookingRef}`);

    // 6. Cancel Booking
    console.log('\n6. Cancel Booking:');
    const cancelled = booking.cancelBooking('flight', newFlight.id);
    console.log(`   Cancelled: ${cancelled.booking.status}`);

    // 7. List All Bookings
    console.log('\n7. All Bookings:');
    const all = booking.listBookings();
    console.log(`   Flights: ${all.flights.length}`);
    console.log(`   Hotels: ${all.hotels.length}`);
    console.log(`   Cars: ${all.cars.length}`);
    console.log(`   Packages: ${all.packages.length}`);

    // 8. Statistics
    console.log('\n8. Statistics:');
    const stats = booking.getStats();
    console.log(`   Flights Booked: ${stats.flightsBooked}`);
    console.log(`   Hotels Booked: ${stats.hotelsBooked}`);
    console.log(`   Cars Booked: ${stats.carsBooked}`);
    console.log(`   Total Revenue: $${stats.revenue}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'book':
    console.log('Bookings:');
    booking.listBookings('flight').forEach(f => {
      console.log(`  Flight: ${f.origin} → ${f.destination} [${f.status}]`);
    });
    booking.listBookings('hotel').forEach(h => {
      console.log(`  Hotel: ${h.hotelName} [${h.status}]`);
    });
    break;

  case 'list':
    console.log('All Bookings:');
    const allBookings = booking.listBookings();
    console.log(`Flights: ${allBookings.flights.length}`);
    console.log(`Hotels: ${allBookings.hotels.length}`);
    console.log(`Cars: ${allBookings.cars.length}`);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-booking.js [demo|book|list]');
}
