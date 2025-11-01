// models/Course.js
const mongoose = require('mongoose');

/* ------------------------------------------------------------------ */
/* Sub-schemas                                                        */
/* ------------------------------------------------------------------ */

const videoSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String },
  duration:    { type: Number, required: true }, // seconds
  time:        { type: String },                 // e.g. "10:30"
  videoUrl:    { type: String, required: true }  // external URL (YouTube, Vimeo, CDN …)
});

const chapterSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  duration:    { type: Number, required: true }, // seconds (sum of videos)
  description: { type: String },
  videos:      [videoSchema]
});

const commentSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:      { type: String, required: true },
  rating:    { type: Number, min: 0, max: 5 },
  status:    { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

/* ------------------------------------------------------------------ */
/* Main Course Schema                                                 */
/* ------------------------------------------------------------------ */

const courseSchema = new mongoose.Schema(
  {
    description:       { type: String, required: true },
    // Unique folder name is no longer needed – we keep only coverImage
    coverImage:        { type: String, required: true }, // relative path: courses/course_xxx/cover.jpg
    title:             { type: String, required: true },
    category:          [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true }],
    teacher:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status:            { type: String, enum: ['active', 'pending', 'pre-register'], required: true },
    level:             { type: String, enum: ['beginner', 'intermediate', 'advanced'], required: true },
    duration:          { type: Number, required: true }, // total course duration (seconds)
    previewVideoUrl:   { type: String },                 // external preview link
    presentationMethod:{ type: String, enum: ['download', 'streaming'], required: true },
    type:              { type: String, enum: ['free', 'vip', 'paid'], required: true },
    price:             { type: Number },
    discount:          { type: Number, default: 0 },
    discountEnd:       { type: Date },
    chapters:          [chapterSchema],
    students:          [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments:          [commentSchema]
  },
  { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* Pre-save validation                                                */
/* ------------------------------------------------------------------ */
courseSchema.pre('save', function (next) {
  // Paid courses must have a positive price
  if (this.type === 'paid' && (!this.price || this.price < 0)) {
    return next(new Error('Price is required for paid courses'));
  }

  // Non-paid courses clear price / discount fields
  if (this.type !== 'paid') {
    this.price = undefined;
    this.discount = 0;
    this.discountEnd = undefined;
  }

  // Discount must have an end date when > 0
  if (this.discount > 0 && !this.discountEnd) {
    return next(new Error('discountEnd required when discount > 0'));
  }

  next();
});

/* ------------------------------------------------------------------ */
/* Virtuals                                                           */
/* ------------------------------------------------------------------ */
courseSchema.virtual('isDiscountActive').get(function () {
  return this.discountEnd ? new Date() <= this.discountEnd : false;
});

courseSchema.virtual('finalPrice').get(function () {
  if (this.type !== 'paid' || !this.isDiscountActive) return this.price || 0;
  return Math.round(this.price - (this.price * this.discount) / 100);
});

courseSchema.set('toJSON', { virtuals: true });
courseSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Course', courseSchema);