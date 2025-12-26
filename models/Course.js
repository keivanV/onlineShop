
const mongoose = require('mongoose');

/* ------------------------------------------------------------------ */
/* Sub-schemas                                                        */
/* ------------------------------------------------------------------ */

const videoSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String },
  duration:    { type: Number, required: true }, // in seconds
  time:        { type: String },
  videoUrl:    { type: String, required: true }
});

const chapterSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  duration:    { type: Number, required: true },
  description: { type: String },
  videos:      [videoSchema]
});

const commentSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:      { type: String, required: true },
  rating:    { type: Number, min: 1, max: 5, required: true },
  status:    { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

/* ------------------------------------------------------------------ */
/* Main Course Schema                                                 */
/* ------------------------------------------------------------------ */

const courseSchema = new mongoose.Schema({
  title:             { type: String, required: true, trim: true },
  description:       { type: String, required: true },
  coverImage:        { type: String, default: 'courses/default/cover.jpg' },

  category:          [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true }],
  teacher:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  status: {
    type: String,
    enum: ['pre-register', 'last-week', 'active', 'finished', 'sold-out', 'stopped'],
    default: 'pre-register',
    required: true
  },

  level:             { type: String, enum: ['مقدماتی', 'متوسط', 'پیشرفته'], required: true },
  duration:          { type: Number, required: true }, // total duration in seconds

  previewVideoUrl:   { type: String },
  presentationMethod: { type: String, enum: ['قابلیت دریافت', 'پخش آنلاین'], required: true },
  type:              { type: String, enum: ['free', 'vip', 'paid'], required: true },
  price:             { type: Number, default: 0 },
  discount:          { type: Number, default: 0, min: 0, max: 100 },
  discountEnd:       { type: Date },

  // Registration control
  registrationStart: { type: Date },
  registrationEnd:   { type: Date },
  courseStartDate:   { type: Date },
  courseEndDate:     { type: Date },

  // Capacity for limited online courses (0 = unlimited)
  capacity: {
    type: Number,
    default: 0,
    min: 0
  },

  chapters: [chapterSchema],
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [commentSchema],

  courseRating:      { type: Number, default: 0, min: 0, max: 5 },
  courseRatingCount: { type: Number, default: 0 }
}, { timestamps: true });



/* ------------------------------------------------------------------ */
/* Virtuals - Dynamic computed fields                                 */
/* ------------------------------------------------------------------ */

// Is discount currently active?
courseSchema.virtual('isDiscountActive').get(function () {
  return this.discount > 0 && this.discountEnd && new Date() <= this.discountEnd;
});

// Final price after discount
courseSchema.virtual('finalPrice').get(function () {
  if (this.type !== 'paid') return 0;
  if (!this.isDiscountActive) return this.price || 0;
  return Math.round(this.price * (1 - this.discount / 100));
});

// Is course capacity full?
courseSchema.virtual('isFull').get(function () {
  return this.capacity > 0 && this.students.length >= this.capacity;
});

// Remaining capacity (null = unlimited)
courseSchema.virtual('remainingCapacity').get(function () {
  if (this.capacity <= 0) return null;
  const remaining = this.capacity - this.students.length;
  return remaining > 0 ? remaining : 0;
});

// Is course capacity limited?
courseSchema.virtual('isLimitedCapacity').get(function () {
  return this.capacity > 0;
});

// Can user enroll right now?
courseSchema.virtual('canEnroll').get(function () {
  const now = new Date();


  if (this.status === 'stopped') return false;


  if (this.isFull) return false;


  if (this.registrationEnd && now > new Date(this.registrationEnd)) return false;


  return true;
});

// Human-readable Persian status with auto "last week" detection
courseSchema.virtual('displayStatus').get(function () {
  const now = new Date();

  // Priority 1: Manual status labels
  const manualLabels = {
    'pre-register': 'پیش‌ثبت‌نام',
    'last-week':    'هفته آخر ثبت‌نام',
    'active':       'در حال برگزاری',
    'finished':     'تمام شده',
    'sold-out':     'اتمام ظرفیت',
    'stopped':      'متوقف شده'
  };

  if (manualLabels[this.status]) {
    return manualLabels[this.status];
  }

  // Priority 2: Auto detect "last week of registration" for active courses
  if (this.status === 'active' && this.registrationEnd) {
    const daysLeft = Math.ceil((new Date(this.registrationEnd) - now) / (1000 * 60 * 60 * 24));
    if (daysLeft > 0 && daysLeft <= 7) {
      return 'هفته آخر ثبت‌نام';
    }
  }

  return 'در حال برگزاری';
});

/* ------------------------------------------------------------------ */
/* Pre-save: Auto update status when capacity is full                 */
/* ------------------------------------------------------------------ */
courseSchema.pre('save', function (next) {
  if (this.isFull && !['stopped', 'finished'].includes(this.status)) {
    this.status = 'sold-out';
  }

  if (this.status === 'sold-out' && !this.isFull) {
    this.status = 'active';
  }

  if (this.type === 'paid' && (!this.price || this.price <= 0)) {
    return next(new Error('دوره پولی باید قیمت معتبر داشته باشد'));
  }

  if (this.type !== 'paid') {
    this.price = 0;
    this.discount = 0;
    this.discountEnd = undefined;
  }

  if (this.discount > 0 && !this.discountEnd) {
    return next(new Error('تخفیف باید تاریخ انقضا داشته باشد'));
  }

  next();
});

/* ------------------------------------------------------------------ */
/* Settings                                                           */
/* ------------------------------------------------------------------ */

courseSchema.set('toJSON', { virtuals: true });
courseSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Course', courseSchema);