import { useEffect, useState } from 'react'
import './App.css'

const sessionKey = 'gather-current-user'

const readSession = () => {
  try {
    const stored = JSON.parse(sessionStorage.getItem(sessionKey))
    if (stored?.token && stored?.userId) return stored
  } catch { /* ignore corrupt session */ }
  return null
}

const request = async (query, variables = {}) => {
  const headers = { 'Content-Type': 'application/json' }
  const session = readSession()
  if (session?.token) headers.Authorization = `Bearer ${session.token}`
  const response = await fetch('/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const payload = await response.json()
  if (payload.errors?.length) throw new Error(payload.errors[0].message)
  return payload.data
}

const eventsQuery = `query { events { _id title description price date creator { _id email } } bookingsCount }`
const bookingsQuery = `query { bookings { _id createdAt event { title date } } }`
const emptyEvent = { title: '', description: '', price: '', date: '' }

// <input type="datetime-local"> wants a local `YYYY-MM-DDTHH:mm`, not the stored ISO string.
const toLocalInput = (iso) => {
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function App() {
  const [events, setEvents] = useState([])
  const [bookingsCount, setBookingsCount] = useState(0)
  const [bookings, setBookings] = useState([])
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [account, setAccount] = useState({ email: '', password: '' })
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [event, setEvent] = useState(emptyEvent)
  const [editingId, setEditingId] = useState(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState(() => readSession())

  const loadEvents = async () => {
    setLoading(true)
    try {
      const data = await request(eventsQuery)
      setEvents(data.events)
      setBookingsCount(data.bookingsCount)
    }
    catch (error) { setNotice(`Could not load events: ${error.message}`) }
    finally { setLoading(false) }
  }

  const loadBookings = async () => {
    if (!currentUser) { setBookings([]); return }
    setBookingsLoading(true)
    try { setBookings((await request(bookingsQuery)).bookings) }
    catch (error) { setNotice(`Could not load bookings: ${error.message}`) }
    finally { setBookingsLoading(false) }
  }

  useEffect(() => { loadEvents() }, [])
  useEffect(() => { loadBookings() }, [currentUser?.userId])

  const register = async (e) => {
    e.preventDefault()
    try {
      await request(
        `mutation ($userInput: UserInput) { createUser(userInput: $userInput) { email } }`,
        { userInput: account },
      )
      setAccount({ email: '', password: '' })
      setNotice('Successfully registered. Please log in to continue.')
      setLoginForm({ email: account.email, password: '' })
    } catch (error) {
      setNotice(error.message)
    }
  }

  const login = async (e) => {
    e.preventDefault()
    try {
      const data = await request(
        `mutation ($userInput: UserInput) { login(userInput: $userInput) { userId email token tokenExpiration } }`,
        { userInput: loginForm },
      )
      sessionStorage.setItem(sessionKey, JSON.stringify(data.login))
      setCurrentUser(data.login)
      setLoginForm({ email: '', password: '' })
      setLoginOpen(false)
      setNotice(`Welcome back, ${data.login.email}.`)
    } catch (error) {
      setNotice(error.message)
    }
  }

  const logout = () => {
    sessionStorage.removeItem(sessionKey)
    setCurrentUser(null)
    setNotice('You have been logged out.')
  }

  const requireLogin = () => {
    if (currentUser) return true
    setNotice('Please log in to continue.')
    setLoginOpen(true)
    return false
  }

  const saveEvent = async (e) => {
    e.preventDefault()
    if (!requireLogin()) return
    const eventInput = { ...event, price: Number(event.price), date: new Date(event.date).toISOString() }
    try {
      if (editingId) {
        await request(
          `mutation ($eventId: ID!, $eventInput: EventInput) { updateEvent(eventId: $eventId, eventInput: $eventInput) { _id } }`,
          { eventId: editingId, eventInput },
        )
        setNotice('Event updated.')
      } else {
        await request(
          `mutation ($eventInput: EventInput) { createEvent(eventInput: $eventInput) { _id } }`,
          { eventInput },
        )
        setNotice('Event published.')
      }
      cancelEdit()
      loadEvents()
    } catch (error) {
      setNotice(error.message)
    }
  }

  const startEdit = (item) => {
    setEditingId(item._id)
    setEvent({ title: item.title, description: item.description, price: String(item.price), date: toLocalInput(item.date) })
    document.getElementById('host')?.scrollIntoView({ behavior: 'smooth' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEvent(emptyEvent)
  }

  const deleteEvent = async (item) => {
    if (!requireLogin()) return
    if (!window.confirm(`Delete “${item.title}”? Any bookings for it will be cancelled.`)) return
    try {
      await request(
        `mutation ($eventId: ID!) { deleteEvent(eventId: $eventId) { _id } }`,
        { eventId: item._id },
      )
      if (editingId === item._id) cancelEdit()
      setNotice('Event deleted.')
      loadEvents()
      loadBookings()
    } catch (error) {
      setNotice(error.message)
    }
  }

  const book = async (eventId) => {
    if (!requireLogin()) return
    try {
      await request(
        `mutation ($eventId: ID!) { bookEvent(eventId: $eventId) { _id } }`,
        { eventId },
      )
      setNotice('Your booking is confirmed.')
      setBookingsCount(count => count + 1)
      loadBookings()
    } catch (error) {
      setNotice(error.message)
    }
  }

  const cancelBooking = async (booking) => {
    if (!requireLogin()) return
    if (!window.confirm(`Cancel your booking for “${booking.event.title}”?`)) return
    try {
      await request(
        `mutation ($bookingId: ID!) { cancelBooking(bookingId: $bookingId) { _id } }`,
        { bookingId: booking._id },
      )
      setNotice('Booking cancelled.')
      setBookingsCount(count => Math.max(0, count - 1))
      loadBookings()
    } catch (error) {
      setNotice(error.message)
    }
  }

  return <main>
    <nav>
      <span className="brand">Gather</span>
      <a href="#events">Events</a>
      {currentUser && <a href="#bookings">My bookings</a>}
      <a href="#host">Host an event</a>
      {currentUser ? <><span className="nav-user">{currentUser.email}</span><button className="nav-auth" onClick={logout}>Log out</button></> : <button className="nav-auth" onClick={() => setLoginOpen(true)}>Log in</button>}
    </nav>

    <header>
      <p className="eyebrow">EVENTS, MADE SIMPLE</p>
      <h1>Find a reason<br />to get together.</h1>
      <p className="intro">Discover memorable local experiences, or create one of your own.</p>
      <a className="button light" href="#events">Browse events</a>
    </header>

    {notice && <div className="notice" role="status">{notice}<button aria-label="Close message" onClick={() => setNotice('')}>×</button></div>}

    {loginOpen && <div className="modal-backdrop" onClick={() => setLoginOpen(false)}>
      <form className="login-modal" onClick={e => e.stopPropagation()} onSubmit={login}>
        <button className="modal-close" type="button" aria-label="Close login" onClick={() => setLoginOpen(false)}>×</button>
        <p className="eyebrow">WELCOME BACK</p>
        <h2>Log in</h2>
        <input type="email" placeholder="Email address" value={loginForm.email} onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} required />
        <input type="password" placeholder="Password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} required />
        <button>Log in</button>
      </form>
    </div>}

    <section id="events">
      <div className="section-heading"><div><p className="eyebrow">WHAT’S HAPPENING</p><h2>Upcoming events</h2></div><div className="heading-actions"><span className="counter"><strong>{bookingsCount}</strong> {bookingsCount === 1 ? 'booking' : 'bookings'} made</span><button className="text-button" onClick={loadEvents}>Refresh</button></div></div>
      {loading ? <p>Loading events…</p> : events.length ? <div className="event-grid">{events.map(item => <article className="event-card" key={item._id}><div className="date"><strong>{new Date(item.date).toLocaleDateString(undefined, { month: 'short' })}</strong><span>{new Date(item.date).getDate()}</span></div><div><p className="event-time">{new Date(item.date).toLocaleString()}</p><h3>{item.title}</h3><p>{item.description}</p><small>Hosted by {item.creator._id === currentUser?.userId ? 'you' : item.creator.email}</small><div className="card-bottom"><b>${item.price.toFixed(2)}</b><span className="card-actions">{item.creator._id === currentUser?.userId && <><button className="text-button" onClick={() => startEdit(item)}>Edit</button><button className="danger" onClick={() => deleteEvent(item)}>Delete</button></>}<button onClick={() => book(item._id)}>Book now</button></span></div></div></article>)}</div> : <div className="empty"><h3>No events yet</h3><p>Be the first to host something worth remembering.</p></div>}
    </section>

    {currentUser && <section className="bookings" id="bookings">
      <div className="section-heading"><div><p className="eyebrow">YOUR SCHEDULE</p><h2>My bookings</h2></div><button className="text-button" onClick={() => loadBookings()}>Refresh</button></div>
      {bookingsLoading ? <p>Loading bookings…</p> : bookings.length ? <div className="booking-list">{bookings.map(booking => <article className="booking-row" key={booking._id}><div><strong>{booking.event.title}</strong><span>{new Date(booking.event.date).toLocaleString()}</span></div><div><span>Booked on</span><strong>{new Date(booking.createdAt).toLocaleString()}</strong></div><div className="row-action"><button className="danger" onClick={() => cancelBooking(booking)}>Cancel booking</button></div></article>)}</div> : <div className="empty"><h3>No bookings yet</h3><p>Book an event and it will show up here.</p></div>}
      <p className="booking-note">Only you can see your bookings.</p>
    </section>}

    <section className="host" id="host">
      <div><p className="eyebrow">MAKE IT HAPPEN</p><h2>Host your next great gathering.</h2><p>Create an account, then log in to publish events and accept bookings.</p></div>
      <div className="forms">
        <form onSubmit={register}><h3>Create an account</h3><input type="email" placeholder="Email address" value={account.email} onChange={e => setAccount({ ...account, email: e.target.value })} required /><input type="password" placeholder="Password (6+ characters)" minLength="6" value={account.password} onChange={e => setAccount({ ...account, password: e.target.value })} required /><button>Create account</button></form>
        <form onSubmit={saveEvent}><h3>{editingId ? 'Edit your event' : 'Publish an event'}</h3><input placeholder="Event title" value={event.title} onChange={e => setEvent({ ...event, title: e.target.value })} required /><textarea placeholder="Tell people what to expect" value={event.description} onChange={e => setEvent({ ...event, description: e.target.value })} required /><div className="split"><input type="number" min="0" step="0.01" placeholder="Price" value={event.price} onChange={e => setEvent({ ...event, price: e.target.value })} required /><input type="datetime-local" value={event.date} onChange={e => setEvent({ ...event, date: e.target.value })} required /></div><button>{editingId ? 'Save changes' : 'Publish event'}</button>{editingId && <button type="button" className="text-button" onClick={cancelEdit}>Cancel edit</button>}</form>
      </div>
    </section>
  </main>
}

export default App
