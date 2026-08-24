import { useEffect, useRef, useState } from 'react'
import './App.css'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import RideMapPicker from './components/rides/RideMapPicker.jsx'

const sessionKey = 'link-current-user'

const safeDate = (value) => {
  if (!value) return null

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return null

  return date
}

const formatDate = (value, options = {}) => {
  const date = safeDate(value)

  if (!date) return 'Date unavailable'

  return date.toLocaleDateString(undefined, options)
}

const formatDateTime = (value) => {
  const date = safeDate(value)

  if (!date) return 'Date unavailable'

  return date.toLocaleString()
}

const formatMonth = (value) => {
  const date = safeDate(value)

  if (!date) return '--'

  return date.toLocaleDateString(undefined, {
    month: 'short',
  })
}

const formatDay = (value) => {
  const date = safeDate(value)

  if (!date) return '--'

  return String(date.getDate())
}

const toDateTimeLocal = (value) => {
  const date = safeDate(value)

  if (!date) return ''

  const pad = (n) => String(n).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const isEventOwner = (item, user) =>
  Boolean(
    item?.creator?._id &&
    user?.userId &&
    String(item.creator._id) === String(user.userId)
  )


const readSession = () => {
  try {
    const stored = JSON.parse(sessionStorage.getItem(sessionKey))
    if (stored?.token && stored?.userId) return stored
  } catch {}
  return null
}

const request = async (query, variables = {}) => {
  const headers = { 'Content-Type': 'application/json' }
  const session = readSession()

  if (session?.token) {
    headers.Authorization = `Bearer ${session.token}`
  }

  const response = await fetch(
    import.meta.env.VITE_API_URL || '/graphql',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    }
  )

  const payload = await response.json()

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message)
  }

  return payload.data
}

const eventsQuery = `
query {
  events {
    _id
    title
    description
    price
    date
    zipCode
    creator {
      _id
      firstName
      lastName
      email
    }
  }
  bookingsCount
}`

const bookingsQuery = `
query {
  bookings {
    _id
    createdAt
    event {
      _id
      title
      date
      price
    }
  }
}`

const notificationsQuery = `
query {
  notifications {
    _id
    type
    message
    createdAt
    event {
      _id
      title
    }
  }
}`

const myDriverQuery = `
query {
  myDriver {
    _id
    status
    online
    vehicleMake
    vehicleModel
    vehicleYear
    vehicleColor
    licensePlate
    completedRides
    totalEarnings
    rating
  }
}`

const quoteRideMutation = `
query QuoteRide($input: RideQuoteInput!) {
  quoteRide(input: $input) {
    distanceMiles
    durationMinutes
    estimatedFare
    driverAmount
    platformAmount
  }
}`

const reverseGeocodeQuery = `
query Reverse($lat: Float!, $lng: Float!) {
  reverseGeocode(lat: $lat, lng: $lng) {
    address
    lat
    lng
    zipCode
  }
}`

const createRidePaymentIntentMutation = `
mutation CreateRidePaymentIntent(
  $pickup: RideLocationInput!
  $destination: RideLocationInput!
  $distanceMiles: Float!
  $durationMinutes: Float!
  $paymentMethodId: String!
  $surgeMultiplier: Float
) {
  createRidePaymentIntent(
    pickup: $pickup
    destination: $destination
    distanceMiles: $distanceMiles
    durationMinutes: $durationMinutes
    paymentMethodId: $paymentMethodId
    surgeMultiplier: $surgeMultiplier
  ) {
    paymentIntentId
    clientSecret
    status
    amount
    paymentStatus
  }
}`

const requestRideMutation = `
mutation RequestRide(
  $pickup: RideLocationInput!
  $destination: RideLocationInput!
  $distanceMiles: Float!
  $durationMinutes: Float!
  $surgeMultiplier: Float
  $paymentMethodId: String
) {
  requestRide(
    pickup: $pickup
    destination: $destination
    distanceMiles: $distanceMiles
    durationMinutes: $durationMinutes
    surgeMultiplier: $surgeMultiplier
    paymentMethodId: $paymentMethodId
  ) {
    _id
    distanceMiles
    durationMinutes
    estimatedFare
    finalFare
    driverAmount
    platformAmount
    surgeMultiplier
    status
    paymentStatus
    createdAt
    rider {
      _id
      firstName
      lastName
    }
    driver {
      _id
      status
      online
      vehicleMake
      vehicleModel
      vehicleColor
      licensePlate
    }
  }
}`

const loginMutation = `
mutation Login($loginInput: LoginInput!) {
  login(loginInput: $loginInput) {
    userId
    email
    token
    tokenExpiration
  }
}`

const registerMutation = `
mutation Register($userInput: UserInput!) {
  createUser(userInput: $userInput) {
    _id
    firstName
    lastName
    email
    phone
    zipCode
  }
}`

const applyDriverMutation = `
mutation Apply($driverInput: DriverInput!) {
  applyAsDriver(driverInput: $driverInput) {
    _id
    status
    online
    vehicleMake
    vehicleModel
    vehicleYear
    vehicleColor
    licensePlate
    completedRides
  }
}`

const updateDriverOnlineMutation = `
mutation SetOnline($online: Boolean!) {
  setDriverOnline(online: $online) {
    _id
    status
    online
    vehicleMake
    vehicleModel
    vehicleYear
    vehicleColor
    licensePlate
    completedRides
  }
}`

const createEventMutation = `
mutation CreateEvent($eventInput: EventInput!) {
  createEvent(eventInput: $eventInput) {
    _id
    title
  }
}`

const updateEventMutation = `
mutation UpdateEvent($eventId: ID!, $eventInput: EventInput!) {
  updateEvent(eventId: $eventId, eventInput: $eventInput) {
    _id
    title
  }
}`

const deleteEventMutation = `
mutation DeleteEvent($eventId: ID!) {
  deleteEvent(eventId: $eventId) {
    _id
  }
}`

const cancelBookingMutation = `
mutation CancelBooking($bookingId: ID!) {
  cancelBooking(bookingId: $bookingId) {
    _id
    title
  }
}`

const bookEventMutation = `
mutation Book($eventId: ID!) {
  bookEvent(eventId: $eventId) {
    _id
  }
}`

const updateProfileMutation = `
mutation UpdateProfile(
  $firstName: String
  $lastName: String
  $phone: String
  $bio: String
) {
  updateProfile(
    firstName: $firstName
    lastName: $lastName
    phone: $phone
    bio: $bio
  ) {
    _id
    firstName
    lastName
    phone
    email
    bio
    zipCode
  }
}`


