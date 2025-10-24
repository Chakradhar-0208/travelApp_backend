// Simple in-memory cache
const cache = {};
const DEFAULT_TTL = 300000; // 5 minutes

export function setCache(key, data, ttl = DEFAULT_TTL) {
  cache[key] = { data, expires: Date.now() + ttl };  // sets data  with expiry time into a object
}

export function getCache(key) {
  const cached = cache[key];
  if (!cached) return null;
  if (Date.now() > cached.expires) { // if cached ttl has expired, deletes the chache entry
    delete cache[key];
    return null;
  } 
  return cached.data; // return cached data if found 
}
