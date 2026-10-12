-- =====================================================================
-- Kaarx v1 schema — migration 0001. Copied verbatim into
-- apps/api/src/database/migrations/sql/0001_init.sql by the plan.
-- Conventions: uuid ids, integer paise for money, timestamptz, geography(…,4326)
-- =====================================================================

-- 0. Extensions -------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- 1. Helpers ----------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;

create sequence booking_code_seq start 20001;
create sequence driver_code_seq  start 1001;

-- 2. Enums ------------------------------------------------------------------
create type account_status          as enum ('active','blocked');
create type language_code           as enum ('en','te','hi');
create type gender_type             as enum ('male','female','other');
create type transmission_type       as enum ('manual','automatic');
create type driver_transmission     as enum ('manual','automatic','both');
create type vehicle_body_type       as enum ('hatchback','sedan','suv','muv','luxury');
create type fuel_type               as enum ('petrol','diesel','cng','electric','hybrid');
create type insurance_status_type   as enum ('insured','not_insured');
create type verification_status_type as enum ('pending','documents_submitted','under_review','approved','rejected','suspended');
create type document_type           as enum ('driving_licence','aadhaar','pan','police_verification','address_proof','medical_certificate','psychological_assessment','photo','bank_proof','background_check');
create type document_status         as enum ('pending','approved','rejected');
create type admin_role              as enum ('super_admin','ops_manager','verification_agent','support_agent','finance','read_only');
create type party_type              as enum ('customer','driver','admin');
create type device_platform         as enum ('android','ios','web');
create type booking_type            as enum ('instant','scheduled');
create type booking_status          as enum ('searching','assigned','driver_arrived','in_progress','completed','cancelled','no_driver_found');
create type offer_response          as enum ('pending','accepted','declined','expired');
create type cancelled_by_type       as enum ('customer','driver','admin','system');
create type payment_method_type     as enum ('cash','upi');
create type payment_status_type     as enum ('unpaid','paid','refunded');
create type photo_phase             as enum ('pre_trip','post_trip');
create type photo_side              as enum ('front','rear','left','right','dashboard','other');
create type sos_status              as enum ('open','handled');
create type issue_status            as enum ('open','resolved');
create type notification_channel    as enum ('push','sms','whatsapp');
create type legal_document_type     as enum ('terms','privacy','driver_agreement','dpdp_notice','code_of_conduct');

-- 3. Cities and zones -------------------------------------------------------
create table cities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  state       text not null,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table zones (
  id                    uuid primary key default gen_random_uuid(),
  city_id               uuid not null references cities(id),
  name                  text not null,
  area                  geography(Polygon,4326) not null,
  is_active             boolean not null default false,
  launch_date           date,
  destination_radius_km numeric(5,1) not null default 50,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (city_id, name)
);
create index zones_area_gix on zones using gist (area);

create table sos_contacts (
  id         uuid primary key default gen_random_uuid(),
  city_id    uuid not null references cities(id),
  name       text not null,
  phone      text not null,
  priority   integer not null default 1,
  created_at timestamptz not null default now()
);

-- 4. Admin users ------------------------------------------------------------
create table admin_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  password_hash text not null,
  full_name     text not null,
  phone         text,
  role          admin_role not null default 'read_only',
  status        account_status not null default 'active',
  totp_secret   text,
  last_login_at timestamptz,
  created_by    uuid references admin_users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index admin_users_email_uidx on admin_users (lower(email));

