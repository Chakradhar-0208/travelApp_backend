import express from 'express';
import User from '../models/User.js';
import Trip from '../models/Trip.js';
import Report from '../models/Report.js';
import authenticateToken from '../middlewares/auth.js';
import requireRole from '../middlewares/requireRole.js';
import {getCache,setCache,invalidateAdminCache} from '../utils/caching/adminCaching.js';
import mongoose from 'mongoose';
const router = express.Router();



router.get("/",async(req,res)=>{
    res.json({message:"Admin Route Active"});
});

/// User moderation

router.get("/users",authenticateToken,requireRole("admin"),async(req,res)=>{
    try{
        const cacheKey = "admin_users_list"; //cache name
        const cachedData = getCache(cacheKey);
        if(cachedData){
            console.log("Cache found: ",cacheKey);
            return res.json({users:cachedData,source:"cache"});
        }
        const users = await User.find({},{name:1,email:1,role:1,profileImage:1,tripCount:1,travelType:1,interests:1,status:1})
        .sort({role:1,createdAt:-1}).lean(); //only returns specific fields for performance imp
        setCache(cacheKey,users);
        console.log("Cache Set: ",cacheKey);
        res.json({users:users,source:"db"});
    }catch(err){
        res.status(500).json({error:err.message});
    }
});


router.get("/users/:id",authenticateToken,requireRole("admin"),async(req,res)=>{
    const {id} = req.params;
    try{
        if (!mongoose.Types.ObjectId.isValid(id)) { //userId Validation
            return res.status(400).json({ error: "Invalid User ID format" });
        }

        const cacheKey = `admin_user:${id}`;  // cache fetcching
        const cachedData = getCache(cacheKey);
        if(cachedData){
            console.log("Cache found: ",cacheKey);
            return res.status(200).json({user:cachedData,source:"cache"});
        }

        const user = await User.findById(id).lean();
        if(!user){
            return res.status(404).json({error:"User not found"});
        }

        setCache(cacheKey,user); //cache setting
        console.log("Cache set: ",cacheKey);
        
        return res.status(200).json({user});
    }catch(err){
        return res.status(500).json({error:err.message});
    }
});


router.put("/users/:id",authenticateToken,requireRole("admin"),async(req,res)=>{
    const {id} = req.params;
    try{
        if (!mongoose.Types.ObjectId.isValid(id)) { //userId Validation
            return res.status(400).json({ error: "Invalid User ID format" });
        }

        const allowedFields =["status","role","email", " name", "profileImage", "tripCount","travelType","totalDistance","totalJourneyTime","preferences","gender","interests"];

        const user = await User.findById(id);
        if(!user){
            return res.status(404).json({error:"User not found"});
        }

        for (const key of allowedFields) if (req.body[key]) user[key] = req.body[key];

        await user.save();

        invalidateAdminCache();
        
        return res.status(200).json({user});
    }catch(err){
        return res.status(500).json({error:err.message});
    }
});


router.delete("/users/:id",authenticateToken,requireRole("admin"),async(req,res)=>{
    const {id} = req.params;
    try{
        if (!mongoose.Types.ObjectId.isValid(id)) { //userId Validation
            return res.status(400).json({ error: "Invalid User ID format" });
        }

        const user = await User.findById(id).lean();
        if (!user) return res.status(404).json({ message: "User not found" });

        await User.deleteOne({ _id:id });
        invalidateAdminCache();
        console.log("User cache invalidated due to deletion.");

        res.status(200).json({ message: "User deleted successfully" });
    }catch(err){
        return res.status(500).json({error:err.message});
    }

})

// Trip routes

router.get("/trips",authenticateToken,requireRole("admin"),async(req,res)=>{  // all approved trips (active status)
    try{
        const cacheKey = "admin_trips_list";
        const cachedData = getCache(cacheKey);
        if(cachedData){
            console.log("Cache found: ",cacheKey);
            return res.status(200).json({trips:cachedData,source:"cache"});
        }

        const trips = await Trip.find({status:"active"},{title:1,description:1,estimatedCost:1,distance:1,duration:1,rating:1,reviewCount:1,difficulty:1,imageURLs:1,altitudeSickness:1,createdBy:1}).populate("createdBy","name email").lean();

        setCache(cacheKey,trips);
        console.log("Cache set: ",cacheKey);

        return res.status(200).json({ trips, source: "db" });
    }catch(err){
        return res.status(500).json({error:err.message});
    }
});


router.get("/trips/inactive",authenticateToken,requireRole("admin"),async(req,res)=>{  // all inactive/new trips
    try{
        const cacheKey = "admin_inactive_trips_list";
        const cachedData = getCache(cacheKey);
        if(cachedData){
            console.log("Cache found: ",cacheKey);
            return res.status(200).json({trips:cachedData,source:"cache"});
        }

        const trips = await Trip.find({status:"inactive"},{title:1,description:1,estimatedCost:1,distance:1,duration:1,rating:1,reviewCount:1,difficulty:1,imageURLs:1,altitudeSickness:1,createdBy:1}).populate("createdBy","name email").lean();                   

        setCache(cacheKey,trips);
        console.log("Cache set: ",cacheKey);

        return res.status(200).json({trips, source: "db"});
    }catch(err){
        return res.status(500).json({error:err.message});
    }
});


