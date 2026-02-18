/**
 * Agent Reservation - Reservation Management Agent
 *
 * Manages table reservations, appointment bookings, and scheduling.
 *
 * Usage: node agent-reservation.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   res     - List reservations
 *   list    - List all reservations
 */

class Reservation {
  constructor(config) {
    this.id = `res-${Date.now()}`;
    this.userId = config.userId;
    this.type = config.type; // table, appointment, event, service
    this.entityId = config.entityId; // restaurantId, serviceId, etc.
    this.entityName = config.entityName;
    this.date = config.date;
    this.time = config.time;
    this.duration = config.duration || 60; // minutes
    this.guests = config.guests || 1;
    this.status = config.status || 'pending'; // pending, confirmed, cancelled, completed
    this.notes = config.notes || '';
    this.confirmationCode = this.generateCode();
    this.createdAt = Date.now();
  }

  generateCode() {
    return 'RS' + Math.random().toString(36).substr(2, 4).toUpperCase();
  }

  confirm() {
    this.status = 'confirmed';
  }

  cancel() {
    this.status = 'cancelled';
  }

  complete() {
    this.status = 'completed';
  }

  updateTime(date, time) {
    this.date = date;
    this.time = time;
  }
}

class TableReservation extends Reservation {
  constructor(config) {
    super(config);
    this.type = 'table';
    this.tableNumber = null;
    this.specialRequests = [];
  }

  assignTable(tableNumber) {
    this.tableNumber = tableNumber;
  }

  addSpecialRequest(request) {
    this.specialRequests.push(request);
  }
}

class AppointmentReservation extends Reservation {
  constructor(config) {
    super(config);
    this.type = 'appointment';
    this.service = config.service;
    this.provider = config.provider || null;
    this.location = config.location;
  }

  assignProvider(provider) {
    this.provider = provider;
  }
}

class EventReservation extends Reservation {
  constructor(config) {
    super(config);
    this.type = 'event';
    this.eventName = config.eventName;
    this.venue = config.venue;
    this.ticketCount = config.ticketCount || 1;
    this.ticketPrice = config.ticketPrice || 0;
  }

  totalCost() {
    return this.ticketCount * this.ticketPrice;
  }
}

class TimeSlot {
  constructor(time, available) {
    this.time = time;
    this.available = available;
  }
}

class ReservationAgent {
  constructor(config = {}) {
    this.reservations = new Map();
    this.availability = new Map(); // entityId -> available slots
    this.stats = {
      totalReservations: 0,
      confirmedCount: 0,
      cancelledCount: 0,
      completedCount: 0
    };
    this.initDemoData();
  }

  initDemoData() {
    // Demo table reservation
    const tableRes = new TableReservation({
      userId: 'user-1',
      entityName: 'Sakura Restaurant',
      date: '2024-04-15',
      time: '19:00',
      duration: 90,
      guests: 4
    });
    tableRes.confirm();
    tableRes.assignTable(12);
    this.reservations.set(tableRes.id, tableRes);
    this.stats.totalReservations++;
    this.stats.confirmedCount++;

    // Demo appointment reservation
    const apptRes = new AppointmentReservation({
      userId: 'user-1',
      entityName: 'Wellness Spa',
      service: 'Swedish Massage',
      date: '2024-04-16',
      time: '14:00',
      duration: 60,
      location: 'Downtown Branch'
    });
    apptRes.confirm();
    this.reservations.set(apptRes.id, apptRes);
    this.stats.totalReservations++;
    this.stats.confirmedCount++;
  }

  createTableReservation(config) {
    const res = new TableReservation(config);
    this.reservations.set(res.id, res);
    this.stats.totalReservations++;
    console.log(`   Created table reservation at ${res.entityName}`);
    return res;
  }

  createAppointmentReservation(config) {
    const res = new AppointmentReservation(config);
    this.reservations.set(res.id, res);
    this.stats.totalReservations++;
    console.log(`   Created appointment for ${res.service}`);
    return res;
  }

  createEventReservation(config) {
    const res = new EventReservation(config);
    this.reservations.set(res.id, res);
    this.stats.totalReservations++;
    console.log(`   Created event reservation: ${res.eventName}`);
    return res;
  }

  confirmReservation(reservationId) {
    const res = this.reservations.get(reservationId);
    if (!res) {
      return { success: false, reason: 'Reservation not found' };
    }
    res.confirm();
    this.stats.confirmedCount++;
    return { success: true, reservation: res };
  }

  cancelReservation(reservationId) {
    const res = this.reservations.get(reservationId);
    if (!res) {
      return { success: false, reason: 'Reservation not found' };
    }
    res.cancel();
    this.stats.cancelledCount++;
    return { success: true, reservation: res };
  }