-- 5. Configuration ----------------------------------------------------------
create table pricing_rules (
  id                       uuid primary key default gen_random_uuid(),
  city_id                  uuid not null references cities(id),
  body_type                vehicle_body_type,
  base_fare_paise          integer not null,
  included_km              numeric(5,1) not null default 0,
  per_km_paise             integer not null,
  service_fee_paise        integer not null default 0,
  platform_commission_pct  numeric(5,2) not null,
  free_waiting_min         integer not null default 5,
  waiting_per_min_paise    integer not null default 0,
  min_fare_paise           integer not null default 0,
  cancellation_fee_paise   integer not null default 0,
  cancellation_grace_sec   integer not null default 120,
  night_start              time,
  night_end                time,
  night_pct                numeric(5,2) not null default 0,
  scheduled_premium_paise  integer not null default 0,
  effective_from           timestamptz not null default now(),
  effective_to             timestamptz,
  created_by               uuid references admin_users(id),
  created_at               timestamptz not null default now()
);
create index pricing_rules_lookup_idx on pricing_rules (city_id, body_type, effective_from desc);

create table dispatch_settings (
  city_id                      uuid primary key references cities(id),
  initial_radius_km            numeric(4,1) not null default 3,
  radius_steps_km              numeric(4,1)[] not null default '{3,5,8}',
  offer_timeout_sec            integer not null default 15,
  max_rounds                   integer not null default 3,
  max_simultaneous_offers      integer not null default 5,
  scheduled_assign_before_min  integer not null default 60,
  reminder_minutes             integer[] not null default '{60,15}',
  updated_at                   timestamptz not null default now()
);

create table app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table vehicle_catalog (
  id        uuid primary key default gen_random_uuid(),
  brand     text not null,
  model     text not null,
  body_type vehicle_body_type not null,
  is_active boolean not null default true,
  unique (brand, model)
);

create table legal_documents (
  id           uuid primary key default gen_random_uuid(),
  type         legal_document_type not null,
  version      text not null,
  language     language_code not null default 'en',
  title        text not null,
  body_url     text,
  body         text,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (type, version, language)
);

create table notification_templates (
  key        text not null,
  channel    notification_channel not null,
  language   language_code not null,
  title      text,
  body       text not null,
  updated_at timestamptz not null default now(),
  primary key (key, channel, language)
);

-- 6. Customers --------------------------------------------------------------
create table customers (
  id                 uuid primary key default gen_random_uuid(),
  phone              text not null unique,
  full_name          text,
  email              text,
  preferred_language language_code not null default 'en',
  age_confirmed_at   timestamptz,
  status             account_status not null default 'active',
  blocked_reason     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (phone ~ '^\+91[6-9][0-9]{9}$')
);

create table vehicles (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid not null references customers(id) on delete cascade,
  registration_number   text not null,
  brand                 text not null,
  model                 text not null,
  colour                text not null,
  body_type             vehicle_body_type not null,
  fuel                  fuel_type not null,
  transmission          transmission_type not null,
  insurance_status      insurance_status_type not null,
  insurance_valid_till  date,
  insurer_name          text,
  ownership_declared_at timestamptz not null default now(),
  rc_photo_url          text,
  puc_valid_till        date,
  notes                 text,
  is_default            boolean not null default false,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (customer_id, registration_number),
  check (registration_number = upper(registration_number)),
  check (insurance_status <> 'insured' or insurance_valid_till is not null)
);
create unique index vehicles_one_default_uidx on vehicles (customer_id) where is_default and is_active;

