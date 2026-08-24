const BASE_FARE = 3.50;
const PER_MILE = 1.85;
const PER_MINUTE = 0.35;
const BOOKING_FEE = 1.50;
const MINIMUM_FARE = 7.50;

const PLATFORM_PERCENTAGE = 0.25;
const DRIVER_PERCENTAGE = 0.75;

function calculateFare({
  distanceMiles = 0,
  durationMinutes = 0,
  surgeMultiplier = 1,
}) {
  const distance = Math.max(0, Number(distanceMiles));
  const duration = Math.max(0, Number(durationMinutes));
  const surge = Math.max(1, Number(surgeMultiplier));

  const subtotal =
    BASE_FARE +
    distance * PER_MILE +
    duration * PER_MINUTE +
    BOOKING_FEE;

  const fare = Math.max(
    MINIMUM_FARE,
    subtotal * surge,
  );

  const roundedFare = Number(fare.toFixed(2));

  const platformAmount = Number(
    (roundedFare * PLATFORM_PERCENTAGE).toFixed(2),
  );

  const driverAmount = Number(
    (roundedFare - platformAmount).toFixed(2),
  );

  return {
    baseFare: BASE_FARE,
    distanceMiles: Number(distance.toFixed(2)),
    durationMinutes: Number(duration.toFixed(1)),
    surgeMultiplier: surge,
    estimatedFare: roundedFare,
    platformAmount,
    driverAmount,
    platformPercentage: 25,
    driverPercentage: 75,
  };
}

module.exports = {
  calculateFare,
  BASE_FARE,
  PER_MILE,
  PER_MINUTE,
  BOOKING_FEE,
  MINIMUM_FARE,
};
