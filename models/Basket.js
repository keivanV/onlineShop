// models/Basket.js
const mongoose = require('mongoose');

const basketSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

  courses: [{
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true }
  }],

  discountCode: { type: String, default: null },
  appliedDiscountAmount: { type: Number, default: 0 },

  subscriptionPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

basketSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Basket', basketSchema);