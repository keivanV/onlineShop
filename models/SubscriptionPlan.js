const mongoose = require('mongoose');
//----------------------------------
const subscriptionPlanSchema = new mongoose.Schema({
  duration: { type: String, enum: ['1month', '3month', '6month'], required: true, unique: true },
  price: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now }
});

// Update timestamp on save
subscriptionPlanSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);