const ADMIN_DRIVERS_QUERY = `
query {
  adminDrivers {
    _id
    firstName
    lastName
    phone
    vehicleMake
    vehicleModel
    vehicleColor
    vehicleYear
    licensePlate
    status
    vehicleStatus
    online
    deniedReason
    vehicleDeniedReason
  }
}`;

const MY_DRIVER_QUERY = `
query {
  myDriver {
    _id
    firstName
    lastName
    phone
    vehicleMake
    vehicleModel
    vehicleColor
    vehicleYear
    licensePlate
    status
    vehicleStatus
    online
    deniedReason
    vehicleDeniedReason
  }
}`;

const AVAILABLE_RIDES_QUERY = `
query {
  availableRides {
    _id
    pickup
    destination
    distanceMiles
    durationMinutes
    fare
    status
    createdAt
    rider {
      _id
      firstName
      lastName
    }
  }
}`;

const MY_RIDES_QUERY = `
query {
  myRides {
    _id
    pickup
    destination
    distanceMiles
    durationMinutes
    fare
    status
    createdAt
    rider {
      _id
      firstName
      lastName
    }
  }
}`;

const APPLY_DRIVER_MUTATION = `
mutation Apply($driverInput: DriverInput!) {
  applyAsDriver(driverInput: $driverInput) {
    _id
    status
    vehicleStatus
  }
}`;

const APPROVE_DRIVER_MUTATION = `
mutation Approve($driverId: ID!) {
  approveDriver(driverId: $driverId) {
    _id
    status
  }
}`;

const DENY_DRIVER_MUTATION = `
mutation Deny($driverId: ID!, $reason: String) {
  denyDriver(driverId: $driverId, reason: $reason) {
    _id
    status
  }
}`;

const APPROVE_VEHICLE_MUTATION = `
mutation ApproveVehicle($driverId: ID!) {
  approveVehicle(driverId: $driverId) {
    _id
    vehicleStatus
  }
}`;

const DENY_VEHICLE_MUTATION = `
mutation DenyVehicle($driverId: ID!, $reason: String) {
  denyVehicle(driverId: $driverId, reason: $reason) {
    _id
    vehicleStatus
  }
}`;

const DRIVER_ONLINE_MUTATION = `
mutation Online($online: Boolean!) {
  setDriverOnline(online: $online) {
    _id
    online
  }
}`;

const ACCEPT_RIDE_MUTATION = `
mutation Accept($rideId: ID!) {
  acceptRide(rideId: $rideId) {
    _id
    status
  }
}`;

const REJECT_RIDE_MUTATION = `
mutation Reject($rideId: ID!) {
  rejectRide(rideId: $rideId) {
    _id
    status
  }
}`;

const ARRIVE_RIDE_MUTATION = `
mutation Arrive($rideId: ID!) {
  arriveRide(rideId: $rideId) {
    _id
    status
  }
}`;

const START_RIDE_MUTATION = `
mutation Start($rideId: ID!) {
  startRide(rideId: $rideId) {
    _id
    status
  }
}`;

const COMPLETE_RIDE_MUTATION = `
mutation Complete($rideId: ID!) {
  completeRide(rideId: $rideId) {
    _id
    status
    paymentStatus
  }
}`;

const CANCEL_RIDE_MUTATION = `
mutation Cancel($rideId: ID!) {
  cancelRide(rideId: $rideId) {
    _id
    status
  }
}`;


const emptyEvent = {
  title: '',
  description: '',
  price: '',
  date: '',
  zipCode: '',
}

