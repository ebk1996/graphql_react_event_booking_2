# Ride Platform Upgrade — MODIFY CURRENT CODE, DO NOT ROLLBACK

Upgrade the EXISTING working application in place. Preserve all existing event, booking, social, authentication, driver, ride, date-fix, and UI functionality. DO NOT restore any .bak, .before-*, or old version. DO NOT downgrade dependencies or images.

## RIDER
- Rider selects pickup and destination using a map.
- Allow address search/geocoding and map click selection.
- Browser geolocation may initialize pickup.
- Automatically calculate route, distance, duration and fare from pickup/destination.
- Rider must provide a Stripe payment method before "Request ride" is enabled.
- Create/confirm a Stripe PaymentIntent for the estimated fare.
- Do not create a ride unless Stripe confirms the payment method/payment intent.
- Store Stripe paymentIntentId on the ride.
- Rider sees ride status.
- Rider receives in-app notification when a driver accepts.
- Rider receives notification when driver is en route.
- Rider sees driver's current location on the map while the ride is active.
- Polling is acceptable if WebSockets are not already installed; prefer existing infrastructure.

## DRIVER
- Existing driver application remains.
- Existing PENDING/APPROVED status remains.
- Only APPROVED drivers may go online or receive rides.
- Driver can select/update current location on map.
- Driver dashboard displays incoming ride requests.
- Incoming rides contain pickup, destination, distance, duration and fare.
- Driver can ACCEPT or DENY.
- Accept must atomically claim the ride so two drivers cannot accept it.
- Driver gets matched based on nearest approved/online driver to pickup.
- Prefer ZIP-code area matching first, then geographic distance.
- Add a reasonable configurable radius/fallback so rides aren't sent to arbitrary distant drivers.
- Driver status flow: REQUESTED -> ACCEPTED -> DRIVER_ARRIVING -> DRIVER_ARRIVED -> IN_PROGRESS -> COMPLETED.
- Existing ride lifecycle must continue working.
- Driver location updates while en route/active.

## ADMIN
- Add an admin-only panel.
- Admin can see pending driver applications.
- Admin can APPROVE or DENY drivers.
- Admin can see approved/rejected drivers.
- Admin can see rides and payment state.
- Admin can capture a Stripe PaymentIntent.
- Capture must happen server-side using Stripe secret key.
- Never expose STRIPE_SECRET_KEY to React.
- Admin actions must require authenticated admin authorization.

## PAYMENTS
- Use the existing stripe dependency and environment variables.
- STRIPE_SECRET_KEY stays backend-only.
- STRIPE_WEBHOOK_SECRET remains backend-only.
- Add/extend Stripe PaymentIntent creation/confirmation flow.
- Use capture_method=manual if appropriate so admin/server can capture after the ride is completed.
- Do NOT mark payment CAPTURED merely by changing MongoDB.
- Payment status must reflect Stripe state.
- Prevent ride request when there is no valid Stripe payment method.
- Handle payment failure cleanly.

## GRAPHQL
Extend the existing schema/resolvers/models rather than replacing them.
Add whatever types/queries/mutations are required for:
- admin pending drivers
- approveDriver
- denyDriver
- admin rides
- captureRidePayment
- ride status
- driver incoming rides
- denyRide
- driver location
- rider/driver ride notifications
- Stripe payment intent creation/confirmation

## MAPS
Use an existing map provider if one is already configured.
If none exists, use Leaflet + OpenStreetMap/Nominatim for map display/geocoding and OSRM for routing, without requiring a paid map SDK.
Keep map API keys out of source code.

## SECURITY
- Preserve requireAuth.
- Add requireAdmin.
- Driver mutations must verify the authenticated driver owns the driver record.
- Riders may only see their own rides.
- Drivers may only see rides assigned/offered to them.
- Admin endpoints are admin-only.
- Never trust client-supplied fare, driver identity, payment status, or ride status.
- Server must calculate/validate route/fare values.

## FRONTEND
Keep the current App.jsx architecture unless splitting it is clearly safer.
Add:
- rider map ride request UI
- Stripe card/payment UI
- driver incoming ride UI
- driver map/location UI
- admin panel
- ride status/notification UI
- live driver marker for rider

## DEPLOYMENT
After implementation:
- npm install
- npm run build
- npm test
- build current backend image using the existing Dockerfile
- build current frontend image using Dockerfile.frontend
- update Kubernetes deployment forward from the CURRENT working deployment
- NEVER deploy old backup files
- NEVER use image 1.1 or any prior rollback image
- preserve namespace event-booking and current service names/ports.

## ACCEPTANCE TESTS
Verify:
1. Unapproved driver cannot go online.
2. Admin can approve driver.
3. Approved driver can go online.
4. Rider cannot request without Stripe payment method.
5. Rider can select pickup/destination on map.
6. Route/distance/duration/fare are calculated.
7. Ride is assigned only to approved/online nearby driver.
8. Driver can accept or deny.
9. Rider sees accepted/en-route status.
10. Rider sees driver's updated map position.
11. Admin can capture Stripe payment.
12. Existing event booking/date functionality still builds and tests.

Make actual code changes. Do not merely describe them.
