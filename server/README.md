# MealTrack Pro — Backend

Express + Prisma + PostgreSQL API for the MyMeal dashboard.

## Quickstart

```bash
# 1. Install deps
cd server
npm install

# 2. Make sure .env points at your local Postgres
#    The default is configured for the user's local DB.
#    Create the database first if it doesn't exist:
#    CREATE DATABASE "mealtrack-pro";

# 3. Generate Prisma client + run migration
npx prisma generate
npx prisma migrate dev --name init

# 4. Seed (creates camps, employees, devices, managers, app users,
#    role permissions and ~600 sample scans)
npm run seed

# 5. Start the API (defaults to http://localhost:5044)
npm run dev
```

## Demo accounts

All seeded with password `password123`:

| Username        | Role     | Notes                              |
|-----------------|----------|------------------------------------|
| `admin`         | admin    | Full access                        |
| `sara.op`       | operator | Can edit most data, no user mgmt   |
| `viewer`        | user     | Read-only                          |
| `khalid.ad01`   | manager  | Camp-scoped to AD-01               |
| `omar.dxb04`    | manager  | Camp-scoped to DXB-04              |

## API surface

```
POST   /api/auth/login                  → { token, user }
GET    /api/auth/me                     (requires Bearer token)

GET    /api/camps                       (scoped by manager's assignedCampCode)
POST   /api/camps                       admin|operator
PUT    /api/camps/:code                 admin|operator
DELETE /api/camps/:code                 admin

GET    /api/employees?q=&status=&campCode=
GET    /api/employees/:laborId
GET    /api/employees/:laborId/meals?from=YYYY-MM-DD&to=YYYY-MM-DD
POST   /api/employees                   admin|operator
PUT    /api/employees/:laborId          admin|operator
DELETE /api/employees/:laborId          admin

GET    /api/devices
POST   /api/devices                     admin|operator
PUT    /api/devices/:id                 admin|operator
DELETE /api/devices/:id                 admin

GET    /api/managers
POST   /api/managers                    admin|operator
PUT    /api/managers/:id                admin|operator
DELETE /api/managers/:id                admin

GET    /api/users                       admin
POST   /api/users                       admin
PUT    /api/users/:id                   admin
PATCH  /api/users/:id/status            admin
DELETE /api/users/:id                   admin
GET    /api/users/permissions/all       admin
PUT    /api/users/permissions/one       admin

GET    /api/scans?limit=
POST   /api/scans                       admin|operator|manager

GET    /api/overview                    aggregated KPIs/charts
GET    /api/audit                       admin|operator
```

Each request that isn't `/api/auth/login` requires `Authorization: Bearer <jwt>`.
The token is signed with `JWT_SECRET` from `.env` and expires after `JWT_EXPIRES_IN`.

## Camp scoping

When the authenticated user has `role: "manager"` and `assignedCampCode`, list
endpoints filter results to that camp automatically. `admin`, `operator`, and
`user` see all camps.
