// routes/notifications.js
const express = require('express');
const { getNotifications, markAsRead, markAllAsRead } = require('../controllers/notificationController');
const { verifyToken, verifyUser } = require('../middleware/auth');

const router = express.Router();

router.get('/', verifyToken, verifyUser, getNotifications);
router.put('/read/:notificationId', verifyToken, verifyUser, markAsRead);
router.put('/read-all', verifyToken, verifyUser, markAllAsRead);

module.exports = router;