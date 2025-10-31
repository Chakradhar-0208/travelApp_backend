const cache = {};
const DEFAULT_TTL = 5 * 60 * 1000;

// Save data in cache with expiry time
export function setCache(key, data, ttl = DEFAULT_TTL) {
  cache[key] = {
    data,
    expires: Date.now() + ttl
  };
}

//  Retrieve data if valid, else return null
export function getCache(key) {
  const cached = cache[key];
  if (!cached) return null;

  if (Date.now() > cached.expires) {
    delete cache[key]; // expired, clean it up
    return null;
  }

  return cached.data;
}

//  Delete a specific cache entry
export function clearCache(key) {
  delete cache[key];
}

// Invalidate all cached trip-related data when any change occurs
export function invalidateAdminCache() {
  const keys = Object.keys(cache);
  let deleted = 0;

  for (const key of keys) {
      delete cache[key];
      deleted++;
    
  }

  if (deleted > 0) console.log(`Admin cache invalidated (${deleted} entries)`);
}

// auto cleans for every 10 mins
setInterval(() => {
  const now = Date.now();
  for (const key in cache) {
    if (cache[key].expires < now) delete cache[key];
  }
}, 10 * 60 * 1000);

export default {
  setCache,
  getCache,
  clearCache,
  invalidateAdminCache
};
