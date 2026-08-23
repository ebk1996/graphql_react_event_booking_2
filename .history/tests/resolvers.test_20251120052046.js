const { __test } = require('../graphql/resolvers/index');
const resolvers = require('../graphql/resolvers/index');
const Booking = require('../models/Booking');

describe('resolver helpers', () => {
  test('transformEvent formats event correctly', () => {
    const fakeEvent = {
      _doc: {
        _id: '1234567890abcdef12345678',
        title: 'Test',
        description: 'Desc',
        price: 10,
        date: '2025-01-01T00:00:00.000Z',
        creator: 'super mario'
      }
    };
    const transformed = __test.transformEvent(fakeEvent);
    expect(transformed._id).toBe('1234567890abcdef12345678');
    expect(transformed.date).toBe('2025-01-01T00:00:00.000Z');
    expect(typeof transformed.creator).toBe('function');
  });

  test('singleEvent throws when not found', async () => {
    await expect(__test.singleEvent('nonexistentid')).rejects.toThrow('Event not found');
  });
  test('bookEvent throws when eventId invalid', async () => {
    await expect(resolvers.bookEvent({ eventId: 'badid' })).rejects.toThrow('Event not found');
  });
  test('cancelBooking throws when bookingId invalid', async () => {
    await expect(resolvers.cancelBooking({ bookingId: 'badid' })).rejects.toThrow('Booking not found');
  });
  test('cancelBooking throws when bookingId valid but not found', async () => {
    const originalFindById = Booking.findById;
    Booking.findById = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    try {
      await expect(resolvers.cancelBooking({ bookingId: '1234567890abcdef12345678' })).rejects.toThrow('Booking not found');
    } finally {
      Booking.findById = originalFindById;
    }
  });
});
