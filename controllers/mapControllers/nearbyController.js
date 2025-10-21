import axios from "axios"
import getRouteDistance from "../../shared/routeDistance.js"

async function nearbyController(req, res) {

    const { lat, lng, type } = req.query;
    let radius = req.query.radius || 5;

    if (!lat || !lng || !type) {
        return res.status(400).json({ message: "All fields are required" });
    }

    radius = radius * 1000;

    try {
        const query = `
        [out:json];
        node["amenity"="${type}"](around:${radius},${lat},${lng});
        out;
        `;

        const response = await axios.post(
            "https://overpass-api.de/api/interpreter",
            query,
            { headers: { "Content-Type": "text/plain" }, timeout: 10000 }
        );

        const userLat = parseFloat(lat);
        const userLng = parseFloat(lng);

        const places = await Promise.all(
            response.data.elements.map(async (node) => ({
                id: String(node.id),
                name: node.tags?.name || "Unknown",
                type: node.tags?.amenity || "unknown",
                coordinates: [node.lat, node.lon],
                rating: null,
                priceRange: null,
                distance: getRouteDistance(userLat, userLng, node.lat, node.lon),
                openNow: null,
                contact: null
            }))
        );

        return res.json({ places });
    } catch (e) {
        console.error(e);
        if (!res.headersSent) {
            return res.status(500).json({ message: "Server Error" });
        }
    }
}

export default nearbyController