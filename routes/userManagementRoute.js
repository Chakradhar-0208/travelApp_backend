import express from "express";
import User from "../models/User.js";
import upload from "../middlewares/multer.js";
import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

const router = express.Router();

router.get("/", (req, res) => {
  res.send("User Management Route Active");
});

router.post("/createUser", async (req, res) => {
  const user = new User(req.body);

  if (!user.name || !user.email || !user.password) {
    res.status(400).json({ message: "Fill all the required fields." });
  }
  try {
    await user.save();
    res.status(201).json({ message: "User created successfully", user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/updateUser/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = ["name", "phone", "email", "age", "gender"];
    const updates = {};

    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res
        .status(400)
        .json({ message: "No valid fields provided for update." });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({ message: "User updated successfully", user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/getUser", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({ message: "User not Found." });
    }

    res.status(200).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/deleteUser", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not Found" });
    }
    await User.deleteOne({ email });
    res.status(200).json({ messsage: "User Deleted Successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/getProfileImage", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || !user.profileImage) {
      return res.status(404).json({ message: "Unable to fetch Profile Image" });
    }
    const ImageURL = cloudinary.url(user.profileImage, { // Returns a optimized url 
      width: 150,
      height: 150,
      crop: "fill",
      quality: "auto",
      fetch_format: "auto",
    });

    res.status(200).json({ profileImage: ImageURL });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/updateProfileImage", upload.single("profileImage"), async (req, res) => {
    const { email } = req.body;

    try {
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({ message: "User not Found!!" });
      }

      const name = user.name.split(" ");
      const lastName = name[name.length - 1];
      const publicId = `${lastName}-${user._id}`;

      const result = await cloudinary.uploader.upload_stream(  // Uploads steam into cloud
        {
          public_id: publicId,
          overwrite: true,
          folder: "profileImage",
        },
        async (error, uploadedResult) => {
          if (error) {
            return res.status(500).json({ error: error.message });
          }

          user.profileImage = uploadedResult.public_id;
          await user.save();

          res.json({
            message: "Profile Picture Updated Successfully",
            profileImage: user.profileImage,
          });
        }
      );
      const streamifier = await import("streamifier");
      streamifier.createReadStream(req.file.buffer).pipe(result);  // Converts memory buffer into node readable stream and pipes it to result.
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.get("/profile", (req, res) => {
  res.json({ status: "working" });
});

export default router;
