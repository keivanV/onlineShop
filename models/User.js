const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  family: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  birthdate: { type: Date },
  city: { type: String },
  address: { type: String },
  profilePic: { type: String },
  role: { type: String, enum: ['student', 'teacher'], default: 'student' },
  otp: { type: String }, // Temporary for registration
  otpExpires: { type: Date },
  refreshToken: { type: String },
  status: { type: String, enum: ['active', 'ban'], default: 'active' },
  subscription: { type: String, enum: ['regular', 'vip'], default: 'regular' },
  subscriptionExpiresAt: { type: Date }, // For VIP subscription expiration
  coursesEnrolled: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  coursesTaught: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  rating: { type: Number, default: 0 },
  expertise: { type: String }, // For teachers
  nationalId: { type: String }, // For teachers
  bio: { type: String }, // For teachers
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Check if VIP subscription is active
userSchema.methods.isVipActive = function() {
  return this.subscription === 'vip' && this.subscriptionExpiresAt && new Date() < this.subscriptionExpiresAt;
};

// Compare password
userSchema.methods.comparePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);