router.get("/trips/:id",authenticateToken,requireRole("admin"),async(req,res)=>{
    const {id} = req.params;
    try{
        if (!mongoose.Types.ObjectId.isValid(id)) { //tripId Validation
            return res.status(400).json({ error: "Invalid Trip ID format" });
        }

        const cacheKey = `admin_trip:${id}`;
        const cachedData = getCache(cacheKey);
        if(cachedData){
            console.log("Cache found: ",cacheKey);
            return res.status(200).json({trip:cachedData,source:"cache"});
        }

        const trip = await Trip.findById(id).populate("createdBy","name email").lean();
        if(!trip){
            return res.status(404).json({error:"Trip not found"});
        }

        setCache(cacheKey,trip);
        console.log("Cache set: ",cacheKey);

        return res.status(200).json({trip});
    }catch(err){
        return res.status(500).json({error:err.message});
    }
});


router.put("/trips/:id",authenticateToken,requireRole("admin"),async(req,res)=>{
    const {id} = req.params;
    try{
        if (!mongoose.Types.ObjectId.isValid(id)) { //tripId Validation
            return res.status(400).json({ error: "Invalid Trip ID format" });
        }
        const allowedFields =["title","description","startPoint","endPoint",,"estimatedCost","distance","duration","difficulty","altitudeSickness","imageURLs","roadInfo","informativePlaces","journeyKit","precautions","checkPoints","tollGates","keywords"];

        const trip = await Trip.findById(id);
        if(!trip){
            return res.status(404).json({error:"Trip not found"});
        }

        for (const key of allowedFields) if (req.body[key]) trip[key] = req.body[key];

        await trip.save();

        invalidateAdminCache();

        return res.status(200).json({trip});
    }catch(err){
            return res.status(500).json({error:err.message});
        }
});


router.put("/trips/:id/status",authenticateToken,requireRole("admin"),async(req,res)=>{ // update trip status
    const {id} = req.params;
    const {status} = req.body;
    try{
        if (!mongoose.Types.ObjectId.isValid(id)) { //tripId Validation
            return res.status(400).json({ error: "Invalid Trip ID format" });
        }

        if(!["active","inactive","deleted"].includes(status)){
            return res.status(400).json({error:"Invalid status value"});
        }

        const trip = await Trip.findById(id);
        if(!trip){
            return res.status(404).json({error:"Trip not found"});
        }

        trip.status = status;
        await trip.save();

        invalidateAdminCache();
        return res.status(200).json({ trip, message: `Trip status updated to ${status}` });

    }catch(err){
        return res.status(500).json({error:err.message});
    }
});


router.delete("/trips/:id",authenticateToken,requireRole("admin"),async(req,res)=>{ // delete trip
    const {id} = req.params;
    try{
        if (!mongoose.Types.ObjectId.isValid(id)) { //tripId Validation
            return res.status(400).json({ error: "Invalid Trip ID format" });
        }

        const trip = await Trip.findById(id).lean();
        if (!trip) return res.status(404).json({ message: "Trip not found" });

       if (trip.imageURLs && trip.imageURLs.length > 0) {
            setImmediate(async () => {
                try {
                    await cloudinary.api.delete_resources_by_prefix(`trips/${trip._id}`);
                    console.log(`Images for trip ${trip._id} deleted successfully`);
                } catch (e) {
                    console.error("Background deletion failed:", e.message);
                }
            });
        }       

        const deleteResult = await trip.deleteOne({ _id: id });
        if (!deleteResult.deletedCount) {
            return res.status(500).json({ error: "Failed to delete the trip from the database" });
        }
        invalidateAdminCache();
        console.log("Trip cache invalidated due to deletion.");

        res.status(200).json({ message: "Trip deleted successfully" });
    }catch(err){
        return res.status(500).json({error:err.message});
    } 
});


// Report routes

router.get("/reports",authenticateToken,requireRole("admin"),async(req,res)=>{    
    try{
        const cacheKey = "admin_reports_list";
        const cachedData = getCache(cacheKey);
        if(cachedData){
            console.log("Cache found: ",cacheKey);
            return res.status(200).json({reports:cachedData,source:"cache"});
        }
        const reports = await Report.find().populate("reportedUser","name email").populate("reportedBy","name email").lean();
        setCache(cacheKey,reports);
        console.log("Cache set: ",cacheKey);
        return res.status(200).json({reports});
    }catch(err){
        return res.status(500).json({error:err.message});
    }
}); 



export default router; 