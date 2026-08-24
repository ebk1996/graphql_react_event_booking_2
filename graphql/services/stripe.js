const Stripe = require('stripe');

const PLACEHOLDER_KEYS = new Set(['', 'sk_test_xxx', 'whsec_xxx']);

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

  const { customer, paymentMethod } = await attachPaymentMethod(user, paymentMethodId);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: cents,
    currency: 'usd',
    customer: customer.id,
    payment_method: paymentMethod.id,
    capture_method: 'manual',
    confirm: true,
    off_session: false,
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never',
    },
    metadata: {
      userId: String(user._id),
      ...metadata,
    },
  });

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
  retrievePaymentIntent,
  capturePaymentIntent,
  cancelPaymentIntent,
  assertIntentUsable,
};
