// controllers/podcastController.js
const Podcast = require('../models/Podcast');
const Notification = require('../models/Notification');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

/* ------------------------------------------------------------------ */
/* POST /api/podcasts – admin creates a podcast                       */
/* ------------------------------------------------------------------ */
const createPodcast = async (req, res) => {
  try {
    const { title, description, duration, episode, tags, audioUrl } = req.body;
    const coverFile = req.file; // فقط کاور آپلود شده

    // اعتبارسنجی
    if (!title || !duration || !episode || !audioUrl || !coverFile) {
      return res.status(400).json({
        message: 'Missing required fields: title, duration, episode, audioUrl, coverImage'
      });
    }

    if (!audioUrl.startsWith('http://') && !audioUrl.startsWith('https://')) {
      return res.status(400).json({ message: 'audioUrl must be a valid URL (http/https)' });
    }

    if (!coverFile.mimetype.startsWith('image/')) {
      return res.status(400).json({ message: 'Cover must be an image' });
    }

    // مسیر کاور
    const coverImage = `/uploads/podcasts/cover/${coverFile.filename}`;

    // تگ‌ها
    const parsedTags = tags
      ? tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    // ساخت پادکست
    const podcast = new Podcast({
      title: title.trim(),
      description: description?.trim() || '',
      duration: parseInt(duration, 10),
      episode: parseInt(episode, 10),
      tags: parsedTags,
      audioUrl: audioUrl.trim(),
      coverImage,
      author: req.user.id,
      status: 'published'
    });

    await podcast.save();

    // اطلاع‌رسانی
    const users = await User.find({ role: { $in: ['student', 'teacher'] } }).select('_id');
    if (users.length > 0) {
      const notifications = users.map(user => ({
        user: user._id,
        title: 'پادکست جدید!',
        message: `پادکست "${title}" منتشر شد.`,
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
      audioUrl: podcast.audioUrl,
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

/* ------------------------------------------------------------------ */
/* GET /api/podcasts – list all podcasts                              */
/* ------------------------------------------------------------------ */
const getPodcasts = async (req, res) => {
  try {
    const podcasts = await Podcast.find({ status: 'published' })
      .populate('author', 'name family')
      .sort({ episode: -1 })
      .lean();

    const formatted = podcasts.map(p => ({
      _id: p._id,
      title: p.title,
      description: p.description,
      duration: p.duration,
      episode: p.episode,
      tags: p.tags,
      audioUrl: p.audioUrl,
      coverImage: `${BASE_URL}${p.coverImage}`,
      author: p.author
        ? { _id: p.author._id, name: p.author.name, family: p.author.family }
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

/* ------------------------------------------------------------------ */
/* DELETE /api/podcasts/:id – admin deletes own podcast               */
/* ------------------------------------------------------------------ */
const deletePodcast = async (req, res) => {
  try {
    const podcastId = req.params.id?.trim();

    if (!podcastId || !mongoose.Types.ObjectId.isValid(podcastId)) {
      return res.status(400).json({ message: 'Invalid podcast ID' });
    }

    const podcast = await Podcast.findById(podcastId);
    if (!podcast) return res.status(404).json({ message: 'Podcast not found' });

    if (req.user.role !== 'admin' && podcast.author.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You can only delete your own podcasts' });
    }

    // فقط کاور حذف می‌شه (فایل صوتی لینک خارجی است)
    const coverPath = path.join(__dirname, '..', 'uploads', 'podcasts', 'cover', path.basename(podcast.coverImage));
    fs.unlink(coverPath, err => {
      if (err && err.code !== 'ENOENT') {
        console.error(`Failed to delete cover: ${coverPath}`, err);
      }
    });

    // حذف نوتیفیکیشن‌ها
    await Notification.deleteMany({ relatedId: podcastId, type: 'podcast' });

    // حذف پادکست
    await Podcast.findByIdAndDelete(podcastId);

    res.status(200).json({ message: 'Podcast deleted successfully' });
  } catch (error) {
    console.error('Delete podcast error:', error);
    res.status(500).json({ message: 'Error deleting podcast' });
  }
};

module.exports = { createPodcast, getPodcasts, deletePodcast };