import jwt from "jsonwebtoken"

export default function validateToken(req, res, next) {
    try {

        const authHeader = req.header("Authorization")

        if (!authHeader) {
            return res.status(401).json({ message: "Invalid Token" })
        }

        const token = authHeader.split(" ")[1]

        if (!token) {
            return res.status(401).json({ message: "Invalid Token" })
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        req.user = decoded
        next()

    } catch (error) {
        return res.status(403).json({ message: "Invalid Token" })
    }
}