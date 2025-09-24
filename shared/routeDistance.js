function getRouteDistance(userLat, userLng, placeLat, placeLng) {
    const R = 6371;

    const toRad = (deg) => deg * Math.PI / 180;

    const dLat = toRad(placeLat - userLat);
    const dLon = toRad(placeLng - userLng);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(userLat)) * Math.cos(toRad(placeLat)) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.asin(Math.sqrt(a));

    return (R * c * 1000).toFixed(2);
}

export default getRouteDistance;
