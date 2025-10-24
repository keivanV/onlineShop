const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  duration: { type: Number, required: true }, // in minutes
  time: { type: String } // e.g., '10:00'
});

const chapterSchema = new mongoose.Schema({
  title: { type: String, required: true },
  duration: { type: Number, required: true },
  description: { type: String },
  videos: [videoSchema]
});

const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  rating: { type: Number, min: 0, max: 5 },
  status: { type: String, enum: ['pending', 'approved'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const courseSchema = new mongoose.Schema({
  coverImage: { type: String, required: true },
  title: { type: String, required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['active', 'pending', 'pre-register'], required: true },
  level: { type: String, enum: ['beginner', 'intermediate', 'advanced'], required: true },
  duration: { type: Number, required: true }, // total in hours or minutes
  previewVideo: { type: String },
  presentationMethod: { type: String, enum: ['download', 'streaming'], required: true },
  downloadLink: { type: String },
  prerequisites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  type: { type: String, enum: ['free', 'vip', 'paid'], required: true },
  price: { type: Number },
  discount: { type: Number, default: 0 },
  chapters: [chapterSchema],
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  rating: { type: Number, default: 0 },
  expertise: { type: String },
  comments: [commentSchema]
}, { timestamps: true }); // Added timestamps option

// Validation for price based on type
courseSchema.pre('save', function(next) {
  if (this.type === 'paid' && !this.price) {
    return next(new Error('Price is required for paid courses'));
  }
  if (this.type !== 'paid' && this.price) {
    this.price = undefined;
  }
  next();
});

module.exports = mongoose.model('Course', courseSchema);