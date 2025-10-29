// routes/podcasts.js
const express = require('express');
const { createPodcast, getPodcasts, deletePodcast } = require('../controllers/podcastController');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

router.post('/', verifyToken, verifyAdmin, upload, createPodcast);
router.get('/', getPodcasts);
router.delete('/:id', verifyToken, verifyAdmin, deletePodcast);

module.exports = router;