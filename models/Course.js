const mongoose = require('mongoose');

/* ------------------------------------------------------------------ */
/* Sub-schemas                                                        */
/* ------------------------------------------------------------------ */

const videoSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String },
  duration:    { type: Number, required: true }, // in minutes
  time:        { type: String },                 // e.g., '10:00'
  filePath:    { type: String, required: true }  // relative path: chapters/chapter_1/video_1.mp4
});

const chapterSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  duration:    { type: Number, required: true },
  description: { type: String },
  folderPath:  { type: String, required: true }, // e.g., chapters/chapter_1
  videos:      [videoSchema]
});

const commentSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:      { type: String, required: true },
  rating:    { type: Number, min: 0, max: 5 },
  status:    { type: String, enum: ['pending', 'approved'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

/* ------------------------------------------------------------------ */
/* Main Course Schema                                                 */
/* ------------------------------------------------------------------ */

const courseSchema = new mongoose.Schema(
  {
    courseFolder:      { type: String, required: true, unique: true }, // e.g., course_60f1a2b3c4d5e6f7g8h9i0j1
    coverImage:        { type: String, required: true }, // relative: course_xxx/cover.jpg
    title:             { type: String, required: true },
    category:          { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    teacher:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status:            { type: String, enum: ['active', 'pending', 'pre-register'], required: true },
    level:             { type: String, enum: ['beginner', 'intermediate', 'advanced'], required: true },
    duration:          { type: Number, required: true },
    previewVideo:      { type: String }, // relative path
    presentationMethod:{ type: String, enum: ['download', 'streaming'], required: true },
    downloadFolder:    { type: String }, // e.g., download/
    prerequisites:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
    type:              { type: String, enum: ['free', 'vip', 'paid'], required: true },
    price:             { type: Number },
    discount:          { type: Number, default: 0 },
    discountEnd:       { type: Date },
    chapters:          [chapterSchema],
    students:          [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    rating:            { type: Number, default: 0 },
    expertise:         { type: String },
    comments:          [commentSchema]
  },
  { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* Pre-save: Validate paths & cleanup for non-paid                    */
/* ------------------------------------------------------------------ */
courseSchema.pre('save', function (next) {
  if (this.type === 'paid' && (!this.price || this.price < 0)) {
    return next(new Error('Price is required for paid courses'));
  }

  if (this.type !== 'paid') {
    this.price = undefined;
    this.discount = 0;
    this.discountEnd = undefined;
  }

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