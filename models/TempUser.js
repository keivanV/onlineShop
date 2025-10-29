const mongoose = require('mongoose');

const tempUserSchema = new mongoose.Schema({
  name: { type: String },
  family: { type: String },
  phone: { type: String, required: true, unique: true },
  email: { type: String },
  otp: { type: String, required: true },
  otpExpires: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now, expires: '15m' }
});

module.exports = mongoose.model('TempUser', tempUserSchema);