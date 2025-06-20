const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- CACHE HELPERS ---
async function setCache(key, value, expires_at) {
  const { data, error } = await supabase
    .from('cache')
    .upsert([
      { key, value, expires_at }
    ]);
  if (error) throw error;
  return data;
}

async function getCache(key) {
  const { data, error } = await supabase
    .from('cache')
    .select('value, expires_at')
    .eq('key', key)
    .single();
  if (error) throw error;
  return data;
}

// --- DISASTERS ---
async function createDisaster({ title, location_name, location, description, tags, owner_id, audit_trail }) {
  const { data, error } = await supabase
    .from('disasters')
    .insert([
      {
        title,
        location_name,
        location, // should be 'SRID=4326;POINT(lon lat)'
        description,
        tags,
        owner_id,
        audit_trail
      }
    ])
    .select();
  if (error) throw error;
  return data[0];
}

async function getDisasters(filter = {}) {
  const cacheKey = `supabase:getDisasters:${Buffer.from(JSON.stringify(filter)).toString('base64')}`;
  // Try cache first
  try {
    const cached = await getCache(cacheKey);
    if (cached && cached.value && cached.expires_at > new Date().toISOString()) {
      return cached.value;
    }
  } catch (e) { /* cache miss or error, continue */ }

  const { data, error } = await supabase
    .from('disasters')
    .select('*')
    .match(filter);
  if (error) throw error;
  // Cache the result for 1 hour
  const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await setCache(cacheKey, data, expires_at);
  return data;
}

// --- REPORTS ---
async function createReport({ disaster_id, user_id, content, image_url, verification_status }) {
  const { data, error } = await supabase
    .from('reports')
    .insert([
      { disaster_id, user_id, content, image_url, verification_status }
    ])
    .select();
  if (error) throw error;
  return data[0];
}

// --- RESOURCES ---
async function createResource({ disaster_id, name, location_name, location, type }) {
  const { data, error } = await supabase
    .from('resources')
    .insert([
      { disaster_id, name, location_name, location, type }
    ])
    .select();
  if (error) throw error;
  return data[0];
}

async function getResourcesNearby({ longitude, latitude, radius }) {
  const cacheKey = `supabase:getResourcesNearby:${longitude},${latitude},${radius}`;
  // Try cache first
  try {
    const cached = await getCache(cacheKey);
    if (cached && cached.value && cached.expires_at > new Date().toISOString()) {
      return cached.value;
    }
  } catch (e) { /* cache miss or error, continue */ }

  // location: geography(Point, 4326)
  // radius in meters
  const point = `SRID=4326;POINT(${longitude} ${latitude})`;
  const { data, error } = await supabase.rpc('st_dwithin', {
    table: 'resources',
    column: 'location',
    point,
    distance: radius
  });
  if (error) throw error;
  // Cache the result for 1 hour
  const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await setCache(cacheKey, data, expires_at);
  return data;
}

module.exports = {
  createDisaster,
  getDisasters,
  createReport,
  createResource,
  getResourcesNearby,
  setCache,
  getCache
}; 