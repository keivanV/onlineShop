const mongoose = require('mongoose');
//------------------------------------------
const articleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  shortDescription: { type: String, required: true },
  content: { type: String, required: true },
  featuredImage: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: false }, 
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  tags: [{ type: String }],
  readingTime: { type: Number, required: true }, // in minutes
  status: { type: String, enum: ['draft', 'published'], required: true }
}, { timestamps: true });

module.exports = mongoose.model('Article', articleSchema);
