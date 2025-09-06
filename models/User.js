import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  age: { type: Number },   // Improvised
  gender:{    // Improvised
    type:String,
    enum:["Male","Female","Prefer not to say", null],
    default:null
  },
  profileImage: { type: String, default:"" },
  interests: [{ type: String }],
  tripCount: { type: Number, default: 0 },
  totalDistance: { type: Number, default: 0 }, //kms
  totalJourneyTime: { type: Number, default: 0 }, //hrs
  travelType: {  // Improvised
    type: String,
    enum: [
      "adventure", "leisure", "business", "family",
      "romantic", "solo", "group",
    ],
  },
  // reportedUserId: { type: String },
  // reportReason: { type: String },
  // reportDescription: { type: String },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
    index:true,
  },
  preferences: {    // Improvised
    budgetRange: { type: String },
    altitudeSickness: { type: Boolean, default: false },  
  },
  status: {
    type: String,
    enum: ["active", "banned", "inactive"],
    default: "active",
    index:true,
  },
  longestTrip: {     // Improvised
    byDistance: { type: mongoose.Schema.Types.ObjectId, ref: "Trip" },
    byDuration: { type: mongoose.Schema.Types.ObjectId, ref: "Trip" },
  },
},{timestamps:true}
);

userSchema.index({tripCount:-1});

export default mongoose.model("User", userSchema);
