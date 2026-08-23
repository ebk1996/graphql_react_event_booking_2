const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { __test } = require('../graphql/resolvers/index');
const resolvers = require('../graphql/resolvers/index');
const Booking = require('../models/booking');
const Event = require('../models/event');
const User = require('../models/user');
const { ensureOwner } = require('../graphql/resolvers/helpers');

const OWNER_ID = '1234567890abcdef12345678';
const OTHER_ID = '1234567890abcdef12345679';
const TARGET_ID = '1234567890abcdef1234567a';
const asUser = (userId) => ({ isAuth: true, userId });

// Swap out model statics for the duration of fn, then restore them.
const withStubs = async (stubs, fn) => {
  const originals = stubs.map(([model, name]) => [model, name, model[name]]);
  stubs.forEach(([model, name, impl]) => { model[name] = impl; });
  try {
    await fn();
  } finally {
    originals.forEach(([model, name, impl]) => { model[name] = impl; });
  }
};

describe('resolver helpers', () => {
  test('transformEvent formats an event correctly', () => {
    const fakeEvent = {
      _doc: {
        _id: '1234567890abcdef12345678',
        title: 'Test',
        description: 'Desc',
        price: 10,
        date: '2025-01-01T00:00:00.000Z',
        creator: 'super mario',
      },
    };
    const transformed = __test.transformEvent(fakeEvent);
    assert.equal(transformed._id, '1234567890abcdef12345678');
    assert.equal(transformed.date, '2025-01-01T00:00:00.000Z');
    assert.equal(typeof transformed.creator, 'function');
  });

  test('singleEvent rejects an invalid id', async () => {
    await assert.rejects(__test.singleEvent('nonexistentid'), /Event not found/);
  });

  test('bookEvent rejects an invalid event id', async () => {
    await withStubs([[User, 'findById', async () => ({ _id: OWNER_ID })]], async () => {
      await assert.rejects(
        resolvers.bookEvent({ eventId: 'badid' }, asUser(OWNER_ID)),
        /Event not found/
      );
    });
  });

  test('cancelBooking rejects an invalid booking id', async () => {
    await withStubs([[User, 'findById', async () => ({ _id: OWNER_ID })]], async () => {
      await assert.rejects(
        resolvers.cancelBooking({ bookingId: 'badid' }, asUser(OWNER_ID)),
        /Booking not found/
      );
    });
  });

  test('cancelBooking rejects a valid but missing booking', async () => {
    await withStubs([
      [User, 'findById', async () => ({ _id: OWNER_ID })],
      [Booking, 'findById', () => ({ populate: async () => null })],
    ], async () => {
      await assert.rejects(
        resolvers.cancelBooking({ bookingId: '1234567890abcdef12345678' }, asUser(OWNER_ID)),
        /Booking not found/
      );
    });
  });
});

describe('ownership rules', () => {
  test('ensureOwner allows the owner and rejects everyone else', () => {
    assert.doesNotThrow(() => ensureOwner(OWNER_ID, OWNER_ID, 'nope'));
    assert.throws(() => ensureOwner(OWNER_ID, OTHER_ID, 'nope'), /nope/);
    assert.throws(() => ensureOwner(null, OTHER_ID, 'nope'), /nope/);
  });

  test('updateEvent rejects a user who did not create the event', async () => {
    await withStubs([
      [User, 'findById', async () => ({ _id: OTHER_ID })],
      [Event, 'findById', async () => ({ _id: TARGET_ID, creator: OWNER_ID })],
    ], async () => {
      await assert.rejects(
        resolvers.updateEvent(
          { eventId: TARGET_ID, eventInput: { title: 'x', description: 'y', price: 1, date: '2025-01-01' } },
          asUser(OTHER_ID),
        ),
        /You can only edit events you created/
      );
    });
  });

  test('deleteEvent rejects a user who did not create the event', async () => {
    await withStubs([
      [User, 'findById', async () => ({ _id: OTHER_ID })],
      [Event, 'findById', async () => ({ _id: TARGET_ID, creator: OWNER_ID })],
    ], async () => {
      await assert.rejects(
        resolvers.deleteEvent({ eventId: TARGET_ID }, asUser(OTHER_ID)),
        /You can only delete events you created/
      );
    });
  });

  test('deleteEvent rejects an invalid event id', async () => {
    await withStubs([[User, 'findById', async () => ({ _id: OWNER_ID })]], async () => {
      await assert.rejects(resolvers.deleteEvent({ eventId: 'badid' }, asUser(OWNER_ID)), /Event not found/);
    });
  });

  test('updateEvent requires a logged in user', async () => {
    await assert.rejects(
      resolvers.updateEvent({ eventId: TARGET_ID, eventInput: {} }),
      /Please log in before editing an event/
    );
  });

  test('cancelBooking rejects a booking made by someone else', async () => {
    await withStubs([
      [Booking, 'findById', () => ({ populate: async () => ({ _id: TARGET_ID, user: OWNER_ID, event: {} }) })],
      [User, 'findById', async () => ({ _id: OTHER_ID })],
    ], async () => {
      await assert.rejects(
        resolvers.cancelBooking({ bookingId: TARGET_ID }, asUser(OTHER_ID)),
        /You can only cancel your own bookings/
      );
    });
  });

  test('bookings requires a logged in user', async () => {
    await assert.rejects(resolvers.bookings({}), /Please log in to see your bookings/);
  });

  test('bookings only returns the requesting user\'s bookings', async () => {
    let queried;
    await withStubs([
      [User, 'findById', async () => ({ _id: OWNER_ID })],
      [Booking, 'find', async (filter) => { queried = filter; return []; }],
    ], async () => {
      await resolvers.bookings({}, asUser(OWNER_ID));
    });
    assert.deepEqual(queried, { user: OWNER_ID });
  });
});

describe('login', () => {
  test('login rejects unknown credentials', async () => {
    await withStubs([[User, 'findOne', async () => null]], async () => {
      await assert.rejects(
        resolvers.login({ userInput: { email: 'nobody@example.com', password: 'secret12' } }),
        /Incorrect email or password/
      );
    });
  });

  test('login returns AuthData with a JWT', async () => {
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    const { jwtSecret } = require('../config/auth');
    const password = 'secret12';
    const hash = await bcrypt.hash(password, 4);
    await withStubs([[User, 'findOne', async () => ({
      id: OWNER_ID,
      email: 'host@example.com',
      password: hash,
    })]], async () => {
      const result = await resolvers.login({ userInput: { email: 'host@example.com', password } });
      assert.equal(result.userId, OWNER_ID);
      assert.equal(result.email, 'host@example.com');
      assert.equal(typeof result.token, 'string');
      assert.equal(result.tokenExpiration, 1);
      const decoded = jwt.verify(result.token, jwtSecret());
      assert.equal(decoded.userId, OWNER_ID);
    });
  });
});
