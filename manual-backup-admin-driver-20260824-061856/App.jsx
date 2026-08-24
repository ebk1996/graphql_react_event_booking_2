import { useEffect, useState } from 'react'
import './App.css'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'

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
    rating
    totalEarnings
    completedRides
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
  $paymentIntentId: String!
) {
  requestRide(
    pickup: $pickup
    destination: $destination
    distanceMiles: $distanceMiles
    durationMinutes: $durationMinutes
    surgeMultiplier: $surgeMultiplier
    paymentIntentId: $paymentIntentId
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
    rating
    totalEarnings
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
    rating
    totalEarnings
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

  const [ride, setRide] = useState({
    pickup: '',
    destination: '',
    distanceMiles: '',
    durationMinutes: '',
    surgeMultiplier: '1',
  })

  const [rideQuote, setRideQuote] = useState(null)
  const [rideLoading, setRideLoading] = useState(false)
  const [cardComplete, setCardComplete] = useState(false)

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
  }, [page, events.length, bookings.length])

  const requestRide = async () => {
    console.log('REQUEST RIDE CLICKED', {
      hasSession: !!session?.token,
      hasStripe: !!stripe,
      hasElements: !!elements,
      rideLoading,
      rideQuote: !!rideQuote,
    })

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

      const pickup = {
        address: ride.pickup,
        lat: 0,
        lng: 0,
      }

      const destination = {
        address: ride.destination,
        lat: 0,
        lng: 0,
      }

      const paymentData = await request(
        createRidePaymentIntentMutation,
        {
          pickup,
          destination,
          distanceMiles: Number(ride.distanceMiles),
          durationMinutes: Number(ride.durationMinutes),
          paymentMethodId,
          surgeMultiplier: Number(
            ride.surgeMultiplier || 1
          ),
        }
      )

      const paymentIntentId =
        paymentData?.createRidePaymentIntent?.paymentIntentId

      if (!paymentIntentId) {
        throw new Error(
          'Stripe payment authorization was not created.'
        )
      }

      const data = await request(
        requestRideMutation,
        {
          pickup,
          destination,
          distanceMiles: Number(ride.distanceMiles),
          durationMinutes: Number(ride.durationMinutes),
          surgeMultiplier: Number(
            ride.surgeMultiplier || 1
          ),
          paymentIntentId,
        }
      )

      if (data?.requestRide) {
        flash(
          `Ride requested successfully. Status: ${data.requestRide.status}`
        )
        setRideQuote(null)
      }
    } catch (err) {
      fail(err.message)
    } finally {
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

    try {
      await request(createEventMutation, {
        eventInput: {
          ...event,
          price: Number(event.price),
        },
      })

      setEvent(emptyEvent)
      flash('Event published.')
      await loadEvents()
    } catch (err) {
      fail(err.message)
    }
  }

  const getRideQuote = async (e) => {
    e.preventDefault()

    if (!session) {
      setShowAuth(true)
      return
    }

    setRideLoading(true)
    setRideQuote(null)

    try {
      const input = {
        pickup: {
          address: ride.pickup,
          lat: 0,
          lng: 0,
        },
        destination: {
          address: ride.destination,
          lat: 0,
          lng: 0,
        },
        distanceMiles: Number(ride.distanceMiles),
        durationMinutes: Number(ride.durationMinutes),
        surgeMultiplier: Number(ride.surgeMultiplier || 1),
      }

      const data = await request(quoteRideMutation, { input })

      setRideQuote(data.quoteRide)
      flash('Fare quote calculated.')
    } catch (err) {
      fail(err.message)
    } finally {
      setRideLoading(false)
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
      flash(
        data.setDriverOnline.online
          ? 'You are now online.'
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
              onClick={() => setPage(key)}
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

                    <div className="event-footer">
                      <strong>
                        ${Number(item.price).toFixed(2)}
                      </strong>

                      <button
                        className="primary-button"
                        onClick={() => bookEvent(item._id)}
                      >
                        Book now
                      </button>
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
                <h3>Publish an event</h3>

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
                    Publish event
                  </button>
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

                <label>Pickup</label>
                <input
                  placeholder="Pickup address"
                  value={ride.pickup}
                  onChange={e =>
                    setRide({
                      ...ride,
                      pickup: e.target.value,
                    })
                  }
                  required
                />

                <label>Destination</label>
                <input
                  placeholder="Destination address"
                  value={ride.destination}
                  onChange={e =>
                    setRide({
                      ...ride,
                      destination: e.target.value,
                    })
                  }
                  required
                />

                <div className="form-grid">
                  <div>
                    <label>Distance</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="Miles"
                      value={ride.distanceMiles}
                      onChange={e =>
                        setRide({
                          ...ride,
                          distanceMiles: e.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  <div>
                    <label>Duration</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Minutes"
                      value={ride.durationMinutes}
                      onChange={e =>
                        setRide({
                          ...ride,
                          durationMinutes: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                </div>

                <label>Surge multiplier</label>
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={ride.surgeMultiplier}
                  onChange={e =>
                    setRide({
                      ...ride,
                      surgeMultiplier: e.target.value,
                    })
                  }
                />

                <button
                  className="primary-button large"
                  disabled={rideLoading}
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
                      Enter your trip details and calculate an estimate.
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
                      {Number(driver.rating).toFixed(1)}
                    </strong>
                    <span>Rating</span>
                  </div>

                  <div>
                    <strong>{driver.completedRides}</strong>
                    <span>Completed rides</span>
                  </div>

                  <div>
                    <strong>
                      ${Number(driver.totalEarnings).toFixed(2)}
                    </strong>
                    <span>Total earnings</span>
                  </div>
                </div>

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

const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ''
)

const StripeApp = () => (
  <Elements stripe={stripePromise}>
    <App />
  </Elements>
)

export default StripeApp

