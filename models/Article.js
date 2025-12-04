// models/Article.js
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true, minlength: 5 },
  rating: { type: Number, min: 1, max: 5 },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const articleSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  shortDescription: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  featuredImage: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  tags: [{ type: String, trim: true }],
  readingTime: { type: Number, required: true, min: 1 }, 
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'published'
  },

  comments: [commentSchema],

  articleRating: { type: Number, default: 0, min: 0, max: 5 },
  articleRatingCount: { type: Number, default: 0 }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});



articleSchema.virtual('commentsCount').get(function () {
  return this.comments.length;
});

articleSchema.virtual('commentCount').get(function () {
  return this.comments.filter(c => c.status === 'approved').length;
});



// ──────────────────────────────
// Indexing for better Search 
// ──────────────────────────────
articleSchema.index({ status: 1, createdAt: -1 });
articleSchema.index({ category: 1 });
articleSchema.index({ tags: 1 });
articleSchema.index({ 'comments.status': 1 });

module.exports = mongoose.model('Article', articleSchema);