  completeReservation(reservationId) {
    const res = this.reservations.get(reservationId);
    if (!res) {
      return { success: false, reason: 'Reservation not found' };
    }
    res.complete();
    this.stats.completedCount++;
    return { success: true, reservation: res };
  }

  checkAvailability(entityId, date, duration = 60) {
    // Demo availability check
    const slots = [
      new TimeSlot('09:00', true),
      new TimeSlot('10:00', true),
      new TimeSlot('11:00', false),
      new TimeSlot('12:00', true),
      new TimeSlot('13:00', true),
      new TimeSlot('14:00', true),
      new TimeSlot('15:00', false),
      new TimeSlot('16:00', true),
      new TimeSlot('17:00', true),
      new TimeSlot('18:00', true),
      new TimeSlot('19:00', false),
      new TimeSlot('20:00', true)
    ];
    return slots;
  }

  listReservations(status = null, type = null) {
    let results = Array.from(this.reservations.values());
    if (status) {
      results = results.filter(r => r.status === status);
    }
    if (type) {
      results = results.filter(r => r.type === type);
    }
    return results;
  }

  getReservation(reservationId) {
    return this.reservations.get(reservationId);
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const reservation = new ReservationAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Reservation Demo\n');

    // 1. List Reservations
    console.log('1. Existing Reservations:');
    const pending = reservation.listReservations('pending');
    const confirmed = reservation.listReservations('confirmed');
    console.log(`   Pending: ${pending.length}, Confirmed: ${confirmed.length}`);

    // 2. Check Availability
    console.log('\n2. Check Availability:');
    const slots = reservation.checkAvailability('rest-1', '2024-04-20');
    const available = slots.filter(s => s.available);
    console.log(`   Available slots: ${available.map(s => s.time).join(', ')}`);

    // 3. Create Table Reservation
    console.log('\n3. Create Table Reservation:');
    const tableRes = reservation.createTableReservation({
      userId: 'user-2',
      entityName: 'Le Petit Bistro',
      date: '2024-04-20',
      time: '20:00',
      duration: 120,
      guests: 6,
      notes: 'Anniversary dinner'
    });
    console.log(`   Code: ${tableRes.confirmationCode}`);

    // 4. Create Appointment
    console.log('\n4. Create Appointment:');
    const apptRes = reservation.createAppointmentReservation({
      userId: 'user-2',
      entityName: 'Dental Care Plus',
      service: 'Teeth Cleaning',
      date: '2024-04-22',
      time: '10:30',
      duration: 45,
      location: 'Main Office'
    });
    console.log(`   Code: ${apptRes.confirmationCode}`);

    // 5. Create Event Reservation
    console.log('\n5. Create Event Reservation:');
    const eventRes = reservation.createEventReservation({
      userId: 'user-2',
      entityName: 'Tech Conference 2024',
      eventName: 'AI Summit',
      date: '2024-05-15',
      time: '09:00',
      duration: 480,
      venue: 'Convention Center',
      ticketCount: 2,
      ticketPrice: 299
    });
    console.log(`   Code: ${eventRes.confirmationCode}, Total: $${eventRes.totalCost()}`);

    // 6. Confirm Reservation
    console.log('\n6. Confirm Reservation:');
    reservation.confirmReservation(tableRes.id);
    console.log(`   Status: ${tableRes.status}`);

    // 7. Cancel Reservation
    console.log('\n7. Cancel Reservation:');
    reservation.cancelReservation(apptRes.id);
    console.log(`   Status: ${apptRes.status}`);

    // 8. Complete Reservation
    console.log('\n8. Complete Reservation:');
    const completed = reservation.listReservations('confirmed')[0];
    if (completed) {
      reservation.completeReservation(completed.id);
      console.log(`   Status: ${completed.status}`);
    }

    // 9. List by Type
    console.log('\n9. Reservations by Type:');
    const tables = reservation.listReservations(null, 'table');
    const appts = reservation.listReservations(null, 'appointment');
    const events = reservation.listReservations(null, 'event');
    console.log(`   Tables: ${tables.length}, Appointments: ${appts.length}, Events: ${events.length}`);

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = reservation.getStats();
    console.log(`   Total: ${stats.totalReservations}`);
    console.log(`   Confirmed: ${stats.confirmedCount}`);
    console.log(`   Cancelled: ${stats.cancelledCount}`);
    console.log(`   Completed: ${stats.completedCount}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'res':
    console.log('Reservations:');
    reservation.listReservations().forEach(r => {
      console.log(`  ${r.entityName}: ${r.date} ${r.time} [${r.status}]`);
    });
    break;

  case 'list':
    console.log('All Reservations:');
    const all = reservation.listReservations();
    console.log(`Total: ${all.length}`);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-reservation.js [demo|res|list]');
}
