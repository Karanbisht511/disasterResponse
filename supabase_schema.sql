-- Enable PostGIS for geospatial support
create extension if not exists postgis;

-- 1. disasters table
create table if not exists disasters (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location_name text,
  location geography(Point, 4326),
  description text,
  tags text[],
  owner_id uuid,
  created_at timestamptz default now(),
  audit_trail jsonb
);

-- 2. reports table
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  disaster_id uuid references disasters(id),
  user_id uuid,
  content text,
  image_url text,
  verification_status text,
  created_at timestamptz default now()
);

-- 3. resources table
create table if not exists resources (
  id uuid primary key default gen_random_uuid(),
  disaster_id uuid references disasters(id),
  name text,
  location_name text,
  location geography(Point, 4326),
  type text,
  created_at timestamptz default now()
);

-- 4. cache table
create table if not exists cache (
  key text primary key,
  value jsonb,
  expires_at timestamptz
);

-- Indexes for fast geospatial queries
create index if not exists disasters_location_idx on disasters using gist (location);
create index if not exists resources_location_idx on resources using gist (location);

-- GIN index for tags array
create index if not exists disasters_tags_idx on disasters using gin (tags);

-- Index for owner_id
create index if not exists disasters_owner_id_idx on disasters(owner_id); 