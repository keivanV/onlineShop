// routes/homepage.js
const express = require('express');
const Course = require('../models/Course');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const { authOptional } = require('../middleware/authOptional');
const User = require('../models/User');
const Basket = require('../models/Basket');
const Notification = require('../models/Notification');
const Podcast = require('../models/Podcast');
const mongoose = require('mongoose');

const router = express.Router();

// URL base
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const url = (p) => (p ? `${BASE_URL}/uploads/${p}` : null);

/* ------------------------------------------------------------------ */
/* GET /api/homepage – عمومی + اختیاری لاگین                        */
/* ------------------------------------------------------------------ */
router.get('/', authOptional, async (req, res) => {
  try {
    const userId = req.user?._id;
    const isLoggedIn = !!userId;
    const isAdmin = req.user?.role === 'admin';

    // 1. Courses (همیشه در دسترس)
    const basePopulate = [
      { path: 'teacher', select: 'name  expertise' },
      { path: 'category', select: 'name' }
    ];
    const baseSelect = 'title coverImage status level duration type price discount createdAt students rating chapters previewVideoUrl presentationMethod prerequisites';

    const allCourses = await Course.find({ status: 'active' })
      .populate(basePopulate)
      .select(baseSelect)
      .lean();

    const bestSellers = await Course.find({ type: 'paid', status: 'active' })
      .populate(basePopulate)
      .select(baseSelect)
      .sort({ 'students.length': -1 })
      .limit(10)
      .lean();

    const mostViewed = await Course.find({ status: 'active' })
      .populate(basePopulate)
      .select(baseSelect)
      .sort({ rating: -1 })
      .limit(10)
      .lean();

    const newest = await Course.find({ status: 'active' })
      .populate(basePopulate)
      .select(baseSelect)
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const discounted = await Course.find({ discount: { $gt: 0 }, status: 'active' })
      .populate(basePopulate)
      .select(baseSelect)
      .sort({ discount: -1 })
      .limit(10)
      .lean();

    // آمار
    const totalCourses = await Course.countDocuments({ status: 'active' });
    const totalStudents = await User.countDocuments({ role: 'student' });

    let timeSincePublished = '';
    const latestCourse = await Course.findOne({ status: 'active' }).sort({ createdAt: -1 }).select('createdAt');
    if (latestCourse) {
      const diffMs = Date.now() - new Date(latestCourse.createdAt);
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 60) timeSincePublished = `${diffMins} دقیقه پیش`;
      else if (diffHours < 24) timeSincePublished = `${diffHours} ساعت پیش`;
      else timeSincePublished = `${diffDays} روز پیش`;
    }

    // فرمت دوره‌ها
    const formatCourse = (c) => ({
      id: c._id,
      title: c.title,
      coverImage: url(c.coverImage),
      teacher: c.teacher ? `${c.teacher.name}` : 'نامشخص',
      expertise: c.teacher?.expertise || '',
      category: c.category?.name || '',
      price: c.price || 0,
      discount: c.discount || 0,
      finalPrice: c.price && c.discount > 0 ? c.price - (c.price * c.discount / 100) : c.price,
      status: c.status,
      level: c.level,
      duration: c.duration,
      type: c.type,
      studentCount: c.students?.length || 0,
      rating: c.rating || 0,
      chaptersCount: c.chapters?.length || 0,
      previewVideoUrl: c.previewVideoUrl,
      presentationMethod: c.presentationMethod,
      prerequisites: c.prerequisites || [],
      createdAt: c.createdAt
    });

    // 2. داده‌های اختیاری (فقط برای لاگین شده‌ها)
    let basketData = { itemCount: 0, items: [], subscriptionPlan: null };
    let notifications = [];
    let userProfile = null;

    if (isLoggedIn) {
      // سبد خرید
      const basket = await Basket.findOne({ user: userId })
        .populate('courses.course', 'title price discount')
        .lean();

      if (basket) {
        basketData = {
          itemCount: basket.courses.length,
          items: basket.courses.map(item => ({
            courseId: item.course._id,
            title: item.course.title,
            price: item.course.price,
            discount: item.course.discount,
            appliedDiscount: item.appliedDiscount,
            discountCode: item.discountCode
          })),
          subscriptionPlan: basket.subscriptionPlan
        };
      }

      // نوتیفیکیشن
      notifications = await Notification.find({ user: userId })
        .select('title message type relatedId isRead createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      // پروفایل کاربر
      userProfile = await User.findById(userId)
        .select('name  phone email role status subscription subscriptionExpiresAt coursesEnrolled rating expertise bio isProfileComplete')
        .lean();
    }

    // 3. پادکست‌ها
    const podcasts = await Podcast.find({ status: 'published' })
      .populate('author', 'name')
      .select('title description duration episode tags audioUrl coverImage author createdAt')
      .lean();

    const response = {
      statistics: {
        totalCourses,
        totalStudents,
        latestCourseTime: timeSincePublished
      },
      courses: {
        all: allCourses.map(formatCourse),
        bestSellers: bestSellers.map(formatCourse),
        mostViewed: mostViewed.map(formatCourse),
        newest: newest.map(formatCourse),
        discounted: discounted.map(formatCourse)
      },
      basket: basketData,
      notifications,
      userProfile,
      podcasts: podcasts.map(p => ({
        ...p,
        author: p.author ? `${p.author.name}` : 'نامشخص',
        audioUrl: url(p.audioUrl),
        coverImage: url(p.coverImage)
      })),
      isLoggedIn,
      canCreateCourse: isAdmin
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Homepage error:', error);
    res.status(500).json({ message: 'خطا در دریافت اطلاعات صفحه اصلی' });
  }
});

/* ------------------------------------------------------------------ */
/* DELETE /api/homepage/basket/:courseId – فقط کاربر لاگین شده       */
/* ------------------------------------------------------------------ */
router.delete('/basket/:courseId', verifyToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const { courseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: 'شناسه دوره نامعتبر است' });
    }

    const basket = await Basket.findOne({ user: userId });
    if (!basket) {
      return res.status(404).json({ message: 'سبد خرید یافت نشد' });
    }

    basket.courses = basket.courses.filter(item => !item.course.equals(courseId));
    await basket.save();

    res.status(200).json({ message: 'دوره با موفقیت از سبد خرید حذف شد' });
  } catch (error) {
    console.error('Basket remove error:', error);
    res.status(500).json({ message: 'خطا در حذف دوره از سبد خرید' });
  }
});

