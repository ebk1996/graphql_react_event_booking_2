const OSRM_URL = (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const NOMINATIM_URL = (process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
const USER_AGENT = process.env.MAP_USER_AGENT || 'LINK-Event-Booking/1.0 (ride-platform)';

const toNumber = (value) => Number(value);

const isValidCoord = (lat, lng) => (
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= -90 && lat <= 90 &&
  lng >= -180 && lng <= 180 &&
  !(lat === 0 && lng === 0)
);

function haversineMiles(a, b) {
  const lat1 = toNumber(a.lat);
  const lng1 = toNumber(a.lng);
  const lat2 = toNumber(b.lat);
  const lng2 = toNumber(b.lng);
  if (!Number.isFinite(lat1) || !Number.isFinite(lng1) || !Number.isFinite(lat2) || !Number.isFinite(lng2)) {
    return 0;
  }
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const r = 3958.8;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Number((2 * r * Math.asin(Math.min(1, Math.sqrt(h)))).toFixed(2));
}

function haversineRoute(pickup, destination) {
  const distanceMiles = Math.max(0.1, haversineMiles(pickup, destination));
  const durationMinutes = Number(Math.max(1, (distanceMiles / 25) * 60).toFixed(1));
  return {
    distanceMiles,
    durationMinutes,
    geometry: [
      [Number(pickup.lng), Number(pickup.lat)],
      [Number(destination.lng), Number(destination.lat)],
    ],
    source: 'haversine',
  };
}

async function fetchJson(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function routeBetween(pickup, destination) {
  const pickupLat = toNumber(pickup.lat);
  const pickupLng = toNumber(pickup.lng);
  const destLat = toNumber(destination.lat);
  const destLng = toNumber(destination.lng);

  if (!isValidCoord(pickupLat, pickupLng) || !isValidCoord(destLat, destLng)) {
    throw new Error('Pickup and destination coordinates are required.');
  }

  const fallback = haversineRoute(
    { lat: pickupLat, lng: pickupLng },
    { lat: destLat, lng: destLng },
  );

  try {
    const url = `${OSRM_URL}/route/v1/driving/${pickupLng},${pickupLat};${destLng},${destLat}?overview=full&geometries=geojson`;
    const data = await fetchJson(url);
    const route = data && data.routes && data.routes[0];
    if (!route) {
      return fallback;
    }
    const distanceMiles = Number(((route.distance || 0) / 1609.344).toFixed(2));
    const durationMinutes = Number(((route.duration || 0) / 60).toFixed(1));
    const geometry = (route.geometry && route.geometry.coordinates) || fallback.geometry;
    return {
      distanceMiles: Math.max(0.1, distanceMiles),
      durationMinutes: Math.max(1, durationMinutes),
      geometry,
      source: 'osrm',
    };
  } catch {
    return fallback;
  }
}

function mapNominatimResult(item) {
  if (!item) return null;
  const lat = toNumber(item.lat);
  const lng = toNumber(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = item.address || {};
  const zipCode = String(address.postcode || '').replace(/\D/g, '').slice(0, 5);
  return {
    address: String(item.display_name || '').trim(),
    lat,
    lng,
    zipCode: zipCode || null,
  };
}

async function geocodeAddress(query) {
  const q = String(query || '').trim();
  if (q.length < 3) {
    return [];
  }
  try {
    const url = `${NOMINATIM_URL}/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`;
    const data = await fetchJson(url);
    if (!Array.isArray(data)) return [];
    return data.map(mapNominatimResult).filter(Boolean);
  } catch {
    return [];
  }
}

async function reverseGeocode(lat, lng) {
  const parsedLat = toNumber(lat);
  const parsedLng = toNumber(lng);
  if (!isValidCoord(parsedLat, parsedLng) && !(Number.isFinite(parsedLat) && Number.isFinite(parsedLng))) {
    return null;
  }
  try {
    const url = `${NOMINATIM_URL}/reverse?format=jsonv2&addressdetails=1&lat=${parsedLat}&lon=${parsedLng}`;
    const data = await fetchJson(url);
    return mapNominatimResult(data);
  } catch {
    return null;
  }
}

async function resolveLocation(input) {
  const lat = toNumber(input && input.lat);
  const lng = toNumber(input && input.lng);
  let address = String((input && input.address) || '').trim();
  let zipCode = String((input && input.zipCode) || '').replace(/\D/g, '').slice(0, 5);

  if (isValidCoord(lat, lng)) {
    if (!address || !zipCode) {
      const reversed = await reverseGeocode(lat, lng);
      if (reversed) {
        address = address || reversed.address;
        zipCode = zipCode || reversed.zipCode || '';
      }
    }
    return {
      address: address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      lat,
      lng,
      zipCode: zipCode || '',
    };
  }

  if (address) {
    const results = await geocodeAddress(address);
    if (results[0]) {
      return {
        address: results[0].address,
        lat: results[0].lat,
        lng: results[0].lng,
        zipCode: zipCode || results[0].zipCode || '',
      };
    }
  }

  throw new Error('Could not resolve pickup or destination location.');
}

module.exports = {
  haversineMiles,
  haversineRoute,
  isValidCoord,
  routeBetween,
  geocodeAddress,
  reverseGeocode,
  resolveLocation,
};
