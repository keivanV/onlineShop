const express = require('express');
const Course = require('../models/Course');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Basket = require('../models/Basket');
const Notification = require('../models/Notification');
const Podcast = require('../models/Podcast');
const mongoose = require('mongoose');

const router = express.Router();

// Get homepage data with all required information
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const isAdmin = req.user.role === 'admin';

    // 1. Courses data with groupings
    const basePopulate = [
      { path: 'teacher', select: 'name family expertise' },
      { path: 'category', select: 'name' }
    ];
    const baseSelect = 'title coverImage status level duration type price discount createdAt students rating chapters previewVideo presentationMethod downloadLink prerequisites expertise comments';

    // All courses
    const allCourses = await Course.find()
      .populate(basePopulate)
      .select(baseSelect)
      .lean();

    // Best sellers (based on number of students, for paid courses)
    const bestSellers = await Course.find({ type: 'paid' })
      .populate(basePopulate)
      .select(baseSelect)
      .sort({ 'students.length': -1 })
      .limit(10)
      .lean();

    // Most viewed (assuming based on rating, since no visits field; adjust if needed)
    const mostViewed = await Course.find()
      .populate(basePopulate)
      .select(baseSelect)
      .sort({ rating: -1 })
      .limit(10)
      .lean();

    // Newest courses
    const newest = await Course.find()
      .populate(basePopulate)
      .select(baseSelect)
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Discounted courses
    const discounted = await Course.find({ discount: { $gt: 0 } })
      .populate(basePopulate)
      .select(baseSelect)
      .sort({ discount: -1 })
      .limit(10)
      .lean();

    // Calculate statistics (kept from original)
    const totalCourses = await Course.countDocuments();
    const completedCourses = await Course.countDocuments({ status: 'active' });
    const ongoingCourses = await Course.countDocuments({ status: 'pending' });
    const totalStudents = await User.countDocuments({ role: 'student' });

    // Latest course time
    let timeSincePublished = 'هیچ دوره‌ای موجود نیست';
    const latestCourse = await Course.findOne()
      .sort({ createdAt: -1 })
      .select('createdAt');

    if (latestCourse && latestCourse.createdAt) {
      const now = new Date();
      const diffMs = now - new Date(latestCourse.createdAt);
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 60) {
        timeSincePublished = `${diffMins} دقیقه پیش`;
      } else if (diffHours < 24) {
        timeSincePublished = `${diffHours} ساعت پیش`;
      } else {
        timeSincePublished = `${diffDays} روز پیش`;
      }
    }

    // 2. Basket information
    const basket = await Basket.findOne({ user: userId })
      .populate({
        path: 'courses.course',
        select: 'title price discount'
      })
      .lean();

    const basketData = basket ? {
      itemCount: basket.courses.length,
      items: basket.courses.map(item => ({
        courseId: item.course._id,
        title: item.course.title,
        price: item.course.price,
        discount: item.discount,
        appliedDiscount: item.appliedDiscount,
        discountCode: item.discountCode
      })),
      subscriptionPlan: basket.subscriptionPlan
    } : {
      itemCount: 0,
      items: [],
      subscriptionPlan: null
    };

    // 3. Notifications
    const notifications = await Notification.find({ user: userId })
      .select('title message type relatedId isRead createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // 4. User profile information
    const user = await User.findById(userId)
      .select('name family phone email role status subscription subscriptionExpiresAt coursesEnrolled coursesTaught rating expertise nationalId bio lastLogin createdAt isProfileComplete')
      .lean();

    // 5. All published podcasts
    const podcasts = await Podcast.find({ status: 'published' })
      .populate('author', 'name family')
      .select('title description duration episode tags audioUrl coverImage author createdAt updatedAt')
      .lean();

    // Format courses for response (similar to original)
    const formatCourses = (courses) => courses.map(course => ({
      id: course._id,
      title: course.title,
      coverImage: course.coverImage,
      teacher: course.teacher ? `${course.teacher.name} ${course.teacher.family}` : 'نامشخص',
      expertise: course.teacher?.expertise || '',
      price: course.price || 0,
      discount: course.discount || 0,
      status: course.status,
      level: course.level,
      duration: course.duration,
      type: course.type,
      category: course.category?.name || '',
      createdAt: course.createdAt,
      studentCount: course.students?.length || 0,
      rating: course.rating,
      chapters: course.chapters,
      previewVideo: course.previewVideo,
      presentationMethod: course.presentationMethod,
      downloadLink: course.downloadLink,
      prerequisites: course.prerequisites,
      comments: course.comments
    }));

    const response = {
      statistics: {
        totalCourses,
        completedCourses,
        ongoingCourses,
        totalStudents,
        latestCourseTime: timeSincePublished
      },
      courses: {
        all: formatCourses(allCourses),
        bestSellers: formatCourses(bestSellers),
        mostViewed: formatCourses(mostViewed),
        newest: formatCourses(newest),
        discounted: formatCourses(discounted)
      },
      basket: basketData,
      notifications,
      userProfile: user,
      podcasts: podcasts.map(podcast => ({
        ...podcast,
        author: podcast.author ? `${podcast.author.name} ${podcast.author.family}` : 'نامشخص'
      })),
      canCreateCourse: isAdmin
    };

    res.status(200).json(response);
  } catch (error) {
    console.error(`Homepage error: ${error.message}`, { error });
    res.status(500).json({ message: 'خطا در دریافت اطلاعات صفحه اصلی' });
  }
});

// New route for removing item from basket
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
    console.error(`Basket remove error: ${error.message}`, { error });
    res.status(500).json({ message: 'خطا در حذف دوره از سبد خرید' });
  }
});

module.exports = router;