function App() {
  const stripe = useStripe()
  const elements = useElements()

  const [session, setSession] = useState(readSession())
  const [page, setPage] = useState('dashboard')

  const [events, setEvents] = useState([])
  const [bookings, setBookings] = useState([])
  const [bookingsCount, setBookingsCount] = useState(0)
  const [notifications, setNotifications] = useState([])

  const [driver, setDriver] = useState(null)
  const [driverLoading, setDriverLoading] = useState(false)

  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const [authMode, setAuthMode] = useState('login')
  const [showAuth, setShowAuth] = useState(false)
  const [adminDrivers, setAdminDrivers] = useState([])
  const [myDriver, setMyDriver] = useState(null)
  const [availableRides, setAvailableRides] = useState([])
  const [myRides, setMyRides] = useState([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [driverLoadingPanel, setDriverLoadingPanel] = useState(false)


  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
  })

  const openAuthLogin = (e) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setAuthMode('login')
    setShowAuth(true)
  }

  const [registerForm, setRegisterForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    zipCode: '',
    email: '',
    password: '',
  })

  const [event, setEvent] = useState(emptyEvent)
  const [editingId, setEditingId] = useState(null)

  const [ride, setRide] = useState({
    pickup: '',
    destination: '',
    pickupLat: null,
    pickupLng: null,
    destLat: null,
    destLng: null,
    distanceMiles: '',
    durationMinutes: '',
    surgeMultiplier: '1',
  })

  const [rideQuote, setRideQuote] = useState(null)
  const [rideLoading, setRideLoading] = useState(false)
  const [cardComplete, setCardComplete] = useState(false)
  const rideRequestInFlight = useRef(false)

  const [driverForm, setDriverForm] = useState({
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: '',
    vehicleColor: '',
    licensePlate: '',
  })

  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    bio: '',
  })

  const [loading, setLoading] = useState(false)

  const flash = (message) => {
    setNotice(message)
    setError('')
    setTimeout(() => setNotice(''), 4000)
  }

  const fail = (message) => {
    setError(message)
    setNotice('')
  }

  const loadEvents = async () => {
    try {
      const data = await request(eventsQuery)
      setEvents(data.events || [])
      setBookingsCount(data.bookingsCount || 0)
    } catch (err) {
      fail(err.message)
    }
  }

  const loadBookings = async () => {
    if (!session) return

    try {
      const data = await request(bookingsQuery)
      setBookings(data.bookings || [])
    } catch (err) {
      fail(err.message)
    }
  }

  const loadNotifications = async () => {
    if (!session) return

    try {
      const data = await request(notificationsQuery)
      setNotifications(data.notifications || [])
    } catch (err) {
      fail(err.message)
    }
  }

  const loadDriver = async () => {
    if (!session) {
      setDriver(null)
      return
    }

    setDriverLoading(true)

    try {
      const data = await request(myDriverQuery)
      setDriver(data.myDriver || null)

      if (data.myDriver) {
        setDriverForm({
          vehicleMake: data.myDriver.vehicleMake || '',
          vehicleModel: data.myDriver.vehicleModel || '',
          vehicleYear: data.myDriver.vehicleYear || '',
          vehicleColor: data.myDriver.vehicleColor || '',
          licensePlate: data.myDriver.licensePlate || '',
        })
      }
    } catch {
      setDriver(null)
    } finally {
      setDriverLoading(false)
    }
  }

  useEffect(() => {
    loadEvents()
  }, [])

  useEffect(() => {
    if (session) {
      loadBookings()
      loadNotifications()
      loadDriver()
    }
  }, [session])

  useEffect(() => {
    if (page !== 'driver' || !session) return

    loadDriverPanel()

    const online = Boolean(myDriver?.online || driver?.online)
    if (!online) return undefined

    const timer = setInterval(() => {
      loadDriverPanel()
    }, 8000)

    return () => clearInterval(timer)
  }, [page, session, myDriver?.online, driver?.online])

  const seenRideRequests = useRef(new Set())

  useEffect(() => {
    if (page !== 'driver') return
    const fresh = availableRides.filter(
      (item) => !seenRideRequests.current.has(item._id)
    )
    if (!fresh.length) return
    fresh.forEach((item) => seenRideRequests.current.add(item._id))
    flash(`${fresh.length} incoming ride request(s).`)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('New ride request', {
        body: 'Open Driver to accept or deny the trip.',
      })
    }
  }, [availableRides, page])

  // Reveal sections/cards as they enter the viewport.
  useEffect(() => {
    const elements = document.querySelectorAll('.reveal')

    if (!elements.length) return

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -40px 0px',
      }
    )

    elements.forEach(element => observer.observe(element))

    return () => observer.disconnect()
  }, [page, rideQuote])

  const loadAdminDrivers = async () => {
    if (session?.email?.toLowerCase() !== 'echolsbrysonkyle@gmail.com') return
    setAdminLoading(true)
    try {
      const data = await request(ADMIN_DRIVERS_QUERY)
      setAdminDrivers(data.adminDrivers || [])
    } catch (err) {
      fail(err.message)
    } finally {
      setAdminLoading(false)
    }
  }

  const loadDriverPanel = async () => {
    if (!session) return
    setDriverLoadingPanel(true)
    try {
      const [driverData, rideData, myRideData] = await Promise.all([
        request(MY_DRIVER_QUERY),
        request(AVAILABLE_RIDES_QUERY).catch(() => ({ availableRides: [] })),
        request(MY_RIDES_QUERY).catch(() => ({ myRides: [] })),
      ])

      setMyDriver(driverData.myDriver)
      setAvailableRides(rideData.availableRides || [])
      setMyRides(myRideData.myRides || [])
    } catch (err) {
      fail(err.message)
    } finally {
      setDriverLoadingPanel(false)
    }
  }

  const approveDriver = async (id) => {
    try {
      await request(APPROVE_DRIVER_MUTATION, { driverId: id })
      await loadAdminDrivers()
      flash('Driver approved.')
    } catch (err) {
      fail(err.message)
    }
  }

  const denyDriver = async (id) => {
    try {
      await request(DENY_DRIVER_MUTATION, {
        driverId: id,
        reason: 'Denied by administrator.',
      })
      await loadAdminDrivers()
      flash('Driver denied.')
    } catch (err) {
      fail(err.message)
    }
  }

  const approveVehicle = async (id) => {
    try {
      await request(APPROVE_VEHICLE_MUTATION, { driverId: id })
      await loadAdminDrivers()
      flash('Vehicle approved.')
    } catch (err) {
      fail(err.message)
    }
  }

  const denyVehicle = async (id) => {
    try {
      await request(DENY_VEHICLE_MUTATION, {
        driverId: id,
        reason: 'Vehicle denied by administrator.',
      })
      await loadAdminDrivers()
      flash('Vehicle denied.')
    } catch (err) {
      fail(err.message)
    }
  }

  const acceptRide = async (id) => {
    try {
      await request(ACCEPT_RIDE_MUTATION, { rideId: id })
      await loadDriverPanel()
      flash('Ride accepted.')
    } catch (err) {
      fail(err.message)
    }
  }

  const rejectRide = async (id) => {
    try {
      await request(REJECT_RIDE_MUTATION, { rideId: id })
      await loadDriverPanel()
      flash('Ride declined. It remains available for other drivers.')
    } catch (err) {
      fail(err.message)
    }
  }

  const arriveAssignedRide = async (id) => {
    try {
      await request(ARRIVE_RIDE_MUTATION, { rideId: id })
      await loadDriverPanel()
      flash('Marked as arrived.')
    } catch (err) {
      fail(err.message)
    }
  }

  const cancelAssignedRide = async (id) => {
    try {
      await request(CANCEL_RIDE_MUTATION, { rideId: id })
      await loadDriverPanel()
      flash('Ride cancelled.')
    } catch (err) {
      fail(err.message)
    }
  }

  const startAssignedRide = async (id) => {
    try {
      await request(START_RIDE_MUTATION, { rideId: id })
      await loadDriverPanel()
      flash('Trip started.')
    } catch (err) {
      fail(err.message)
    }
  }

  const completeAssignedRide = async (id) => {
    try {
      await request(COMPLETE_RIDE_MUTATION, { rideId: id })
      await loadDriverPanel()
      flash('Trip completed. Rider card charged.')
    } catch (err) {
      fail(err.message)
    }
  }

  const toggleDriverOnline = async () => {
    try {
      await request(DRIVER_ONLINE_MUTATION, {
        online: !myDriver?.online,
      })
      await loadDriverPanel()
    } catch (err) {
      fail(err.message)
    }
  }

  const requestRide = async () => {
    if (rideRequestInFlight.current || rideLoading) {
      return
    }

    if (!session?.token) {
      setShowAuth(true)
      setAuthMode('login')
      fail('Please log in to request a ride.')
      return
    }

    if (!stripe || !elements) {
      fail('Stripe is still loading. Please try again.')
      return
    }

    const cardElement = elements.getElement(CardElement)

    if (!cardElement) {
      fail('Payment card is not available.')
      return
    }

    rideRequestInFlight.current = true
    setRideLoading(true)
    setError('')
    setNotice('')

    try {
      const paymentMethodResult =
        await stripe.createPaymentMethod({
          type: 'card',
          card: cardElement,
        })

      if (paymentMethodResult.error) {
        console.error('STRIPE PAYMENT METHOD ERROR:', paymentMethodResult.error)
        fail(
          `Stripe: ${paymentMethodResult.error.message || 'Payment method creation failed.'}`
        )
        return
      }

      const paymentMethodId =
        paymentMethodResult.paymentMethod?.id

      if (!paymentMethodId) {
        throw new Error('Stripe did not create a payment method.')
      }

      if (
        ride.pickupLat == null ||
        ride.destLat == null
      ) {
        throw new Error('Pickup and destination must be selected on the map.')
      }

      const pickup = {
        address: ride.pickup || 'Pickup',
        lat: Number(ride.pickupLat),
        lng: Number(ride.pickupLng),
      }

      const destination = {
        address: ride.destination || 'Destination',
        lat: Number(ride.destLat),
        lng: Number(ride.destLng),
      }

      const data = await request(
        requestRideMutation,
        {
          pickup,
          destination,
          distanceMiles: Number(ride.distanceMiles || rideQuote?.distanceMiles),
          durationMinutes: Number(
            ride.durationMinutes || rideQuote?.durationMinutes
          ),
          surgeMultiplier: 1,
          paymentMethodId,
        }
      )

      if (data?.requestRide) {
        flash(
          `Ride requested. Drivers nearby can accept. Your card is charged only after the trip is complete.`
        )
        setRideQuote(null)
      }
    } catch (err) {
      fail(err.message)
    } finally {
      rideRequestInFlight.current = false
      setRideLoading(false)
    }
  }

  const login = async (e) => {
    if (e) e.preventDefault()

    if (loading) return

    setLoading(true)

    try {
      const data = await request(loginMutation, {
        loginInput: loginForm,
      })

      sessionStorage.setItem(
        sessionKey,
        JSON.stringify(data.login)
      )

      setSession(data.login)
      setShowAuth(false)
      setLoginForm({ email: '', password: '' })
      flash('Welcome back.')
    } catch (err) {
      fail(err.message)
    } finally {
      setLoading(false)
    }
  }

  const register = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      await request(registerMutation, {
        userInput: registerForm,
      })

      flash('Account created. Please log in.')

      setAuthMode('login')

      setLoginForm({
        email: registerForm.email,
        password: '',
      })
    } catch (err) {
      fail(err.message)
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    sessionStorage.removeItem(sessionKey)
    setSession(null)
    setDriver(null)
    setBookings([])
    setNotifications([])
    setEditingId(null)
    setEvent(emptyEvent)
    setPage('dashboard')
    flash('You have been logged out.')
  }

  const bookEvent = async (eventId) => {
    if (!session) {
      setShowAuth(true)
      return
    }

    try {
      await request(bookEventMutation, { eventId })
      flash('Event booked successfully.')
      await loadBookings()
      await loadEvents()
    } catch (err) {
      fail(err.message)
    }
  }

  const publishEvent = async (e) => {
    e.preventDefault()

    if (!session) {
      setShowAuth(true)
      return
    }

    const eventInput = {
      ...event,
      price: Number(event.price),
    }

    try {
      if (editingId) {
        await request(updateEventMutation, {
          eventId: editingId,
          eventInput,
        })
        setEditingId(null)
        setEvent(emptyEvent)
        flash('Event updated.')
      } else {
        await request(createEventMutation, { eventInput })
        setEvent(emptyEvent)
        flash('Event published.')
      }

      await loadEvents()
    } catch (err) {
      fail(err.message)
    }
  }

  const startEdit = (item) => {
    setEditingId(item._id)
    setEvent({
      title: item.title || '',
      description: item.description || '',
      price: item.price ?? '',
      date: toDateTimeLocal(item.date),
      zipCode: item.zipCode || '',
    })
    setPage('events')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEvent(emptyEvent)
  }

  const deleteEvent = async (item) => {
    if (!session) {
      setShowAuth(true)
      return
    }

    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) {
      return
    }

    try {
      await request(deleteEventMutation, { eventId: item._id })

      if (editingId === item._id) {
        cancelEdit()
      }

      flash('Event deleted.')
      await loadEvents()
      await loadBookings()
    } catch (err) {
      fail(err.message)
    }
  }

  const cancelBooking = async (booking) => {
    if (!session) {
      setShowAuth(true)
      return
    }

    if (!window.confirm(`Cancel your booking for "${booking.event.title}"?`)) {
      return
    }

    try {
      await request(cancelBookingMutation, {
        bookingId: booking._id,
      })
      flash('Booking cancelled.')
      await loadBookings()
      await loadEvents()
    } catch (err) {
      fail(err.message)
    }
  }

  const getRideQuote = async (e) => {
    if (e && e.preventDefault) e.preventDefault()

    if (!session) {
      setShowAuth(true)
      return
    }

    if (
      ride.pickupLat == null ||
      ride.pickupLng == null ||
      ride.destLat == null ||
      ride.destLng == null
    ) {
      fail('Tap the map to set pickup and destination.')
      return
    }

    setRideLoading(true)
    setRideQuote(null)

    try {
      const input = {
        pickup: {
          address: ride.pickup || 'Pickup',
          lat: Number(ride.pickupLat),
          lng: Number(ride.pickupLng),
        },
        destination: {
          address: ride.destination || 'Destination',
          lat: Number(ride.destLat),
          lng: Number(ride.destLng),
        },
        surgeMultiplier: 1,
      }

      const data = await request(quoteRideMutation, { input })

      setRide((current) => ({
        ...current,
        distanceMiles: data.quoteRide.distanceMiles,
        durationMinutes: data.quoteRide.durationMinutes,
      }))
      setRideQuote(data.quoteRide)
      flash('Fare quote calculated.')
    } catch (err) {
      fail(err.message)
    } finally {
      setRideLoading(false)
    }
  }

  const pickMapPoint = async (role, point) => {
    try {
      const data = await request(reverseGeocodeQuery, {
        lat: point.lat,
        lng: point.lng,
      })
      const place = data.reverseGeocode
      const label = place?.address || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`

      if (role === 'pickup') {
        setRide((current) => ({
          ...current,
          pickup: label,
          pickupLat: point.lat,
          pickupLng: point.lng,
        }))
      } else {
        setRide((current) => ({
          ...current,
          destination: label,
          destLat: point.lat,
          destLng: point.lng,
        }))
      }
      setRideQuote(null)
    } catch (err) {
      fail(err.message)
    }
  }

  const applyAsDriver = async (e) => {
    e.preventDefault()

    try {
      const data = await request(applyDriverMutation, {
        driverInput: {
          ...driverForm,
          vehicleYear: Number(driverForm.vehicleYear),
        },
      })

      setDriver(data.applyAsDriver)
      flash('Driver application submitted.')
    } catch (err) {
      fail(err.message)
    }
  }

  const toggleDriver = async () => {
    try {
      const data = await request(updateDriverOnlineMutation, {
        online: !driver.online,
      })

      setDriver(data.setDriverOnline)
      await loadDriverPanel()

      if (data.setDriverOnline.online && 'Notification' in window) {
        Notification.requestPermission()
      }

      flash(
        data.setDriverOnline.online
          ? 'You are now online. Incoming ride requests will appear below.'
          : 'You are now offline.'
      )
    } catch (err) {
      fail(err.message)
    }
  }

  const saveProfile = async (e) => {
    e.preventDefault()

    try {
      await request(updateProfileMutation, profile)
      flash('Profile updated.')
    } catch (err) {
      fail(err.message)
    }
  }


  const nav = [
    ['dashboard', 'Dashboard'],
    ['events', 'Events'],
    ['rides', 'Rides'],
    ['driver', 'Driver'],
    ['bookings', 'My Bookings'],
    ['profile', 'Profile'],
  ]

  return (
    <div className="app-shell" id="top">
      <header className="topbar">
        <a
          className="brand"
          href="#top"
          aria-label="LINK home"
          onClick={() => setPage('dashboard')}
        >
          <span className="brand-mark">LINK</span>
        </a>

        <nav>
          {nav.map(([key, label]) => (
            <button
              key={key}
              className={page === key ? 'active' : ''}
              onClick={() => {
                setPage(key)
                if (key === 'driver' || key === 'driver-dashboard') loadDriverPanel()
                if (key === 'admin') loadAdminDrivers()
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="account-actions">
          {session ? (
            <>
              <span className="user-email">{session.email}</span>
              <button
                type="button"
                className="outline-button"
                onClick={logout}
              >
                Logout
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primary-button"
              aria-label="Open login"
              onPointerUp={openAuthLogin}
            >
              Login
            </button>
          )}
        </div>
      </header>

      <main>
        {notice && <div className="toast success">{notice}</div>}
        {session?.email?.toLowerCase() === 'echolsbrysonkyle@gmail.com' && (
          <section className="admin-panel page">
            <div className="section-heading">
              <div>
                <span className="eyebrow">ADMIN</span>
                <h2>Driver & Vehicle Approvals</h2>
              </div>
              <button
                className="outline-button"
                onClick={loadAdminDrivers}
                disabled={adminLoading}
              >
                {adminLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            <p>
              Administrator: echolsbrysonkyle@gmail.com
            </p>

            <div className="admin-driver-list">
              {adminDrivers.length === 0 ? (
                <div className="card">
                  <strong>No driver applications loaded.</strong>
                  <button
                    className="primary-button"
                    onClick={loadAdminDrivers}
                  >
                    Load applications
                  </button>
                </div>
              ) : (
                adminDrivers.map(d => (
                  <div className="card" key={d._id}>
                    <h3>
                      {d.firstName} {d.lastName}
                    </h3>

                    <p>
                      {d.vehicleYear} {d.vehicleMake} {d.vehicleModel}
                    </p>

                    <p>
                      {d.vehicleColor} • {d.licensePlate}
                    </p>

                    <p>
                      Driver status: <strong>{d.status}</strong>
                    </p>

                    <p>
                      Vehicle status: <strong>{d.vehicleStatus}</strong>
                    </p>

                    <div className="hero-actions">
                      {d.status !== 'APPROVED' && (
                        <button
                          className="primary-button"
                          onClick={() => approveDriver(d._id)}
                        >
                          Approve driver
                        </button>
                      )}

                      {d.status !== 'DENIED' && (
                        <button
                          className="outline-button"
                          onClick={() => denyDriver(d._id)}
                        >
                          Deny driver
                        </button>
                      )}

                      {d.vehicleStatus !== 'APPROVED' && (
                        <button
                          className="primary-button"
                          onClick={() => approveVehicle(d._id)}
                        >
                          Approve vehicle
                        </button>
                      )}

                      {d.vehicleStatus !== 'DENIED' && (
                        <button
                          className="outline-button"
                          onClick={() => denyVehicle(d._id)}
                        >
                          Deny vehicle
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {error && <div className="toast error">{error}</div>}

        {page === 'dashboard' && (
          <section className="hero reveal">
            <div className="hero-copy">
              <span className="eyebrow">EVENTS • RIDES • SOCIAL</span>

              <h1>
                Everything happening around you,
                <span> in one place.</span>
              </h1>

              <p>
                Discover local events, book experiences, request rides,
                and connect with your community.
              </p>

              <div className="hero-actions">
                <button
                  className="primary-button large hero-action-button"
                  onClick={() => setPage('events')}
                >
                  Explore events
                </button>

                <button
                  className="outline-button large hero-action-button"
                  onClick={() => setPage('rides')}
                >
                  Get a ride
                </button>
              </div>
            </div>

            <div className="hero-card reveal reveal-delay-2">
              <div className="hero-card-header">
                <span>QUICK ACTIONS</span>
              </div>

              <button onClick={() => setPage('events')}>
                <strong>Discover events</strong>
                <span>{events.length} events available</span>
              </button>

              <button onClick={() => setPage('rides')}>
                <strong>Request a ride</strong>
                <span>Calculate your estimated fare</span>
              </button>

              <button onClick={() => setPage('driver')}>
                <strong>Drive with LINK</strong>
                <span>
                  {driver ? 'Open your driver dashboard' : 'Apply to drive'}
                </span>
              </button>
            </div>
          </section>
        )}

        {page === 'events' && (
          <section className="page reveal">
            <div className="page-heading">
              <div>
                <span className="eyebrow">COMMUNITY</span>
                <h2>Upcoming events</h2>
                <p>Find something worth showing up for.</p>
              </div>

              <button
                className="outline-button"
                onClick={loadEvents}
              >
                Refresh
              </button>
            </div>

            <div className="stats-row reveal reveal-delay-1">
              <div>
                <strong>{events.length}</strong>
                <span>Events</span>
              </div>

              <div>
                <strong>{bookingsCount}</strong>
                <span>Total bookings</span>
              </div>
            </div>

            <div className="event-grid">
              {events.map(item => (
                <article className="event-card reveal" key={item._id}>
                  <div className="event-date">
                    <strong>
                      {formatMonth(item.date)}
                    </strong>

                    <span>
                      {formatDay(item.date)}
                    </span>
                  </div>

                  <div className="event-content">
                    <span className="event-location">
                      ZIP {item.zipCode}
                    </span>

                    <h3>{item.title}</h3>

                    <p>{item.description}</p>

                    <small>
                      Hosted by{' '}
                      {item.creator?.firstName
                        ? `${item.creator.firstName} ${item.creator.lastName || ''}`
                        : item.creator?.email}
                    </small>

                    <div className="event-footer card-bottom">
                      <strong>
                        ${Number(item.price).toFixed(2)}
                      </strong>

                      <span className="card-actions">
                        {isEventOwner(item, session) && (
                          <>
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => startEdit(item)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => deleteEvent(item)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                        <button
                          className="primary-button"
                          onClick={() => bookEvent(item._id)}
                        >
                          Book now
                        </button>
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {!events.length && (
              <div className="empty-state">
                <h3>No events yet</h3>
                <p>Create the first event in your community.</p>
              </div>
            )}

            {session && (
              <div className="form-card">
                <span className="eyebrow">HOST</span>
                <h3>
                  {editingId ? 'Edit your event' : 'Publish an event'}
                </h3>

                <form onSubmit={publishEvent}>
                  <input
                    placeholder="Event title"
                    value={event.title}
                    onChange={e =>
                      setEvent({
                        ...event,
                        title: e.target.value,
                      })
                    }
                    required
                  />

                  <textarea
                    placeholder="Description"
                    value={event.description}
                    onChange={e =>
                      setEvent({
                        ...event,
                        description: e.target.value,
                      })
                    }
                    required
                  />

                  <div className="form-grid">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Price"
                      value={event.price}
                      onChange={e =>
                        setEvent({
                          ...event,
                          price: e.target.value,
                        })
                      }
                      required
                    />

                    <input
                      type="datetime-local"
                      value={event.date}
                      onChange={e =>
                        setEvent({
                          ...event,
                          date: e.target.value,
                        })
                      }
                      required
                    />

                    <input
                      placeholder="ZIP code"
                      maxLength="5"
                      value={event.zipCode}
                      onChange={e =>
                        setEvent({
                          ...event,
                          zipCode: e.target.value
                            .replace(/\D/g, '')
                            .slice(0, 5),
                        })
                      }
                      required
                    />
                  </div>

                  <button className="primary-button">
                    {editingId ? 'Save changes' : 'Publish event'}
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={cancelEdit}
                    >
                      Cancel edit
                    </button>
                  )}
                </form>
              </div>
            )}
          </section>
        )}

        {page === 'rides' && (
          <section className="page reveal">
            <div className="page-heading">
              <div>
                <span className="eyebrow">TRANSPORTATION</span>
                <h2>Request a ride</h2>
                <p>Get an estimated fare before your trip.</p>
              </div>
            </div>

            <div className="ride-layout">
              <form className="form-card" onSubmit={getRideQuote}>
                <h3>Trip details</h3>
                <p>
                  Choose pickup and destination by tapping the map.
                  Typed addresses are not accepted.
                </p>

                <RideMapPicker
                  pickup={
                    ride.pickupLat == null
                      ? null
                      : { lat: ride.pickupLat, lng: ride.pickupLng }
                  }
                  destination={
                    ride.destLat == null
                      ? null
                      : { lat: ride.destLat, lng: ride.destLng }
                  }
                  pickupLabel={ride.pickup}
                  destinationLabel={ride.destination}
                  onPickPickup={(point) => pickMapPoint('pickup', point)}
                  onPickDestination={(point) => pickMapPoint('destination', point)}
                />

                <button
                  className="primary-button large"
                  disabled={
                    rideLoading ||
                    ride.pickupLat == null ||
                    ride.destLat == null
                  }
                >
                  {rideLoading
                    ? 'Calculating...'
                    : 'Calculate fare'}
                </button>
              </form>

              <div className="quote-card">
                <span className="eyebrow">FARE ESTIMATE</span>

                {rideQuote ? (
                  <>
                    <div className="payment-card">
                      <label>Payment card</label>
                      <div className="stripe-card">
                        {stripe && elements ? (
                          <CardElement
                            options={{
                              hidePostalCode: false,
                              style: {
                                base: {
                                  fontSize: '16px',
                                  color: '#1f2937',
                                  fontFamily: 'Arial, sans-serif',
                                  '::placeholder': {
                                    color: '#6b7280',
                                  },
                                },
                                invalid: {
                                  color: '#dc2626',
                                },
                              },
                            }}
                            onChange={event => {
                              setCardComplete(event.complete)
                              if (event.error) {
                                setError(event.error.message)
                              } else {
                                setError('')
                              }
                            }}
                          />
                        ) : (
                          <p>Loading payment form...</p>
                        )}
                      </div>
                    </div>

                    <div className="fare">
                      ${Number(rideQuote.estimatedFare).toFixed(2)}
                    </div>

                    <div className="quote-stat">
                      <span>Distance</span>
                      <strong>
                        {rideQuote.distanceMiles} mi
                      </strong>
                    </div>

                    <div className="quote-stat">
                      <span>Duration</span>
                      <strong>
                        {rideQuote.durationMinutes} min
                      </strong>
                    </div>

                    <div className="quote-stat">
                      <span>Driver amount</span>
                      <strong>
                        ${Number(rideQuote.driverAmount).toFixed(2)}
                      </strong>
                    </div>

                    <div className="quote-stat">
                      <span>Platform amount</span>
                      <strong>
                        ${Number(rideQuote.platformAmount).toFixed(2)}
                      </strong>
                    </div>

                    <button
                      className="primary-button large"
                      onClick={requestRide}
                      disabled={rideLoading}
                    >
                      {rideLoading ? 'Requesting...' : 'Request ride'}
                    </button>
                  </>
                ) : (
                  <div className="quote-empty">
                    <div className="quote-icon">↗</div>
                    <h3>Your fare appears here</h3>
                    <p>
                      Tap pickup and destination on the map, then calculate fare.
                      Your card is charged only after the trip is complete.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {page === 'driver' && (
          <section className="page reveal">
            <div className="page-heading">
              <div>
                <span className="eyebrow">DRIVER CENTER</span>
                <h2>
                  {driver
                    ? 'Driver dashboard'
                    : 'Drive with LINK'}
                </h2>

                <p>
                  {driver
                    ? 'Manage your driving status and vehicle.'
                    : 'Turn your vehicle into an earning opportunity.'}
                </p>
              </div>
            </div>

            {!session ? (
              <div className="empty-state">
                <h3>Login required</h3>
                <p>Log in to apply as a driver.</p>
                <button
                  className="primary-button"
                  onClick={() => setShowAuth(true)}
                >
                  Login
                </button>
              </div>
            ) : driverLoading ? (
              <div className="empty-state">
                Loading driver profile...
              </div>
            ) : driver ? (
              <div className="driver-dashboard">
                <div className="driver-status-card">
                  <div>
                    <span className="eyebrow">STATUS</span>
                    <h3>{driver.status}</h3>
                    <p>
                      {driver.online
                        ? 'You are currently accepting rides.'
                        : 'You are currently offline.'}
                    </p>
                  </div>

                  <button
                    className={
                      driver.online
                        ? 'danger-button'
                        : 'primary-button'
                    }
                    onClick={toggleDriver}
                    disabled={driver.status !== 'APPROVED'}
                  >
                    {driver.online ? 'Go offline' : 'Go online'}
                  </button>
                </div>

                <div className="driver-stats">
                  <div>
                    <strong>
                      {Number(driver.rating || 0).toFixed(1)}
                    </strong>
                    <span>Rating</span>
                  </div>

                  <div>
                    <strong>{driver.completedRides}</strong>
                    <span>Completed rides</span>
                  </div>

                  <div>
                    <strong>
                      ${Number(driver.totalEarnings || 0).toFixed(2)}
                    </strong>
                    <span>Total earnings</span>
                  </div>
                </div>

                {driver.status === 'APPROVED' && driver.online && (
                  <div className="form-card">
                    <span className="eyebrow">INCOMING REQUESTS</span>
                    <h3>Ride requests</h3>
                    <p>Accept or deny trips while you are online. New requests refresh automatically.</p>
                    {driverLoadingPanel ? (
                      <p>Checking for rides...</p>
                    ) : availableRides.length ? (
                      availableRides.map((item) => (
                        <article className="booking-row" key={item._id}>
                          <div>
                            <span>PICKUP</span>
                            <strong>{item.pickup}</strong>
                          </div>
                          <div>
                            <span>DESTINATION</span>
                            <strong>{item.destination}</strong>
                          </div>
                          <div>
                            <span>FARE</span>
                            <strong>
                              ${Number(item.fare || item.estimatedFare || 0).toFixed(2)}
                            </strong>
                          </div>
                          <div className="row-action">
                            <button
                              type="button"
                              className="primary-button"
                              onClick={() => acceptRide(item._id)}
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => rejectRide(item._id)}
                            >
                              Deny
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <p>No open ride requests right now.</p>
                    )}
                  </div>
                )}

                {driver.status === 'APPROVED' && (
                  <div className="form-card">
                    <span className="eyebrow">YOUR RIDES</span>
                    <h3>Assigned trips</h3>
                    {myRides.length ? (
                      myRides.map((item) => (
                        <article className="booking-row" key={item._id}>
                          <div>
                            <span>STATUS</span>
                            <strong>{item.status}</strong>
                          </div>
                          <div>
                            <span>PICKUP</span>
                            <strong>{item.pickup}</strong>
                          </div>
                          <div>
                            <span>DESTINATION</span>
                            <strong>{item.destination}</strong>
                          </div>
                          <div className="row-action">
                            {item.status === 'ACCEPTED' && (
                              <>
                                <button
                                  type="button"
                                  className="primary-button"
                                  onClick={() => arriveAssignedRide(item._id)}
                                >
                                  Arrived
                                </button>
                                <button
                                  type="button"
                                  className="primary-button"
                                  onClick={() => startAssignedRide(item._id)}
                                >
                                  Start trip
                                </button>
                              </>
                            )}

                            {item.status === 'DRIVER_ARRIVING' && (
                              <button
                                type="button"
                                className="primary-button"
                                onClick={() => startAssignedRide(item._id)}
                              >
                                Start trip
                              </button>
                            )}

                            {item.status === 'DRIVER_ARRIVED' && (
                              <button
                                type="button"
                                className="primary-button"
                                onClick={() => startAssignedRide(item._id)}
                              >
                                Start trip
                              </button>
                            )}

                            {item.status === 'IN_PROGRESS' && (
                              <button
                                type="button"
                                className="primary-button"
                                onClick={() => completeAssignedRide(item._id)}
                              >
                                Complete trip
                              </button>
                            )}

                            {item.status !== 'COMPLETED' &&
                             item.status !== 'CANCELLED' && (
                              <button
                                type="button"
                                className="danger"
                                onClick={() => cancelAssignedRide(item._id)}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </article>
                      ))
                    ) : (
                      <p>No assigned trips yet.</p>
                    )}
                  </div>
                )}

                <div className="form-card">
                  <span className="eyebrow">VEHICLE</span>
                  <h3>Your vehicle</h3>

                  <div className="vehicle-grid">
                    <div>
                      <span>Make</span>
                      <strong>{driver.vehicleMake}</strong>
                    </div>

                    <div>
                      <span>Model</span>
                      <strong>{driver.vehicleModel}</strong>
                    </div>

                    <div>
                      <span>Year</span>
                      <strong>{driver.vehicleYear}</strong>
                    </div>

                    <div>
                      <span>Color</span>
                      <strong>{driver.vehicleColor}</strong>
                    </div>

                    <div>
                      <span>License plate</span>
                      <strong>{driver.licensePlate}</strong>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="form-card driver-application">
                <span className="eyebrow">DRIVER APPLICATION</span>
                <h3>Become a driver</h3>

                <form onSubmit={applyAsDriver}>
                  <div className="form-grid">
                    <input
                      placeholder="Vehicle make"
                      value={driverForm.vehicleMake}
                      onChange={e =>
                        setDriverForm({
                          ...driverForm,
                          vehicleMake: e.target.value,
                        })
                      }
                      required
                    />

                    <input
                      placeholder="Vehicle model"
                      value={driverForm.vehicleModel}
                      onChange={e =>
                        setDriverForm({
                          ...driverForm,
                          vehicleModel: e.target.value,
                        })
                      }
                      required
                    />

                    <input
                      type="number"
                      placeholder="Vehicle year"
                      value={driverForm.vehicleYear}
                      onChange={e =>
                        setDriverForm({
                          ...driverForm,
                          vehicleYear: e.target.value,
                        })
                      }
                      required
                    />

                    <input
                      placeholder="Vehicle color"
                      value={driverForm.vehicleColor}
                      onChange={e =>
                        setDriverForm({
                          ...driverForm,
                          vehicleColor: e.target.value,
                        })
                      }
                      required
                    />

                    <input
                      placeholder="License plate"
                      value={driverForm.licensePlate}
                      onChange={e =>
                        setDriverForm({
                          ...driverForm,
                          licensePlate: e.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  <button className="primary-button large">
                    Submit driver application
                  </button>
                </form>
              </div>
            )}
          </section>
        )}

        {page === 'bookings' && (
          <section className="page reveal">
            <div className="page-heading">
              <div>
                <span className="eyebrow">YOUR ACTIVITY</span>
                <h2>My bookings</h2>
                <p>Your upcoming event reservations.</p>
              </div>

              <button
                className="outline-button"
                onClick={loadBookings}
              >
                Refresh
              </button>
            </div>

            {!session ? (
              <div className="empty-state">
                <h3>Login required</h3>
                <button
                  className="primary-button"
                  onClick={() => setShowAuth(true)}
                >
                  Login
                </button>
              </div>
            ) : bookings.length ? (
              <div className="booking-list">
                {bookings.map(booking => (
                  <article
                    className="booking-row"
                    key={booking._id}
                  >
                    <div>
                      <span>EVENT</span>
                      <strong>
                        {booking.event.title}
                      </strong>
                    </div>

                      <div>
                        <span>DATE</span>
                        <strong>
                          {formatDateTime(booking.event.date)}
                        </strong>
                      </div>

                    <div>
                      <span>PRICE</span>
                      <strong>
                        $
                        {Number(
                          booking.event.price
                        ).toFixed(2)}
                      </strong>
                    </div>

                    <div className="row-action">
                      <button
                        type="button"
                        className="danger"
                        onClick={() => cancelBooking(booking)}
                      >
                        Cancel booking
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h3>No bookings yet</h3>
                <p>Book an event and it will appear here.</p>
              </div>
            )}
          </section>
        )}

        {page === 'profile' && (
          <section className="page reveal">
            <div className="page-heading">
              <div>
                <span className="eyebrow">ACCOUNT</span>
                <h2>Your profile</h2>
                <p>Manage your personal information.</p>
              </div>
            </div>

            {!session ? (
              <div className="empty-state">
                <h3>Login required</h3>
                <button
                  className="primary-button"
                  onClick={() => setShowAuth(true)}
                >
                  Login
                </button>
              </div>
            ) : (
              <div className="form-card">
                <form onSubmit={saveProfile}>
                  <div className="form-grid">
                    <input
                      placeholder="First name"
                      value={profile.firstName}
                      onChange={e =>
                        setProfile({
                          ...profile,
                          firstName: e.target.value,
                        })
                      }
                    />

                    <input
                      placeholder="Last name"
                      value={profile.lastName}
                      onChange={e =>
                        setProfile({
                          ...profile,
                          lastName: e.target.value,
                        })
                      }
                    />

                    <input
                      placeholder="Phone"
                      value={profile.phone}
                      onChange={e =>
                        setProfile({
                          ...profile,
                          phone: e.target.value,
                        })
                      }
                    />
                  </div>

                  <textarea
                    placeholder="Bio"
                    value={profile.bio}
                    onChange={e =>
                      setProfile({
                        ...profile,
                        bio: e.target.value,
                      })
                    }
                  />

                  <button className="primary-button">
                    Save profile
                  </button>
                </form>
              </div>
            )}
          </section>
        )}

        {notifications.length > 0 && (
          <aside className="notification-drawer">
            <div className="notification-header">
              <span>Notifications</span>
              <strong>{notifications.length}</strong>
            </div>

            {notifications.slice(0, 5).map(notification => (
              <div
                className="notification-item"
                key={notification._id}
              >
                <strong>{notification.type}</strong>
                <p>{notification.message}</p>
              </div>
            ))}
          </aside>
        )}
      </main>

      <footer><span>LINK</span></footer>

      {showAuth && (
        <div
          className="modal-backdrop"
          onClick={() => setShowAuth(false)}
        >
          <div
            className="auth-modal"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setShowAuth(false)}
            >
              ×
            </button>

            <div className="auth-tabs">
              <button
                className={authMode === 'login' ? 'active' : ''}
                onClick={() => setAuthMode('login')}
              >
                Login
              </button>

              <button
                className={
                  authMode === 'register'
                    ? 'active'
                    : ''
                }
                onClick={() => setAuthMode('register')}
              >
                Register
              </button>
            </div>

            {authMode === 'login' ? (
              <form onSubmit={login}>
                <h2>Welcome back</h2>

                <input
                  type="email"
                  placeholder="Email"
                  value={loginForm.email}
                  onChange={e =>
                    setLoginForm({
                      ...loginForm,
                      email: e.target.value,
                    })
                  }
                  required
                />

                <input
                  type="password"
                  placeholder="Password"
                  value={loginForm.password}
                  onChange={e =>
                    setLoginForm({
                      ...loginForm,
                      password: e.target.value,
                    })
                  }
                  required
                />

                <button
                  type="button"
                  className="primary-button large"
                  disabled={loading}
                  onClick={(e) => login(e)}
                  onTouchEnd={(e) => {
                    e.preventDefault()
                    if (!loading) login(e)
                  }}
                >
                  {loading ? 'Logging in...' : 'Login'}
                </button>
              </form>
            ) : (
              <form onSubmit={register}>
                <h2>Create account</h2>

                <div className="form-grid">
                  <input
                    placeholder="First name"
                    value={registerForm.firstName}
                    onChange={e =>
                      setRegisterForm({
                        ...registerForm,
                        firstName: e.target.value,
                      })
                    }
                    required
                  />

                  <input
                    placeholder="Last name"
                    value={registerForm.lastName}
                    onChange={e =>
                      setRegisterForm({
                        ...registerForm,
                        lastName: e.target.value,
                      })
                    }
                    required
                  />

                  <input
                    placeholder="Phone"
                    value={registerForm.phone}
                    onChange={e =>
                      setRegisterForm({
                        ...registerForm,
                        phone: e.target.value,
                      })
                    }
                    required
                  />

                  <input
                    placeholder="ZIP code"
                    value={registerForm.zipCode}
                    onChange={e =>
                      setRegisterForm({
                        ...registerForm,
                        zipCode: e.target.value,
                      })
                    }
                    required
                  />
                </div>

                <input
                  type="email"
                  placeholder="Email"
                  value={registerForm.email}
                  onChange={e =>
                    setRegisterForm({
                      ...registerForm,
                      email: e.target.value,
                    })
                  }
                  required
                />

                <input
                  type="password"
                  placeholder="Password"
                  value={registerForm.password}
                  onChange={e =>
                    setRegisterForm({
                      ...registerForm,
                      password: e.target.value,
                    })
                  }
                  required
                />

                <button
                  className="primary-button large"
                  disabled={loading}
                >
                  {loading
                    ? 'Creating account...'
                    : 'Create account'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

if (!stripeKey || !stripeKey.startsWith('pk_')) {
  console.error('Stripe publishable key is missing or invalid')
}

const stripePromise = stripeKey ? loadStripe(stripeKey) : null

const StripeApp = () => (
  <Elements stripe={stripePromise}>
    <App />
  </Elements>
)

export default StripeApp

