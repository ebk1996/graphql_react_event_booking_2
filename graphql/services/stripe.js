const Stripe = require('stripe');

const PLACEHOLDER_KEYS = new Set(['', 'sk_test_xxx', 'whsec_xxx']);
const STATEMENT_DESCRIPTOR = 'EVENTS360';
const OPEN_AUTH_STATUSES = new Set([
  'requires_capture',
  'requires_confirmation',
  'requires_action',
  'requires_payment_method',
  'processing',
]);

let statementDescriptorReady = null;

function stripeSecretKey() {
  return String(process.env.STRIPE_SECRET_KEY || '').trim();
}

function stripePublishableKey() {
  return String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
}

function isStripeConfigured() {
  const secret = stripeSecretKey();
  return Boolean(secret) && !PLACEHOLDER_KEYS.has(secret);
}

function getStripe() {
  if (!isStripeConfigured()) {
    throw new Error('Stripe is not configured.');
  }
  return new Stripe(stripeSecretKey());
}

function dollarsToCents(amount) {
  return Math.round(Number(amount) * 100);
}

function centsToDollars(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

function mapPaymentStatus(stripeStatus) {
  switch (stripeStatus) {
    case 'requires_capture':
      return 'AUTHORIZED';
    case 'succeeded':
      return 'CAPTURED';
    case 'canceled':
    case 'cancelled':
      return 'FAILED';
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
    case 'processing':
      return 'PENDING';
    default:
      return 'PENDING';
  }
}

async function getOrCreateCustomer(user) {
  const stripe = getStripe();
  if (user.stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(user.stripeCustomerId);
      if (existing && !existing.deleted) {
        return existing;
      }
    } catch {
      // Recreate below if the stored customer is gone.
    }
  }

  const customer = await stripe.customers.create({
    email: user.email,
    name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
    metadata: { userId: String(user._id) },
  });

  user.stripeCustomerId = customer.id;
  await user.save();
  return customer;
}

async function attachPaymentMethod(user, paymentMethodId) {
  const stripe = getStripe();
  const id = String(paymentMethodId || '').trim();
  if (!id) {
    throw new Error('A Stripe payment method is required.');
  }

  const customer = await getOrCreateCustomer(user);
  const paymentMethod = await stripe.paymentMethods.retrieve(id);

  if (paymentMethod.customer && paymentMethod.customer !== customer.id) {
    throw new Error('This payment method belongs to another customer.');
  }

  if (!paymentMethod.customer) {
    await stripe.paymentMethods.attach(id, { customer: customer.id });
  }

  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: id },
  });

  const refreshed = await stripe.paymentMethods.retrieve(id);
  return { customer, paymentMethod: refreshed };
}

async function ensureStatementDescriptor() {
  if (statementDescriptorReady) {
    return statementDescriptorReady;
  }

  statementDescriptorReady = (async () => {
    try {
      const stripe = getStripe();
      const account = await stripe.accounts.retrieve();
      await stripe.accounts.update(account.id, {
        settings: {
          payments: {
            statement_descriptor: STATEMENT_DESCRIPTOR,
          },
          card_payments: {
            statement_descriptor_prefix: STATEMENT_DESCRIPTOR.slice(0, 10),
          },
        },
      });
    } catch (err) {
      console.warn(
        'Could not update Stripe statement descriptor:',
        err.message
      );
    }
  })();

  return statementDescriptorReady;
}

async function listOpenRideAuthorizations(customerId) {
  const stripe = getStripe();
  const intents = await stripe.paymentIntents.list({
    customer: customerId,
    limit: 20,
  });

  return intents.data.filter(
    (intent) =>
      intent.metadata &&
      intent.metadata.type === 'ride' &&
      OPEN_AUTH_STATUSES.has(intent.status)
  );
}

async function releaseOpenRideAuthorizations(customerId, exceptId) {
  const stripe = getStripe();
  const open = await listOpenRideAuthorizations(customerId);

  await Promise.all(
    open
      .filter((intent) => intent.id !== exceptId)
      .filter((intent) =>
        ['requires_capture', 'requires_confirmation', 'requires_action'].includes(
          intent.status
        )
      )
      .map((intent) =>
        stripe.paymentIntents
          .cancel(intent.id, { cancellation_reason: 'duplicate' })
          .catch((err) => {
            console.warn(
              'Could not cancel duplicate ride authorization:',
              intent.id,
              err.message
            );
          })
      )
  );
}

