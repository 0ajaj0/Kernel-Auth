-- Optional: Supabase schema if you want persistent DB instead of Netlify Blobs
-- Run in Supabase SQL editor

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_id text not null,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz default now(),
  unique(provider, provider_id)
);

create table if not exists license_keys (
  key text primary key,
  subscription text not null default 'KERNEL Premium',
  level text default 'premium',
  products jsonb default '["all"]'::jsonb,
  max_activations int default 1,
  activations int default 0,
  bound_email text,
  expires_at timestamptz,
  revoked boolean default false,
  created_at timestamptz default now()
);

create table if not exists activations (
  id uuid primary key default gen_random_uuid(),
  license_key text references license_keys(key),
  user_id uuid references users(id),
  hwid text,
  activated_at timestamptz default now()
);
