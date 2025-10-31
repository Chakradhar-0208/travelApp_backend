import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js"; // Adjust path
import dotenv from "dotenv";
import axios from "axios";

import { transporter } from "../config/transporter.js";


dotenv.config();

const router = express.Router();

// ------------------
// LOGIN
// POST /auth/login
// ------------------
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  console.log("Login request body:", req.body);

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    let isMatch = false;

    // Check if password is hashed
    if (user.password.startsWith("$2")) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      // Plain-text password
      isMatch = password === user.password;

      // If matched, hash it for future logins
      if (isMatch) {
        const hashed = await bcrypt.hash(password, 10);
        user.password = hashed;
        await user.save();
      }
    }

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // Generate JWT
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET missing in .env");
      return res.status(500).json({ message: "Server configuration error" });
    }

    const authToken = jwt.sign(
      { userId: user._id, email: user.email, role: user.role }, // added role for admin auth
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Return first five safe fields + JWT
    res.status(200).json({
      authToken,
      user: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        profileImage:user.profileImage,
        role:user.role
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});





// POST /auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone, profileImage } = req.body;
    console.log("Register request body:", req.body);


    // Validation
    if (!name || !email || !password || !profileImage) {
      return res.status(400).json({ message: "Required fields missing." });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists." });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      phone,
      profileImage,
    });

    await newUser.save();

    // Generate JWT
    const token = jwt.sign(
      { id: newUser._id, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Send token and user object (exclude password)
    const userToSend = {
      id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      profileImage: newUser.profileImage,
    };

    res.status(200).json({ token, user: userToSend });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error." });
  }
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.json({
        message:
          "If that email exists, a password reset link has been sent.",
      });
    }

    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    user.resetToken = resetToken;
    await user.save();

    const resetUrl = `http://localhost:5173/reset-password?token=${resetToken}`;

    await transporter.sendMail({
      from: `"TravelMate Support" <kingsinha40@gmail.com>`,
      to: user.email,
      subject: "Password Reset Request",
      html: `
        <h3>Hello,</h3>
        <p>You requested a password reset for your TravelMate account.</p>
        <p>Click the link below to reset your password:</p>
        <p><a href="${resetUrl}" target="_blank">${resetUrl}</a></p>
        <p>This link will expire in 15 minutes.</p>
      `,
    });

    res.json({
      message:
        "If that email exists, a password reset link has been sent.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /auth/reset-password
 */
router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;
  console.log(req.body);
  if (!token || !password) {
    return res.status(400).json({ message: "Token and new password required" });
  }
const decoded = jwt.verify(token, process.env.JWT_SECRET);
console.log("Decoded token:", decoded);

const user = await User.findById(decoded.id);
console.log("User from DB:", user);
console.log("User resetToken:", user?.resetToken);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || user.resetToken !== token) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.resetToken = null;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Invalid or expired token" });
  }
});


router.post("/google", async (req, res) => {
  try {
    const { googleToken, deviceInfo } = req.body;
    console.log(req.body);
    if (!googleToken) return res.status(400).json({ message: "Google token is required" });

    // Verify token directly via Google API
    const response = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${googleToken}`);
    const googleUser = response.data;

    if (!googleUser.email) return res.status(400).json({ message: "Invalid Google token" });

    // Check if user already exists
    let user = await User.findOne({ email: googleUser.email });

    if (!user) {
      // Register new user
      
      user = new User({
       name: googleUser.name || "Unknown User",
        email: googleUser.email,
        googleId: googleUser.sub,
        profileImage: "avatar2",         // fixed value
        phone: "88888888",               // fixed value
        password: "#rnxhbeujinmfnvjekrnswrkjwnt",
      });
      await user.save();
      console.log(user)
    } else {
      // Update Google ID if needed
      user.googleId = googleUser.sub;
      await user.save();
    }

    

    // Inline JWT generation (optional)
    const token = jwt.sign(
      { id: user._id, email: user.email},
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ user, token}); // Return both user and token in the response
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
