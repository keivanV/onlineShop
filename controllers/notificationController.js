// controllers/notificationController.js
const Notification = require('../models/Notification');

const getNotifications =	async (req, res) => {
  try {
    const userId = req.user.id;
    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({ user: userId, isRead: false });

    res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ message: 'خطا در دریافت اعلانات' });
  }
};

const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({ _id: notificationId, user: userId });
    if (!notification) return res.status(404).json({ message: 'اعلان یافت نشد' });

    notification.isRead = true;
    await notification.save();

    res.status(200).json({ message: 'اعلان خوانده شد' });
  } catch (error) {
    res.status(500).json({ message: 'خطا در علامت‌گذاری' });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    await Notification.updateMany({ user: userId, isRead: false }, { isRead: true });
    res.status(200).json({ message: 'همه اعلانات خوانده شدند' });
  } catch (error) {
    res.status(500).json({ message: 'خطا در علامت‌گذاری همه' });
  }
};

module.exports = { getNotifications, markAsRead, markAllAsRead };