create table saved_locations (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  label        text not null,
  address      text not null,
  location     geography(Point,4326) not null,
  place_id     text,
  instructions text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index saved_locations_customer_idx on saved_locations (customer_id);

create table emergency_contacts (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  name        text not null,
  phone       text not null,
  relation    text,
  created_at  timestamptz not null default now()
);

-- 7. Drivers ----------------------------------------------------------------
create table drivers (
  id                         uuid primary key default gen_random_uuid(),
  code                       text not null unique default ('KD-' || lpad(nextval('driver_code_seq')::text, 4, '0')),
  phone                      text not null unique,
  full_name                  text not null,
  dob                        date not null,
  gender                     gender_type not null,
  email                      text,
  photo_url                  text,
  preferred_language         language_code not null default 'en',
  languages                  text[] not null default '{}',
  current_address            text not null,
  permanent_address          text,
  emergency_contact_name     text not null,
  emergency_contact_relation text,
  emergency_contact_phone    text not null,
  experience_years           numeric(4,1) not null,
  transmission               driver_transmission not null,
  body_types                 vehicle_body_type[] not null default '{}',
  ev_experience              boolean not null default false,
  night_driving              boolean,
  previous_platform          text,
  max_pickup_distance_km     numeric(4,1) not null default 5,
  verification_status        verification_status_type not null default 'pending',
  rejection_reason           text,
  activated_at               timestamptz,
  suspended_until            timestamptz,
  suspension_reason          text,
  training_completed_at      timestamptz,
  agreement_version          text,
  agreement_signed_at        timestamptz,
  code_of_conduct_signed_at  timestamptz,
  id_card_number             text,
  rating_avg                 numeric(3,2) not null default 0,
  rating_count               integer not null default 0,
  total_trips                integer not null default 0,
  status                     account_status not null default 'active',
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  check (phone ~ '^\+91[6-9][0-9]{9}$')
);
create index drivers_verification_idx on drivers (verification_status);

create table driver_documents (
  id               uuid primary key default gen_random_uuid(),
  driver_id        uuid not null references drivers(id) on delete cascade,
  type             document_type not null,
  number_masked    text,
  issue_date       date,
  expiry_date      date,
  file_urls        text[] not null default '{}',
  details          jsonb not null default '{}',
  status           document_status not null default 'pending',
  rejection_reason text,
  reviewed_by      uuid references admin_users(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index driver_documents_driver_idx on driver_documents (driver_id);
create index driver_documents_expiry_idx on driver_documents (expiry_date) where expiry_date is not null;

create table driver_zones (
  driver_id uuid not null references drivers(id) on delete cascade,
  zone_id   uuid not null references zones(id) on delete cascade,
  primary key (driver_id, zone_id)
);

-- 8. Shared: consents, devices, refresh tokens ------------------------------
create table consents (
  id                uuid primary key default gen_random_uuid(),
  subject_type      party_type not null,
  subject_id        uuid not null,
  legal_document_id uuid not null references legal_documents(id),
  accepted_at       timestamptz not null default now(),
  ip                inet,
  user_agent        text
);
create index consents_subject_idx on consents (subject_type, subject_id);

create table devices (
  id                            uuid primary key default gen_random_uuid(),
  subject_type                  party_type not null,
  subject_id                    uuid not null,
  platform                      device_platform not null,
  push_token                    text,
  device_model                  text,
  os_version                    text,
  app_version                   text,
  bg_location_granted           boolean,
  battery_optimisation_disabled boolean,
  last_seen_at                  timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  unique (subject_type, subject_id, push_token)
);
create index devices_subject_idx on devices (subject_type, subject_id);

create table refresh_tokens (
  id           uuid primary key default gen_random_uuid(),
  subject_type party_type not null,
  subject_id   uuid not null,
  token_hash   text not null unique,
  device_id    uuid references devices(id) on delete set null,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index refresh_tokens_subject_idx on refresh_tokens (subject_type, subject_id);

-- 9. Driver live data -------------------------------------------------------
create table driver_sessions (
  id              uuid primary key default gen_random_uuid(),
  driver_id       uuid not null references drivers(id),
  zone_id         uuid references zones(id),
  device_id       uuid references devices(id),
  went_online_at  timestamptz not null default now(),
  went_offline_at timestamptz
);
create index driver_sessions_driver_idx on driver_sessions (driver_id, went_online_at desc);
create unique index driver_sessions_one_open_uidx on driver_sessions (driver_id) where went_offline_at is null;

create table driver_locations (
  id          bigint generated always as identity primary key,
  driver_id   uuid not null references drivers(id),
  booking_id  uuid,
  recorded_at timestamptz not null,
  location    geography(Point,4326) not null,
  speed_mps   real,
  heading     real,
  accuracy_m  real,
  created_at  timestamptz not null default now()
);
create index driver_locations_driver_time_idx on driver_locations (driver_id, recorded_at desc);
create index driver_locations_recorded_brin on driver_locations using brin (recorded_at);

-- 10. Bookings and trips ----------------------------------------------------
create table bookings (
  id                     uuid primary key default gen_random_uuid(),
  code                   text not null unique default ('KX-' || nextval('booking_code_seq')::text),
  customer_id            uuid not null references customers(id),
  vehicle_id             uuid not null references vehicles(id),
  vehicle_snapshot       jsonb not null,
  city_id                uuid not null references cities(id),
  zone_id                uuid references zones(id),
  type                   booking_type not null default 'instant',
  status                 booking_status not null default 'searching',
  pickup_address         text not null,
  pickup_location        geography(Point,4326) not null,
  pickup_instructions    text,
  dropoff_address        text not null,
  dropoff_location       geography(Point,4326) not null,
  scheduled_at           timestamptz,
  notes                  text,
  pricing_rule_id        uuid not null references pricing_rules(id),
  estimated_distance_m   integer,
  estimated_duration_s   integer,
  estimated_fare_paise   integer not null,
  estimated_breakdown    jsonb not null default '{}',
  estimated_route        geography(LineString,4326),
  driver_id              uuid references drivers(id),
  assigned_at            timestamptz,
  arrived_at             timestamptz,
  otp_code               char(4) not null,
  otp_verified_at        timestamptz,
  started_at             timestamptz,
  ended_at               timestamptz,
  actual_distance_m      integer,
  actual_duration_s      integer,
  waiting_s              integer not null default 0,
  actual_route           geography(LineString,4326),
  final_fare_paise       integer,
  final_breakdown        jsonb,
  platform_fee_paise     integer,
  driver_earning_paise   integer,
  payment_method         payment_method_type not null default 'cash',
  payment_status         payment_status_type not null default 'unpaid',
  paid_at                timestamptz,
  cancelled_by           cancelled_by_type,
  cancel_reason          text,
  cancellation_fee_paise integer not null default 0,
  cancelled_at           timestamptz,
  dispatch_round         integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (type <> 'scheduled' or scheduled_at is not null),
  check (otp_code ~ '^[0-9]{4}$')
);
create index bookings_customer_idx  on bookings (customer_id, created_at desc);
create index bookings_driver_idx    on bookings (driver_id, created_at desc);
create index bookings_active_idx    on bookings (status, created_at)
  where status in ('searching','assigned','driver_arrived','in_progress');
create index bookings_scheduled_idx on bookings (scheduled_at)
  where type = 'scheduled' and status = 'searching';
create index bookings_pickup_gix    on bookings using gist (pickup_location);
create unique index bookings_customer_one_active_uidx on bookings (customer_id)
  where status in ('assigned','driver_arrived','in_progress')
     or (type = 'instant' and status = 'searching');
create unique index bookings_driver_one_live_uidx on bookings (driver_id)
  where status in ('driver_arrived','in_progress')
     or (type = 'instant' and status = 'assigned');

alter table driver_locations
  add constraint driver_locations_booking_fk foreign key (booking_id) references bookings(id);

create table booking_offers (
  id                   uuid primary key default gen_random_uuid(),
  booking_id           uuid not null references bookings(id) on delete cascade,
  driver_id            uuid not null references drivers(id),
  round                integer not null,
  distance_to_pickup_m integer,
  offered_at           timestamptz not null default now(),
  expires_at           timestamptz not null,
  responded_at         timestamptz,
  response             offer_response not null default 'pending',
  decline_reason       text,
  unique (booking_id, driver_id, round)
);
create index booking_offers_driver_idx on booking_offers (driver_id, offered_at desc);
create unique index booking_offers_one_accepted_uidx on booking_offers (booking_id) where response = 'accepted';

create table booking_events (
  id         bigint generated always as identity primary key,
  booking_id uuid not null references bookings(id) on delete cascade,
  event_type text not null,
  actor_type party_type,
  actor_id   uuid,
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index booking_events_booking_idx on booking_events (booking_id, created_at);

create table trip_photos (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  driver_id  uuid not null references drivers(id),
  phase      photo_phase not null,
  side       photo_side not null,
  url        text not null,
  taken_at   timestamptz not null default now(),
  location   geography(Point,4326),
  created_at timestamptz not null default now()
);
create index trip_photos_booking_idx on trip_photos (booking_id);

-- 11. Safety, support, notifications, audit --------------------------------
create table issue_reports (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid references bookings(id) on delete set null,
  reporter_type    party_type not null,
  reporter_id      uuid not null,
  category         text not null,
  description      text,
  status           issue_status not null default 'open',
  resolved_by      uuid references admin_users(id),
  resolved_at      timestamptz,
  resolution_notes text,
  created_at       timestamptz not null default now()
);
create index issue_reports_status_idx on issue_reports (status, created_at desc);

create table sos_events (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid references bookings(id) on delete set null,
  raised_by_type party_type not null,
  raised_by_id   uuid not null,
  location       geography(Point,4326),
  status         sos_status not null default 'open',
  handled_by     uuid references admin_users(id),
  handled_at     timestamptz,
  notes          text,
  created_at     timestamptz not null default now()
);
create index sos_events_open_idx on sos_events (created_at desc) where status = 'open';

create table notifications (
  id             uuid primary key default gen_random_uuid(),
  recipient_type party_type not null,
  recipient_id   uuid not null,
  type           text not null,
  title          text not null,
  body           text not null,
  data           jsonb not null default '{}',
  booking_id     uuid references bookings(id) on delete set null,
  sent_at        timestamptz not null default now(),
  read_at        timestamptz
);
create index notifications_recipient_idx on notifications (recipient_type, recipient_id, sent_at desc);

create table audit_logs (
  id          bigint generated always as identity primary key,
  admin_id    uuid references admin_users(id),
  action      text not null,
  entity_type text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  ip          inet,
  created_at  timestamptz not null default now()
);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id, created_at desc);
create trigger audit_logs_append_only
  before update or delete on audit_logs
  for each row execute function forbid_change();

-- 12. updated_at triggers on every table that has the column ----------------
do $$
declare t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'updated_at'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

-- 13. Row Level Security on everything (blocks Supabase's public REST API;
--     the API connects as the table owner and is not affected) -------------
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> 'spatial_ref_sys'
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- 14. Seed: Hyderabad -------------------------------------------------------
insert into cities (id, name, state, is_active)
values ('00000000-0000-0000-0000-000000000001', 'Hyderabad', 'Telangana', true);

insert into zones (city_id, name, area, is_active, launch_date)
values (
  '00000000-0000-0000-0000-000000000001',
  'Hyderabad core',
  ST_GeogFromText('SRID=4326;POLYGON((78.25 17.25, 78.70 17.25, 78.70 17.60, 78.25 17.60, 78.25 17.25))'),
  true,
  current_date
);

insert into dispatch_settings (city_id)
values ('00000000-0000-0000-0000-000000000001');

insert into pricing_rules
  (city_id, base_fare_paise, per_km_paise, service_fee_paise, platform_commission_pct,
   free_waiting_min, waiting_per_min_paise, min_fare_paise, cancellation_fee_paise)
values
  ('00000000-0000-0000-0000-000000000001', 15000, 1200, 3000, 17.00, 5, 200, 20000, 5000);

insert into app_settings (key, value) values
  ('min_app_version', '{"customer":"1.0.0","driver":"1.0.0"}'),
  ('features',        '{"scheduled":false,"upi":false,"signup":true}');

insert into sos_contacts (city_id, name, phone, priority)
values ('00000000-0000-0000-0000-000000000001', 'Founder on call', '+919999999999', 1);
