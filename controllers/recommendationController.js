import Trip from "../models/Trip.js";
import User from "../models/User.js";
import { getCache, setCache } from "../utils/recommendationCache.js";


function getDistance(lat1, lon1, lat2, lon2) { // Haversine formula for parsing coordinates into km
  const R = 6371; // Earth radius in kms
  const dLat = ((lat2 - lat1) * Math.PI) / 180; // Convert the lat/lng difference into radians
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); // Gets central agnle
  return R * c; // converts angle into kms
}


function generateScore(trip, user, userLat, userLng, budget, duration) { // Generates recommendation score for a trip 0-100
  let totalScore = 0;

  const breakdown = { // breakdown of score parameters
    altitudeSickness: 0,difficulty: 0,
    interests: 0,distance: 0,
    rating: 0,budget: 0,duration: 0,
  };
  const difficultyLevels = { // Used to compare difficulty levels
    easy: 1,moderate: 2,hard: 3,
  };

  // Altitude Sickness (25 Points)
  if (user.preferences?.altitudeSickness && trip.altitudeSickness) {
    breakdown.altitudeSickness = -25; // if user is sensitive and trip too, deduct points
  } else {
    breakdown.altitudeSickness = 25; // increase points if not the case
  }

  // Difficulty (10 Points)
  const userLevel = difficultyLevels[user.preferences.tripDifficulty]; // Gets difficulty levels 
  const tripLevel = difficultyLevels[trip.difficulty];

  if(userLevel && tripLevel){
    if (tripLevel <= userLevel) { // If trip is easier or at equal difficulty, give points dynamically
        breakdown.difficulty = 10 * (tripLevel / userLevel);  // 1/3 (0.33), 3/3 (1)
    } else {
        breakdown.difficulty = 0; // trip is harder than user preference, no points
    }
  }else{
    breakdown.difficulty = 5; // if no preference set, give neutral points
  }
  
  // Interests/keywords (15 Points)
  if (user.interests && user.interests.length > 0) { // If user has interests
    const keywords = trip.keywords || []; 
    const desc = trip.description?.toLowerCase() || "";
    let matches = 0;
    // Increments matches for each intrest found in keywords or desc of trip
    user.interests.forEach((interest) => {
      const term = interest.toLowerCase();
      if (keywords.map((k) => k.toLowerCase()).includes(term)) matches++;
      else if (desc.includes(term)) matches++;
    });

    breakdown.interests = Math.min((matches / user.interests.length) * 15, 15);  // Calculates interest score, ensures max 15 Points
  }

  // Distance (15 Points)
  if (userLat && userLng && trip.startPoint?.location?.coordinates) { 
    const tripLat = trip.startPoint.location.coordinates[1]; // takes trip cordinates
    const tripLng = trip.startPoint.location.coordinates[0]; // Only considers start point of a trip
    const distanceKm = getDistance(userLat, userLng, tripLat, tripLng);  // retruns distance in kms 
    breakdown.distance = Math.max(0, 15 - (distanceKm / 100) * 15); // Full points if within 100km, reduces accordingly beyond that
  }

  // Rating (15 Points)
  if (trip.rating) {
    breakdown.rating = Math.min((trip.rating / 5) * 15, 15); // Calculates rating score, (3.2/5)*15
  }

  // Budget (10 Points)
  if (budget && trip.estimatedCost?.car?.total != null) {
    const userBudget = parseFloat(budget);
    const tripCost = trip.estimatedCost.car.total;  // ignores bike cost for simplicity 

    if (tripCost <= userBudget) breakdown.budget = 10;
    else {
      const over = tripCost - userBudget;
      breakdown.budget = Math.max(0, 10 - (over / userBudget) * 10); // if trip budget exceeds user budget, reduces points accly.
    }
  }

  // Duration (10 Points)
  if (duration && trip.duration != null) {
    const userDuration = parseFloat(duration);
    const tripDuration = trip.duration;

    if (tripDuration <= userDuration) breakdown.duration = 10;
    else {
      const over = tripDuration - userDuration;
      breakdown.duration = Math.max(0, 10 - (over / userDuration) * 10); // if trip duration exceeds user duration, reduces points accly.
    }
  }

  // Total score
  totalScore = Object.values(breakdown).reduce((a, b) => a + b, 0); // reduces all values into one by summing

  totalScore = Math.max(0, Math.min(100, totalScore)); // Ensure 0-100 range of totalScore

  return { totalScore, breakdown }; // returns totalScore and breakdown 
}

export const getRecommendations = async (req, res) => {
  try {
    const userId = req.user?.userId; // takes userId from authenticated token
    const { lat, lng, budget, duration } = req.query; // takes parameters from query
    const userLat = parseFloat(lat); // parse lat & lng for safe validation
    const userLng = parseFloat(lng);

    const cacheKey = `cache_${userId}_${lng}_${lat}_${budget}_${duration}`;  // creates cache key
    // console.log("Cache Key:", cacheKey);
    const cached = getCache(cacheKey); // checks if cache exists
    if (cached) { 
        console.log("Cache Found, key:",cacheKey);
        return res.json({ recommendations: cached });
    }

    const user = await User.findById(userId).lean(); // Finds user
    if (!user) return res.status(404).json({ message: "User not found" });

    const trips = await Trip.find({ status: "active" }).lean(); //Only returns active trips

    const scoredTrips = trips.map((trip) => {
      // Generate score for a trip based on user preferences
      const { totalScore, breakdown } = generateScore(
        // takes totalScore and breakdown from generateScore func
        trip,
        user,
        userLat,
        userLng,
        budget,
        duration
      );
      return {
        ...trip, // returns trip data
        recommendationScore: totalScore, // along with match score
        scoreBreakdown: breakdown, // and a deailted breakdown of score
      };
    });

    // Sort descending by score
    scoredTrips.sort((a, b) => b.recommendationScore - a.recommendationScore);

    // const topTrips = scoredTrips.slice(0, 10);    // Limit to 10 results

    setCache(cacheKey, scoredTrips);   // Tries to set cache with scored trips
    console.log("Cache Set, key:",cacheKey);
    res.json({ recommendations: scoredTrips });
  } catch (error) {
    console.error(error); // returns error if any 
    res.status(500).json({ message: "Failed to fetch recommendations" });
  }
};
