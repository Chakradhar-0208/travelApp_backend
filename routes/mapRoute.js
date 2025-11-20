import express from "express";
import axios from "axios"
import http from "http";
import getRouteDistance from "../shared/routeDistance.js";

const router = express.Router();
router.get("/nearby", async (req, res) => {
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
});

router.get("/route", async (req, res) => {
    const httpAgent = new http.Agent({ family: 4 });
    const { startLat, startLng, endLat, endLng, vehicle } = req.query

    if (!startLat || !startLng || !endLat || !endLng || !vehicle) {
        return res.status(400).json({ message: "Bad Request" })
    }

    try {

        const url = `http://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=false`;

        const response = await axios.get(url, { httpAgent, timeout: 10000 });

        const distance = response.data.routes[0]?.legs[0]?.distance ?? null;

        const duration = response.data.routes[0]?.legs[0]?.duration ?? null;

        const result = {
            "route": {
                "distance": distance,
                "duration": duration,
                "coordinates": [[startLat, startLng], [endLat, endLng]],
                "instructions": "",
                "tollGates": [

                ]
            }
        }

        res.status(200).json({ result })

    } catch (e) {

        console.error(e)

        res.status(500).json({ message: "Server Error" })

    }
});

export default router;