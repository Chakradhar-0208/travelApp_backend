import express from "express";
import User from "../models/User.js";
import Trip from "../models/Trip.js";
import Review from "../models/Review.js";
import Report from "../models/Report.js";
import Journey from "../models/Journey.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.send("Test DB Route Active");
});

router.post("/createUser", async (req, res) => {
  // const {name, email, password,phone}=req.body;
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

router.delete("/deleteUser", async (req,res)=>{
    const {email}=req.body;

    try{
        const user = await User.findOne({email});
        if(!user){
            res.status(404).json({message:"User not Found"});
        }
        await User.deleteOne({email});
        res.status(200).json({messsage:"User Deleted Successfully"});
    }catch(err){
        res.status(400).json({error:err.message});
    }
})


router.post("/createTrip", async (req,res)=>{
  const trip = new Trip(req.body);
  try{
    await trip.save();
    res.status(201).json({message:"Trip created Successfuly.."})
  }catch(err){
    res.status(400).json({error:err.message});
  }
})

router.get("/getAllTrips",async (req,res)=>{

  try{
    const trips = await Trip.find()
    .populate("createdBy","name email role");
    res.status(200).json(trips);
  }catch(err){
    res.status(400).json({error:err.message});
  }

}) 

router.post("/createReview", async (req,res)=>{

  const review = new Review(req.body);
  try{
    await review.save();
    res.status(201).json({message:"Review created Successsfullyy..."});
  }catch(err){
    res.status(400).json({error:err.message}); 
  }

})

router.post("/createJourney", async (req,res)=>{
  const journey = new Journey(req.body);
  try{
    await journey.save();
    res.status(201).json({message:"Journey created Successfully........."});
  }catch(err){
    res.status(400).json({error:err.message});
  }
})

router.post("/createReport", async (req,res)=>{
  const report =  new Report(req.body);

  try{
    await report.save();
    res.status(201).json({message:"Report created Successfully.."});
  }catch(err){
    res.status(400).json({error:err.message})
  }

})

router.get("/getJourneys", async (req,res)=>{
  try{
    const journey = await Journey.find()
    .populate("tripId","name tripType duration ")
    .populate("userId","name email role");
    console.log(journey);
    res.status(200).json(journey);
  }catch(err){
    res.status(400).json({error:err.message});
  }
})










export default router;