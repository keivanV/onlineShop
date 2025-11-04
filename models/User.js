// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  family: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, required:true },
  role: { 
    type: String, 
    enum: ['student', 'teacher', 'admin'], 
    default: 'student' 
  },
  otp: { type: String },
  otpExpires: { type: Date },
  refreshToken: { type: String },
  status: { type: String, enum: ['active', 'ban'], default: 'active' },
  subscription: { type: String, enum: ['regular', 'vip'], default: 'regular' },
  subscriptionExpiresAt: { type: Date },
  coursesEnrolled: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  coursesTaught: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  rating: { type: Number, default: 0 },
  expertise: { type: String },
  nationalId: { type: String },
  bio: { type: String },
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
  isProfileComplete: { type: Boolean, default: false }
});

module.exports = mongoose.model('User', userSchema);