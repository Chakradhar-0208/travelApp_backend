import axios from "axios"
import http from "http";

const httpAgent = new http.Agent({ family: 4 });

async function routeController(req, res) {

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

}

export default routeController