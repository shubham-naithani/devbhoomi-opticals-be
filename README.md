# Devbhoomi Opticals — Backend

Node.js/Express + MongoDB backend for Devbhoomi Opticals' store management system (Dehradun). Handles inventory, orders, payments, WhatsApp notifications, and reporting for both in-store (walk-in) and online sales.

## Tech Stack

- **Runtime:** Node.js, Express
- **Database:** MongoDB (Mongoose)
- **Auth:** JWT
- **Payments:** Razorpay (Checkout + UPI QR)
- **Notifications:** WhatsApp Cloud API (Meta)
- **Image storage:** Azure Blob Storage
- **Deployment:** Azure App Service (CI/CD via GitHub Actions)

## Getting Started

```bash
npm install
cp .env.example .env   # fill in your own values — see docs/TECHNICAL_SETUP.md
npm run seed:admin      # creates the first admin account
npm start
```

## Documentation

- **[Staff Guide](./docs/STAFF_GUIDE.md)** — day-to-day counter operations (walk-in orders, order management, refunds)
- **[Admin Guide](./docs/ADMIN_GUIDE.md)** — inventory, purchases, coupons, reporting, and store management
- **[Technical Setup](./docs/TECHNICAL_SETUP.md)** — Razorpay/WhatsApp configuration, environment variables, deployment notes

## Project Structure

```
config/       — DB connection
models/       — Mongoose schemas
controllers/  — business logic
routes/       — Express routers
middleware/   — auth guards
services/     — WhatsApp, Razorpay, Blob Storage integrations
utils/        — ID generators, pricing engine, coupon engine, audit/stock logging
jobs/         — scheduled tasks (low-stock check)
seed/         — one-time setup/backfill scripts
```

## Related Repo

Frontend: [devbhoomi-opticals-fe](../devbhoomi-opticals-fe) (Angular 18)