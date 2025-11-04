// controllers/courseDetailController.js
const Course = require('../models/Course');
const User = require('../models/User');
const Basket = require('../models/Basket');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const url = (path) => (path ? `${BASE_URL}/uploads/${path}` : null);

/* ------------------------------------------------------------------ */
/* Helper: can the logged-in user access the whole course?            */
/* ------------------------------------------------------------------ */
const canAccessCourse = (course, user) => {
  const isEnrolled = course.students.includes(user._id);
  if (!isEnrolled) return false;

  if (course.type === 'free' || course.type === 'paid') return true;

  if (course.type === 'vip') {
    return user.subscription === 'vip' && user.subscriptionExpiresAt && new Date() <= user.subscriptionExpiresAt;
  }
  return false;
};

/* ------------------------------------------------------------------ */
/* GET /api/course/:courseId/detail – full course detail page         */
/* ------------------------------------------------------------------ */
const getCourseDetail = async (req, res) => {
  try {
    const courseId = req.params.courseId?.trim();
    if (!courseId) return res.status(400).json({ message: 'Course ID required' });
    if (!mongoose.Types.ObjectId.isValid(courseId)) return res.status(400).json({ message: 'Invalid ID' });

    const course = await Course.findById(courseId)
      .populate('category', 'name')
      .populate('teacher', 'name expertise bio rating')
      .populate('comments.user', 'name')
      .lean();

    if (!course) return res.status(404).json({ message: 'Course not found' });
    if (course.status !== 'active') return res.status(403).json({ message: 'Course not active' });

    const userId = req.user?._id;
    let user = null, isEnrolled = false, canAccess = false;

    if (userId) {
      user = await User.findById(userId).select('-otp -otpExpires -refreshToken').lean();
      isEnrolled = course.students.includes(userId);
      canAccess = canAccessCourse(course, user);
    }

    /* ------------------------------------------------------------------ */
    /* Format chapters & videos – only videoUrl is returned               */
    /* ------------------------------------------------------------------ */
    const chapters = course.chapters.map((ch, chIdx) => ({
      ...ch,
      videos: ch.videos.map((v, vIdx) => {
        const isFirst = chIdx === 0 && vIdx === 0;
        const accessible = isFirst || (userId && canAccess);
        return {
          _id: v._id,
          title: v.title,
          description: v.description || '',
          duration: v.duration,
          time: v.time || '',
          videoUrl: v.videoUrl,
          accessible,
          message: !accessible && userId ? getAccessMessage(course.type, isEnrolled, user) : undefined
        };
      })
    }));

    function getAccessMessage(type, enrolled, user) {
      if (!enrolled) return 'You must enroll to watch this video';
      if (type === 'paid') return 'Payment required';
      if (type === 'vip') {
        if (user.subscription !== 'vip') return 'VIP subscription required';
        if (!user.subscriptionExpiresAt || new Date() > user.subscriptionExpiresAt) return 'VIP subscription expired';
      }
      return 'Access denied';
    }

    const formattedCourse = {
      ...course,
      coverImage: url(course.coverImage),
      previewVideoUrl: course.previewVideoUrl,
      finalPrice: course.finalPrice,
      isDiscountActive: course.isDiscountActive,
      teacherName: course.teacher ? `${course.teacher.name}` : 'Unknown',
      isEnrolled,
      canAccess,
      chapters,
      comments: course.comments.filter(c => c.status === 'approved')
    };

    const teacher = course.teacher ? {
      _id: course.teacher._id,
      fullName: `${course.teacher.name}`,
      expertise: course.teacher.expertise || '',
      bio: course.teacher.bio || '',
      rating: course.teacher.rating || 0
    } : null;

    const relatedCourses = await Course.find({
      _id: { $ne: course._id },
      category: course.category._id,
      status: 'active'
    })
      .select('title coverImage price discount finalPrice level duration')
      .limit(6)
      .lean();

    const formattedRelated = relatedCourses.map(rc => ({
      ...rc,
      coverImage: url(rc.coverImage),
      finalPrice: rc.finalPrice
    }));

    let notifications = { list: [], unreadCount: 0 };
    let basketData = { itemCount: 0, items: [], subscriptionPlan: null };

    if (userId) {
      const [notifs, unread] = await Promise.all([
        Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(10).lean(),
        Notification.countDocuments({ user: userId, isRead: false })
      ]);
      notifications = { list: notifs, unreadCount: unread };

      const basket = await Basket.findOne({ user: userId })
        .populate('courses.course', 'title price discount')
        .lean();

      if (basket) {
        basketData = {
          itemCount: basket.courses.length,
          items: basket.courses.map(i => ({
            courseId: i.course._id,
            title: i.course.title,
            price: i.course.price,
            discount: i.course.discount,
            finalPrice: i.course.price - (i.course.price * i.course.discount) / 100
          })),
          subscriptionPlan: basket.subscriptionPlan
        };
      }
    }

    res.json({
      userProfile: user || null,
      notifications,
      basket: basketData,
      course: formattedCourse,
      teacher,
      relatedCourses: formattedRelated
    });
  } catch (err) {
    console.error('Course detail error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getCourseDetail };