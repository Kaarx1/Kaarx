# Kaarx

Kaarx books a professional driver to drive **your own car**. A customer asks for a driver, nearby verified
drivers get the offer, one accepts, arrives, photographs the car, starts the trip with the customer's 4-digit
code, drives, ends the trip and collects cash. v1 runs in Hyderabad only.

This repository holds the **API** (`apps/api`, NestJS 11 + Postgres/PostGIS + Redis) and the shared package
(`packages/shared`, zod schemas, fare maths, booking state machine) used by the API and the future apps.
Design: `docs/superpowers/specs/2026-10-08-kaarx-v1-design.md`.

## Prerequisites

- Node 22 (`nvm use` reads `.nvmrc`)
- pnpm 9.15 through corepack: `corepack enable`
- Docker Desktop (local Postgres + PostGIS and Redis)

## First-time setup

```bash
pnpm install
pnpm db:up                                   # postgres (postgis 16-3.5) + redis 7 in docker
cp apps/api/.env.example apps/api/.env       # local defaults; OTP_MODE=fixed
pnpm --filter @kaarx/shared build            # the API consumes the built package
pnpm db:migrate                              # nest build + typeorm migration:run: schema + Hyderabad seed
ADMIN_EMAIL=founder@kaarx.com ADMIN_PASSWORD='pick-a-long-password' ADMIN_NAME="Kaarx Founder" \
  pnpm --filter @kaarx/api seed:admin        # ADMIN_ROLE defaults to super_admin
pnpm --filter @kaarx/api dev                 # API on http://localhost:3000
```

`pnpm db:migrate` runs `pnpm --filter @kaarx/api migration:run`, which builds the API and applies migrations from
`dist/` (`typeorm migration:run -d dist/database/data-source.js`). Applied migrations are recorded in the
`typeorm_migrations` table. `pnpm db:down` stops the containers.

Check it is up:

```bash
curl localhost:3000/health
# {"status":"ok","db":"up","redis":"up"}
```

## Log in with OTP (local)

With `OTP_MODE=fixed` no SMS is sent and the code is always `123456`.

```bash
curl -i -X POST localhost:3000/auth/otp/request \
  -H 'content-type: application/json' \
  -d '{"phone":"98765 43210","app":"customer"}'
# HTTP/1.1 204 No Content

curl -s -X POST localhost:3000/auth/otp/verify \
  -H 'content-type: application/json' \
  -d '{"phone":"9876543210","app":"customer","code":"123456"}'
# {"accessToken":"…","refreshToken":"…","role":"customer","profile":{…,"profileComplete":false}}

TOKEN='<accessToken from above>'
curl -s localhost:3000/customer/me -H "Authorization: Bearer $TOKEN"
```

Drivers log in the same way with `"app":"driver"`, but only numbers an admin has registered can log in.
Admins log in with `POST /admin/auth/login` and `{"email","password"}`.

## Tests

Docker must be running (`pnpm db:up`). API tests are end-to-end against the `kaarx_test` database and Redis db 1.

```bash
pnpm --filter @kaarx/shared test             # Vitest unit tests
pnpm --filter @kaarx/api test                # Jest e2e, runs in band
pnpm --filter @kaarx/api test -- trip.e2e-spec.ts   # one file
pnpm typecheck
```

## Connecting to Supabase

Staging and production use Supabase Postgres (Mumbai) and Supabase Storage.

1. **Database.** In the Supabase dashboard open _Connect_ and copy the **Session pooler** connection string
   (port 5432). Put it in `apps/api/.env`:
   ```bash
   DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
   DATABASE_SSL=true
   ```
2. **Schema.** Normally run `pnpm db:migrate`.
   If the SQL in `0001_init.sql` was already run by hand in the Supabase SQL editor, tell TypeORM that
   migration 0001 is applied instead — run this in the SQL editor:
   ```sql
   create table if not exists typeorm_migrations (id serial primary key, "timestamp" bigint not null, name varchar not null);
   insert into typeorm_migrations ("timestamp", name) values (1760000000000, 'Init1760000000000');
   ```
   Then run `pnpm db:migrate` again: it must log `No migrations are pending`.
3. **Storage.** In _Storage_ create a **private** bucket named `kaarx-private`. In _Project Settings → Storage →
   S3 Connection_ copy the endpoint and region and create an S3 access key, then set:
   ```bash
   STORAGE_ENDPOINT=https://<project-ref>.supabase.co/storage/v1/s3
   STORAGE_REGION=ap-south-1
   STORAGE_BUCKET=kaarx-private
   STORAGE_ACCESS_KEY_ID=<access key id>
   STORAGE_SECRET_ACCESS_KEY=<secret access key>
   ```
   These keys give full access to the bucket. They live only in the API's environment — **never put them in the
   customer, driver or admin apps.** The apps upload and view photos through the short-lived presigned URLs the
   API hands out.
