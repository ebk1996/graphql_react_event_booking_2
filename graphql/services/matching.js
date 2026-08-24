const Driver = require('../models/Driver');
const { haversineMiles } = require('./routing');

function matchRadiusMiles() {
  const parsed = Number(process.env.RIDE_MATCH_RADIUS_MILES || 15);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
}

function driverZip(driver) {
  return String(driver.zipCode || (driver.user && driver.user.zipCode) || '').replace(/\D/g, '').slice(0, 5);
}

function scoreCandidate(driver, pickup, pickupZip) {
  const zip = driverZip(driver);
  const sameZip = Boolean(pickupZip && zip && zip === String(pickupZip));
  const hasLocation = driver.currentLocation &&
    Number.isFinite(Number(driver.currentLocation.lat)) &&
    Number.isFinite(Number(driver.currentLocation.lng));
  const miles = hasLocation
    ? haversineMiles(driver.currentLocation, pickup)
    : Number.POSITIVE_INFINITY;
  return { driver, sameZip, miles, hasLocation };
}

async function findMatchingDriver({ pickup, pickupZip, excludeIds = [] }) {
  const radius = matchRadiusMiles();
  const excluded = (excludeIds || []).filter(Boolean);

  const query = {
    status: 'APPROVED',
    online: true,
  };
  if (excluded.length) {
    query._id = { $nin: excluded };
  }

  const candidates = await Driver.find(query).populate('user');
  const pickupZipNorm = String(pickupZip || '').replace(/\D/g, '').slice(0, 5);

  const ranked = (candidates || [])
    .map((driver) => scoreCandidate(driver, pickup, pickupZipNorm))
    .filter((item) => {
      if (item.sameZip) return true;
      if (item.hasLocation && item.miles <= radius) return true;
      return false;
    })
    .sort((a, b) => {
      if (a.sameZip !== b.sameZip) return a.sameZip ? -1 : 1;
      if (a.hasLocation !== b.hasLocation) return a.hasLocation ? -1 : 1;
      return a.miles - b.miles;
    });

  return ranked[0] ? ranked[0].driver : null;
}

module.exports = {
  matchRadiusMiles,
  driverZip,
  findMatchingDriver,
};
