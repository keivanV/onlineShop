const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const tempUserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  family: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  birthdate: { type: Date },
  city: { type: String },
  address: { type: String },
  profilePic: { type: String },
  otp: { type: String, required: true },
  otpExpires: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now, expires: '10m' } // Auto-delete after 10 minutes
});

module.exports = mongoose.model('TempUser', tempUserSchema);