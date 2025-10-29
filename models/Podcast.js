// models/Podcast.js
const mongoose = require('mongoose');

const podcastSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  duration: { type: Number, required: true }, // in minutes
  episode: { type: Number, required: true },
  tags: [{ type: String }],
  audioUrl: { type: String, required: true },
  coverImage: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['draft', 'published'], default: 'published' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Virtual for full URLs (optional)
podcastSchema.virtual('audioUrlFull').get(function () {
  return `${process.env.BASE_URL || 'http://localhost:5000'}${this.audioUrl}`;
});

podcastSchema.virtual('coverImageFull').get(function () {
  return `${process.env.BASE_URL || 'http://localhost:5000'}${this.coverImage}`;
});

podcastSchema.set('toJSON', { virtuals: true });
podcastSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Podcast', podcastSchema);