async function createAndConfirmPaymentIntent({
  user,
  amount,
  paymentMethodId,
  metadata = {},
}) {
  const stripe = getStripe();
  const cents = dollarsToCents(amount);
  if (!Number.isFinite(cents) || cents < 50) {
    throw new Error('Fare amount is too small to charge.');
  }

  await ensureStatementDescriptor();

  const { customer, paymentMethod } = await attachPaymentMethod(user, paymentMethodId);
  const userId = String(user._id);
  const rideMeta = {
    userId,
    type: 'ride',
    ...metadata,
  };

  const open = await listOpenRideAuthorizations(customer.id);
  const reusable = open.find(
    (intent) =>
      intent.status === 'requires_capture' &&
      Number(intent.amount) === cents &&
      String(intent.metadata?.userId || '') === userId
  );

  if (reusable) {
    await releaseOpenRideAuthorizations(customer.id, reusable.id);
    return reusable;
  }

  await releaseOpenRideAuthorizations(customer.id);

  const window = Math.floor(Date.now() / 15000);
  const idempotencyKey = [
    'ride-auth',
    userId,
    String(cents),
    String(rideMeta.distanceMiles || ''),
    String(rideMeta.durationMinutes || ''),
    String(window),
  ].join('-');

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: cents,
      currency: 'usd',
      customer: customer.id,
      payment_method: paymentMethod.id,
      capture_method: 'manual',
      confirm: true,
      off_session: false,
      description: 'Events360 ride',
      statement_descriptor_suffix: STATEMENT_DESCRIPTOR,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
      metadata: rideMeta,
    },
    { idempotencyKey }
  );

  await releaseOpenRideAuthorizations(customer.id, paymentIntent.id);

  return paymentIntent;
}

async function retrievePaymentIntent(paymentIntentId) {
  const stripe = getStripe();
  const id = String(paymentIntentId || '').trim();
  if (!id) {
    throw new Error('A Stripe payment intent is required.');
  }
  return stripe.paymentIntents.retrieve(id);
}

async function chargeRideOnComplete({
  user,
  amount,
  paymentMethodId,
  metadata = {},
}) {
  const stripe = getStripe();
  const cents = dollarsToCents(amount);
  if (!Number.isFinite(cents) || cents < 50) {
    throw new Error('Fare amount is too small to charge.');
  }

  await ensureStatementDescriptor();

  const { customer, paymentMethod } = await attachPaymentMethod(
    user,
    paymentMethodId
  );

  return stripe.paymentIntents.create({
    amount: cents,
    currency: 'usd',
    customer: customer.id,
    payment_method: paymentMethod.id,
    confirm: true,
    off_session: true,
    capture_method: 'automatic',
    payment_method_types: ['card'],
    description: 'Events360 ride',
    statement_descriptor_suffix: STATEMENT_DESCRIPTOR,
    metadata: {
      userId: String(user._id),
      type: 'ride',
      ...metadata,
    },
  });
}

async function capturePaymentIntent(paymentIntentId) {
  const stripe = getStripe();
  const intent = await retrievePaymentIntent(paymentIntentId);
  if (intent.status === 'succeeded') {
    return intent;
  }
  if (intent.status !== 'requires_capture') {
    throw new Error(`Payment cannot be captured (status: ${intent.status}).`);
  }
  return stripe.paymentIntents.capture(intent.id);
}

async function cancelPaymentIntent(paymentIntentId) {
  const stripe = getStripe();
  const intent = await retrievePaymentIntent(paymentIntentId);
  if (['canceled', 'succeeded'].includes(intent.status)) {
    return intent;
  }
  return stripe.paymentIntents.cancel(intent.id);
}

function assertIntentUsable(intent, user, amountDollars) {
  if (!intent) {
    throw new Error('Stripe payment intent was not found.');
  }
  if (intent.metadata && intent.metadata.userId && String(intent.metadata.userId) !== String(user._id)) {
    throw new Error('This payment does not belong to the current user.');
  }
  if (user.stripeCustomerId && intent.customer && String(intent.customer) !== String(user.stripeCustomerId)) {
    throw new Error('This payment does not belong to the current user.');
  }
  const expectedCents = dollarsToCents(amountDollars);
  if (Number(intent.amount) !== expectedCents) {
    throw new Error('Payment amount does not match the calculated fare.');
  }
  if (!['requires_capture', 'succeeded'].includes(intent.status)) {
    throw new Error(`Payment is not authorized (status: ${intent.status}).`);
  }
  return intent;
}

module.exports = {
  getStripe,
  isStripeConfigured,
  stripePublishableKey,
  dollarsToCents,
  centsToDollars,
  mapPaymentStatus,
  getOrCreateCustomer,
  attachPaymentMethod,
  createAndConfirmPaymentIntent,
  chargeRideOnComplete,
  retrievePaymentIntent,
  capturePaymentIntent,
  cancelPaymentIntent,
  assertIntentUsable,
};