/* ------------------------------------------------------------------ */
/* GET /api/homepage/search – عمومی (اختیاری لاگین)                  */
/* ------------------------------------------------------------------ */
router.get('/search', authOptional, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(200).json({ suggestions: [] });
    }

    const searchQuery = q.trim();

    const courses = await Course.find({
      status: 'active',
      $or: [
        { title: { $regex: searchQuery, $options: 'i' } },
        { 'teacher.name': { $regex: searchQuery, $options: 'i' } },
        { 'category.name': { $regex: searchQuery, $options: 'i' } }
      ]
    })
      .populate([
        { path: 'teacher', select: 'name  expertise' },
        { path: 'category', select: 'name' }
      ])
      .select('title coverImage previewVideoUrl status level duration type price discount students rating chapters presentationMethod createdAt')
      .limit(5)
      .lean();

    const suggestions = courses.map(course => ({
      id: course._id,
      title: course.title,
      coverImage: url(course.coverImage),
      previewVideoUrl: course.previewVideoUrl,
      teacher: course.teacher ? `${course.teacher.name}` : 'نامشخص',
      expertise: course.teacher?.expertise || '',
      category: course.category?.name || '',
      status: course.status,
      level: course.level,
      duration: course.duration,
      type: course.type,
      price: course.price || 0,
      discount: course.discount || 0,
      finalPrice: course.price && course.discount > 0
        ? course.price - (course.price * course.discount / 100)
        : course.price,
      studentCount: course.students?.length || 0,
      rating: course.rating || 0,
      chaptersCount: course.chapters?.length || 0,
      presentationMethod: course.presentationMethod,
      createdAt: course.createdAt
    }));

    res.status(200).json({ suggestions });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'خطا در جستجوی دوره‌ها' });
  }
});

module.exports = router;