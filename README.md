# MoveMe

MoveMe is a backend-only, fixed-route ride coordination API. Drivers publish solo or pooled departures; passengers book actual published capacity, complete a simulated payment, and follow trip status. OpenAPI documentation is served alongside the API.

## Requirements

- Node.js 20 or newer
- PostgreSQL 14 or newer
- A database created for MoveMe

## Setup

1. Install packages with `npm install`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, a unique `JWT_SECRET`, `PORT`, and `CLIENT_ORIGIN`.
3. Generate the Prisma client with `npm run db:generate`.
4. Create and apply the initial migration with `npm run db:migrate -- --name init`.
5. To create demo accounts and sample route/vehicle records, set `DEMO_ACCOUNT_PASSWORD` in `.env` to a unique password of at least 10 characters, then run `npm run db:seed`.
6. Start the API with `npm run dev`. The health check is `http://localhost:5000/up`, API routes are under `http://localhost:5000/api/v1`, and the OpenAPI contract is at `http://localhost:5000/openapi.yaml` (replace `5000` with the configured port).

For production, apply committed migrations with `npm run db:deploy`; use a managed secret store, set `NODE_ENV=production` and an explicit `CLIENT_ORIGIN`, then run `npm start`. Do not use the demo seed in production.

## Demo accounts

The seed command creates these accounts. All use the local `DEMO_ACCOUNT_PASSWORD` value; the password is not stored in source control.

| Role          | Email                  |
| ------------- | ---------------------- |
| Passenger     | `passenger@moveme.com` |
| Driver        | `driver@moveme.com`    |
| Administrator | `admin@moveme.com`     |

The seeded driver is enabled and has a vehicle. The seed also configures Central Station to Airport (45 minutes, NGN 18,000 solo, NGN 6,500 per pooled seat). Publish a future departure from the driver account before searching as the passenger.

## API and permissions

The OpenAPI 3.1 contract is in [`openapi.yaml`](openapi.yaml). All business API routes are under `/api/v1`. Register or sign in at `/api/v1/auth/register` or `/api/v1/auth/login`, then pass the returned token as `Authorization: Bearer <token>`. Registration accepts only `PASSENGER` and `DRIVER`; an administrator must enable driver publishing. Only administrators can create or change routes, enable drivers, and update operational issue status. Drivers can manage their own vehicles/departures; passenger and driver responses are scoped to their own records.

Reservation creation requires an `Idempotency-Key` header. It holds one seat for five minutes and returns a pending payment. Call `POST /payments/{paymentId}/simulate` with `{ "outcome": "success" }` or `{ "outcome": "failure" }`. Success confirms once; failure or expiry releases the allocation. Reusing the same idempotency key for the same passenger/departure returns the original reservation.

Immediate discovery uses the next 15 minutes. Scheduled discovery returns later departures. The API reports no availability explicitly and only lists published departures; it does not promise an instant driver. Passenger seat allocation is serialized on the departure row in PostgreSQL. Adjacent driver/vehicle intervals may meet at their boundary; any actual overlap is rejected. Published route duration, fare, mode, and vehicle seat capacity are snapshots.

Errors are JSON with a `message`; validation errors also include `errors`. Typical status codes are 400 for invalid input, 401 for an invalid session, 403 for role/ownership restrictions, 404 for unavailable resources, 409 for invalid state or capacity conflict, and 500 for unexpected failures.

## Tests

Run unit and middleware tests with `npm test`. To run the real PostgreSQL final-seat race test, point `DATABASE_URL` at a disposable test database, apply migrations, then run `RUN_DB_INTEGRATION_TESTS=1 npm test`. The integration test creates and removes its own fixture data.

## Deployment

The project is ready to deploy as one Node.js service backed by PostgreSQL. Configure the environment values above, run `npm run db:deploy`, and expose the configured port. No shared test environment is configured by this repository; deployment requires a hosting account and database credentials.
