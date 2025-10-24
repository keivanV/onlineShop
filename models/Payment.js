const mongoose = require('mongoose');
//------------------------------------------
const paymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: false },
  subscriptionPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: false },
  amount: { type: Number, required: true }, // Amount in Tomans
  authority: { type: String, required: true }, // PayPing authority
  refId: { type: String }, // PayPing reference ID after successful payment
  discountCode: { type: String }, // Added to store discount code
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
//-------------------------------------------
paymentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});
//-------------------------------------------
module.exports = mongoose.model('Payment', paymentSchema);