# ElateTrips — Backend API

REST API for the ElateTrips celebration trip planner. Built with **Node.js, Express, MongoDB (Mongoose)** and **TypeScript**, documented with **Swagger/OpenAPI**, and structured around **SOLID** principles.

## Stack

| Concern        | Choice                                  |
| -------------- | --------------------------------------- |
| Runtime        | Node.js + TypeScript                    |
| Web framework  | Express                                 |
| Database       | MongoDB via Mongoose                    |
| Validation     | Zod (request edge)                      |
| Auth           | Mock OTP → JWT (`jsonwebtoken`)         |
| API docs       | swagger-jsdoc + swagger-ui-express      |
| Security/infra | helmet, cors, compression, morgan       |

## Getting started

```bash
cd elatetrips-node
cp .env.example .env          # adjust MONGODB_URI / JWT_SECRET if needed
npm install
npm run seed                  # load reference data into MongoDB
npm run dev                   # start the API (http://localhost:4000)
```

- API base: `http://localhost:4000/api/v1`
- Swagger UI: `http://localhost:4000/docs`
- OpenAPI JSON: `http://localhost:4000/docs.json`

> Requires a running MongoDB (local `mongodb://127.0.0.1:27017` by default).

## Architecture (SOLID)

A layered, module-per-feature structure. Dependencies point **inward** toward
abstractions, never toward concrete frameworks.

```
src/
├── config/         env, database connection, swagger    (configuration)
├── common/         errors, http helpers, middleware, interfaces, logger
├── repositories/   generic MongoReadRepository (reusable data access)
├── modules/
│   ├── auth/       OTP store + JWT token service + login use cases
│   ├── users/      profile & billing
│   ├── orders/     bookings + atomic unique trip-id counter
│   ├── catalog/    destinations, hotels, packages, activities, products
│   └── pricing/    cab fare estimates (pure math + repo lookups)
├── routes/         mounts all module routers under /api/v1
├── container.ts    composition root (wires concretes to interfaces)
├── app.ts          Express assembly
└── server.ts       process entry (connect → listen → graceful shutdown)
```

Each module follows **routes → controller → service → repository → model**:

- **S**ingle Responsibility — controllers only do HTTP, services only business
  rules, repositories only persistence, the error handler only error mapping.
- **O**pen/Closed — `HotelRepository` extends the generic `MongoReadRepository`
  to add filtering without modifying it.
- **L**iskov — every repository honours its `IReadRepository`/`IWriteRepository`
  contract, so implementations are interchangeable.
- **I**nterface Segregation — read-only consumers depend on `IReadRepository`;
  only order/user code sees write methods. Auth splits into `ITokenService`
  and `IOtpStore`.
- **D**ependency Inversion — services receive their dependencies as interfaces
  via the constructor; `container.ts` is the single place that knows concrete
  classes (swap the OTP store or token service by changing one line).

## API surface

| Method | Path                               | Auth | Purpose                              |
| ------ | ---------------------------------- | ---- | ------------------------------------ |
| GET    | `/api/v1/health`                   | —    | Liveness                             |
| POST   | `/api/v1/auth/request-otp`         | —    | Issue OTP for a mobile number        |
| POST   | `/api/v1/auth/verify-otp`          | —    | Verify OTP (any 4 digits) → JWT      |
| GET    | `/api/v1/users/me`                 | JWT  | Get profile                          |
| PATCH  | `/api/v1/users/me`                 | JWT  | Update contact / billing             |
| POST   | `/api/v1/orders`                   | JWT  | Confirm a booking (unique trip id)   |
| GET    | `/api/v1/orders`                   | JWT  | List my trips (by mobile number)     |
| GET    | `/api/v1/orders/:tripId`           | JWT  | Get one of my trips                  |
| GET    | `/api/v1/catalog/destinations`     | —    | Destinations                         |
| GET    | `/api/v1/catalog/vehicles`         | —    | Cab vehicles                         |
| GET    | `/api/v1/catalog/rooms`            | —    | Room types                           |
| GET    | `/api/v1/catalog/hotels`           | —    | Hotels (filterable)                  |
| GET    | `/api/v1/catalog/hotels/:id`       | —    | One hotel                            |
| GET    | `/api/v1/catalog/hotel-options`    | —    | Grouped hotel filter options         |
| GET    | `/api/v1/catalog/celebrations`     | —    | Celebrations + offered package names |
| GET    | `/api/v1/catalog/packages`         | —    | Celebration packages                 |
| GET    | `/api/v1/catalog/activities`       | —    | Adventures & experiences             |
| GET    | `/api/v1/catalog/products`         | —    | Shop products (gifts / medical)      |
| GET    | `/api/v1/catalog/shops`            | —    | Shop catalogue metadata              |
| POST   | `/api/v1/pricing/local-estimate`   | —    | Local per-day cab fare × days        |
| POST   | `/api/v1/pricing/pickup-estimate`  | —    | Complete-trip round-trip fare        |

### Auth flow (mock)

1. `POST /auth/request-otp { phone }` — a 10-digit number issues an OTP
   (returned as `devOtp` in non-production).
2. `POST /auth/verify-otp { phone, otp }` — **any 4-digit code** is accepted and
   returns `{ token, user }`. Send the token as `Authorization: Bearer <token>`.

### Orders are tied to the mobile number

The owning phone is taken from the JWT, never the request body, so
`GET /orders` only ever returns trips booked under the signed-in number, and
`GET /orders/:tripId` rejects another account's trip with `403`. Trip ids
(`ELT-100001`, …) come from an atomic MongoDB counter — guaranteed unique even
under concurrent bookings.

## Responses

Success: `{ "success": true, "data": <payload>, "meta?": {...} }`
Error:   `{ "success": false, "error": { "message": "...", "details?": ... } }`

## Scripts

| Script            | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start with hot reload (ts-node-dev)  |
| `npm run build`   | Compile TypeScript to `dist/`        |
| `npm start`       | Run the compiled server              |
| `npm run seed`    | Load reference data into MongoDB     |
| `npm run typecheck` | Type-check without emitting        |
