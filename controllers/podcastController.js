// controllers/podcastController.js
const Podcast = require('../models/Podcast');
const Notification = require('../models/Notification');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

const createPodcast = async (req, res) => {
  try {
    const { title, description, duration, episode, tags } = req.body;
    const audioFile = req.files?.audio?.[0];
    const coverFile = req.files?.coverImage?.[0];

    if (!title || !duration || !episode || !audioFile || !coverFile) {
      return res.status(400).json({
        message: 'Missing required fields: title, duration, episode, audio file, cover image'
      });
    }

    if (!audioFile.mimetype.startsWith('audio/')) {
      return res.status(400).json({ message: 'Audio file must be an audio type' });
    }
    if (!coverFile.mimetype.startsWith('image/')) {
      return res.status(400).json({ message: 'Cover image must be an image type' });
    }

    const audioUrl = `/uploads/podcasts/audio/${audioFile.filename}`;
    const coverImage = `/uploads/podcasts/cover/${coverFile.filename}`;

    const parsedTags = tags
      ? tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    const podcast = new Podcast({
      title: title.trim(),
      description: description?.trim(),
      duration: parseInt(duration, 10),
      episode: parseInt(episode, 10),
      tags: parsedTags,
      audioUrl,
      coverImage,
      author: req.user.id,
      status: 'published'
    });

    await podcast.save();

    const users = await User.find({ role: { $in: ['student', 'teacher'] } }).select('_id');
    if (users.length > 0) {
      const notifications = users.map(user => ({
        user: user._id,
        title: 'New Podcast!',
        message: `New podcast "${title}" is now available.`,
        type: 'podcast',
        relatedId: podcast._id
      }));
      await Notification.insertMany(notifications);
    }

    res.status(201).json({
      _id: podcast._id,
      title: podcast.title,
      description: podcast.description,
      duration: podcast.duration,
      episode: podcast.episode,
      tags: podcast.tags,
      audioUrl: `${BASE_URL}${audioUrl}`,
      coverImage: `${BASE_URL}${coverImage}`,
      author: req.user.id,
      status: podcast.status,
      createdAt: podcast.createdAt,
      updatedAt: podcast.updatedAt
    });
  } catch (error) {
    console.error('Create podcast error:', error);
    res.status(500).json({ message: 'Error creating podcast', error: error.message });
  }
};

const getPodcasts = async (req, res) => {
  try {
    const podcasts = await Podcast.find()
      .populate('author', 'name family phone')
      .sort({ episode: -1 });

    const formatted = podcasts.map(p => ({
      _id: p._id,
      title: p.title,
      description: p.description,
      duration: p.duration,
      episode: p.episode,
      tags: p.tags,
      audioUrl: `${BASE_URL}${p.audioUrl}`,
      coverImage: `${BASE_URL}${p.coverImage}`,
      author: p.author
        ? {
            _id: p.author._id,
            name: p.author.name,
            family: p.author.family
          }
        : null,
      status: p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error('Get podcasts error:', error);
    res.status(500).json({ message: 'Error fetching podcasts' });
  }
};
const deletePodcast = async (req, res) => {
  try {
    const podcastId = req.params.id?.trim();

    // Validate ObjectId format
    if (!podcastId || !mongoose.Types.ObjectId.isValid(podcastId)) {
      return res.status(400).json({ message: 'Invalid podcast ID format' });
    }

    const podcast = await Podcast.findById(podcastId);
    if (!podcast) {
      return res.status(404).json({ message: 'Podcast not found' });
    }

    // Check if user is admin and is the author
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    if (podcast.author.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You can only delete your own podcasts' });
    }

    // Delete files
    const audioPath = path.join(__dirname, '..', 'uploads', 'podcasts', 'audio', path.basename(podcast.audioUrl));
    const coverPath = path.join(__dirname, '..', 'uploads', 'podcasts', 'cover', path.basename(podcast.coverImage));

    [audioPath, coverPath].forEach(filePath => {
      fs.unlink(filePath, err => {
        if (err && err.code !== 'ENOENT') {
          console.error(`Failed to delete file: ${filePath}`, err);
        }
      });
    });

    // Delete notifications
    await Notification.deleteMany({ relatedId: podcastId, type: 'podcast' });

    // Delete podcast
    await Podcast.findByIdAndDelete(podcastId);

    res.status(200).json({ message: 'Podcast deleted successfully' });
  } catch (error) {
    console.error('Delete podcast error:', error);
    res.status(500).json({ message: 'Error deleting podcast', error: error.message });
  }
};

module.exports = {
  createPodcast,
  getPodcasts,
  deletePodcast
};