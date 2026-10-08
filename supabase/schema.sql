-- Nuvé store database. Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- All access goes through the server (service role key). Row Level Security is switched on
-- with no public policies, so the browser can never read or write these tables directly.

create extension if not exists pgcrypto;

-- ---------- Orders ----------
create sequence if not exists order_number_seq start 1001;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint not null unique default nextval('order_number_seq'),
  access_token text not null default encode(gen_random_bytes(18), 'hex'),
  status text not null,
  -- pending_payment | awaiting_eft | eft_review | paid | sent_to_bobgo | shipped | delivered | expired | cancelled
  payment_method text not null check (payment_method in ('payfast','eft')),
  customer_first text not null,
  customer_last text not null,
  email text not null,
  phone text not null,
  address_street text not null,
  address_suburb text not null,
  address_city text not null,
  address_province text not null,
  address_postal text not null,
  address_company text,
  items jsonb not null,
  subtotal numeric(10,2) not null,
  shipping_cost numeric(10,2) not null default 0,
  shipping_method text,
  total numeric(10,2) not null,
  expires_at timestamptz,
  paid_at timestamptz,
  pf_payment_id text,
  pop_path text,
  pop_uploaded_at timestamptz,
  bobgo_order_id bigint,
  bobgo_error text,
  tracking_reference text,
  tracking_status text,
  tracking_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_email_idx on orders(lower(email));
create index if not exists orders_tracking_idx on orders(tracking_reference);

create table if not exists order_events (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  kind text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on order_events(order_id);

-- Webhook deliveries already handled (Bob Go may send the same one twice)
create table if not exists processed_webhooks (
  key text primary key,
  created_at timestamptz not null default now()
);

-- Failed admin logins, used to lock out password guessing
create table if not exists login_attempts (
  id bigserial primary key,
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists login_attempts_ip_idx on login_attempts(ip, created_at);

-- ---------- Page content ----------
create table if not exists settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stars int not null default 5 check (stars between 1 and 5),
  title text,
  body text not null,
  photo text,
  avatar text,
  verified boolean not null default false,
  featured boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  video text not null,
  caption text,
  avatar text,
  poster text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  image text not null,
  caption text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists logos (
  id uuid primary key default gen_random_uuid(),
  image text not null,
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  eyebrow text,
  heading text not null,
  body text,
  image text,
  side text not null default 'Image left',
  cta text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

alter table orders enable row level security;
alter table order_events enable row level security;
alter table processed_webhooks enable row level security;
alter table login_attempts enable row level security;
alter table settings enable row level security;
alter table reviews enable row level security;
alter table videos enable row level security;
alter table photos enable row level security;
alter table logos enable row level security;
alter table sections enable row level security;

-- ---------- File storage ----------
-- media: public images and videos shown on the store
-- proofs: private proof-of-payment uploads (only the admin sees them, through short-lived links)
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit)
values ('proofs', 'proofs', false, 10485760)
on conflict (id) do nothing;

-- ---------- Expire unpaid EFT orders every minute ----------
-- Needs the pg_cron extension: Database -> Extensions -> enable "pg_cron", then run this block.
-- The site also expires overdue orders whenever a page or the admin loads, so this is a backup.
-- create extension if not exists pg_cron;
-- select cron.schedule('expire-eft-orders', '* * * * *', $$
--   update orders set status = 'expired', updated_at = now()
--   where status = 'awaiting_eft' and expires_at < now();
-- $$);
