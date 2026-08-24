import { useEffect, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const defaultCenter = [32.7767, -96.797]

function MapClicks({ active, onPick }) {
  useMapEvents({
    click(event) {
      if (!active) return
      onPick({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      })
    },
  })
  return null
}

export default function RideMapPicker({
  pickup,
  destination,
  pickupLabel,
  destinationLabel,
  onPickPickup,
  onPickDestination,
}) {
  const [mode, setMode] = useState('pickup')
  const [center, setCenter] = useState(defaultCenter)

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter([pos.coords.latitude, pos.coords.longitude])
      },
      () => {},
      { timeout: 4000, maximumAge: 60000 }
    )
  }, [])

  useEffect(() => {
    if (pickup && !destination) setMode('destination')
  }, [pickup, destination])

  const mapCenter = pickup
    ? [pickup.lat, pickup.lng]
    : destination
      ? [destination.lat, destination.lng]
      : center

  return (
    <div className="ride-map-wrap">
      <div className="ride-map-toolbar">
        <button
          type="button"
          className={mode === 'pickup' ? 'primary-button' : 'outline-button'}
          onClick={() => setMode('pickup')}
        >
          1. Tap pickup
        </button>
        <button
          type="button"
          className={mode === 'destination' ? 'primary-button' : 'outline-button'}
          onClick={() => setMode('destination')}
        >
          2. Tap destination
        </button>
      </div>

      <p className="ride-map-hint">
        {mode === 'pickup'
          ? 'Tap the map to set your pickup pin. Address typing is disabled.'
          : 'Tap the map to set your destination pin.'}
      </p>

      <div className="ride-map">
        <MapContainer
          center={mapCenter}
          zoom={13}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClicks
            active
            onPick={mode === 'pickup' ? onPickPickup : onPickDestination}
          />
          {pickup && (
            <CircleMarker
              center={[pickup.lat, pickup.lng]}
              radius={10}
              pathOptions={{ color: '#123f34', fillColor: '#123f34', fillOpacity: 0.9 }}
            >
              <Popup>Pickup</Popup>
            </CircleMarker>
          )}
          {destination && (
            <CircleMarker
              center={[destination.lat, destination.lng]}
              radius={10}
              pathOptions={{ color: '#b54735', fillColor: '#b54735', fillOpacity: 0.9 }}
            >
              <Popup>Destination</Popup>
            </CircleMarker>
          )}
        </MapContainer>
      </div>

      <div className="ride-map-labels">
        <div>
          <span>Pickup</span>
          <strong>{pickupLabel || 'Tap the map to choose pickup'}</strong>
        </div>
        <div>
          <span>Destination</span>
          <strong>
            {destinationLabel || 'Tap the map to choose destination'}
          </strong>
        </div>
      </div>
    </div>
  )
}
