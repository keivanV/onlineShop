// controllers/courseDetailController.js
const Course = require('../models/Course');
const User = require('../models/User');
const Basket = require('../models/Basket');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const url = (path) => (path ? `${BASE_URL}/uploads/${path}` : null);

/* ------------------------------------------------------------------ */
/* GET /api/course/:courseId/detail – صفحه جزئیات کامل دوره         */
/* ------------------------------------------------------------------ */
const getCourseDetail = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user?._id;

    // اعتبارسنجی ID
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: 'شناسه دوره نامعتبر است' });
    }

    // دریافت دوره با populate لازم
    const course = await Course.findById(courseId)
      .populate('category', 'name slug')
      .populate('teacher', 'name expertise bio rating profilePic')
      .populate('comments.user', 'name profilePic')
      .lean();

    if (!course) {
      return res.status(404).json({ message: 'دوره یافت نشد' });
    }

    // مخفی کردن دوره‌های متوقف شده
    if (course.status === 'stopped') {
      return res.status(410).json({ message: 'این دوره حذف شده است' });
    }

    const now = new Date();

    // محاسبه دستی virtual ها (دقیقاً مثل getCourses و searchCourses)
    const isDiscountActive = course.discount > 0 && course.discountEnd && now <= new Date(course.discountEnd);
    const finalPrice = course.type === 'paid'
      ? (isDiscountActive ? Math.round(course.price * (1 - course.discount / 100)) : course.price || 0)
      : 0;

    const enrolledCount = course.students?.length || 0;
    const isFull = course.capacity > 0 && enrolledCount >= course.capacity;
    const remainingCapacity = course.capacity > 0 
      ? Math.max(0, course.capacity - enrolledCount) 
      : null;

    const canEnroll = !isFull && (!course.registrationEnd || now <= new Date(course.registrationEnd));

    // وضعیت نمایشی هوشمند
    let displayStatus = 'در حال برگزاری';
    if (course.status === 'pre-register') displayStatus = 'پیش‌ثبت‌نام';
    else if (course.status === 'last-week') displayStatus = 'هفته آخر ثبت‌نام';
    else if (course.status === 'finished') displayStatus = 'تکمیل شده';
    else if (course.status === 'sold-out' || isFull) displayStatus = 'اتمام ظرفیت';
    else if (course.registrationEnd) {
      const daysLeft = Math.ceil((new Date(course.registrationEnd) - now) / (86400000));
      if (daysLeft > 0 && daysLeft <= 7) displayStatus = 'هفته آخر ثبت‌نام';
    }

    // بررسی ثبت‌نام کاربر
    const isEnrolled = userId ? course.students.some(s => s.toString() === userId.toString()) : false;

    // دسترسی به محتوای کامل
    let canAccessContent = false;
    if (isEnrolled) {
      if (course.type === 'free' || course.type === 'paid') {
        canAccessContent = true;
      } else if (course.type === 'vip') {
        if (userId) {
          const user = await User.findById(userId).select('subscription subscriptionExpiresAt').lean();
          canAccessContent = user?.subscription === 'vip' && 
                            user?.subscriptionExpiresAt && 
                            now <= new Date(user.subscriptionExpiresAt);
        }
      }
    }

    // فصل‌ها و ویدیوها با کنترل دسترسی هوشمند
    const chapters = course.chapters.map((chapter, chIdx) => ({
      ...chapter,
      _id: chapter._id.toString(),
      videos: chapter.videos.map((video, vIdx) => {
        const isFirstVideo = chIdx === 0 && vIdx === 0;
        const accessible = isFirstVideo || canAccessContent;

        return {
          _id: video._id.toString(),
          title: video.title,
          description: video.description || '',
          duration: video.duration || 0,
          videoUrl: accessible ? video.videoUrl : null,
          accessible,
          locked: !accessible && !isFirstVideo,
          lockReason: !accessible && !isFirstVideo ? (
            !userId ? 'برای تماشای این ویدیو باید وارد شوید' :
            !isEnrolled ? 'برای دسترسی به این ویدیو باید در دوره ثبت‌نام کنید' :
            course.type === 'vip' ? 'اشتراک VIP فعال لازم است' :
            'دسترسی محدود شده'
          ) : null
        };
      })
    }));

    // نظرات تأیید شده
    const approvedComments = (course.comments || [])
      .filter(c => c.status === 'approved')
      .map(c => ({
        _id: c._id.toString(),
        text: c.text,
        rating: c.rating,
        createdAt: c.createdAt,
        user: {
          name: c.user?.name || 'ناشناس',
          profilePic: c.user?.profilePic ? url(c.user.profilePic) : null
        }
      }));

    // دوره‌های مرتبط
    const relatedCourses = await Course.find({
      _id: { $ne: course._id },
      category: { $in: course.category.map(c => c._id) },
      status: { $nin: ['stopped'] }
    })
      .select('title coverImage price discount discountEnd type capacity students')
      .lean()
      .limit(6)
      .sort({ createdAt: -1 });

    const formattedRelated = relatedCourses.map(rc => {
      const relDiscountActive = rc.discount > 0 && rc.discountEnd && now <= new Date(rc.discountEnd);
      const relFinalPrice = rc.type === 'paid'
        ? (relDiscountActive ? Math.round(rc.price * (1 - rc.discount / 100)) : rc.price || 0)
        : 0;
      const relIsFull = rc.capacity > 0 && (rc.students?.length || 0) >= rc.capacity;

      return {
        _id: rc._id.toString(),
        title: rc.title,
        coverImage: url(rc.coverImage),
        finalPrice: relFinalPrice,
        isDiscountActive: relDiscountActive,
        isFull: relIsFull,
        studentCount: rc.students?.length || 0
      };
    });

    // داده‌های کاربر (اعلان + سبد خرید)
    let notifications = { list: [], unreadCount: 0 };
    let basket = { itemCount: 0, items: [], total: 0 };

    if (userId) {
      const [notifs, unread, userBasket] = await Promise.all([
        Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(10).lean(),
        Notification.countDocuments({ user: userId, isRead: false }),
        Basket.findOne({ user: userId }).populate('courses.course', 'title price discount discountEnd').lean()
      ]);

      notifications = { list: notifs, unreadCount: unread };

      if (userBasket) {
        basket = {
          itemCount: userBasket.courses.length,
          items: userBasket.courses.map(item => {
            const c = item.course;
            const discActive = c.discount > 0 && c.discountEnd && now <= new Date(c.discountEnd);
            const fPrice = c.type === 'paid' ? (discActive ? Math.round(c.price * (1 - c.discount / 100)) : c.price) : 0;
            return {
              courseId: c._id.toString(),
              title: c.title,
              finalPrice: fPrice
            };
          }),
          total: userBasket.courses.reduce((sum, i) => {
            const c = i.course;
            const discActive = c.discount > 0 && c.discountEnd && now <= new Date(c.discountEnd);
            return sum + (c.type === 'paid' ? (discActive ? Math.round(c.price * (1 - c.discount / 100)) : c.price) : 0);
          }, 0)
        };
      }
    }

    // پاسخ نهایی
    res.json({
      success: true,
      data: {
        course: {
          _id: course._id.toString(),
          title: course.title,
          description: course.description || '',
          coverImage: url(course.coverImage),
          previewVideoUrl: course.previewVideoUrl ? url(course.previewVideoUrl) : null,

          teacher: course.teacher ? {
            _id: course.teacher._id.toString(),
            name: course.teacher.name?.trim() || 'نامشخص',
            expertise: course.teacher.expertise || '',
            bio: course.teacher.bio || '',
            rating: Number(course.teacher.rating || 0).toFixed(1),
            profilePic: course.teacher.profilePic ? url(course.teacher.profilePic) : null
          } : null,

          category: course.category || [],
          level: course.level,
          type: course.type,
          duration: course.duration,
          presentationMethod: course.presentationMethod,

          // قیمت و تخفیف
          price: course.price || 0,
          discount: course.discount || 0,
          discountEnd: course.discountEnd,
          finalPrice,
          isDiscountActive,

          // وضعیت و ظرفیت
          status: course.status,
          displayStatus,
          canEnroll: canEnroll && !isEnrolled,
          isEnrolled,
          canAccessContent,
          isFull,
          remainingCapacity,        // null = نامحدود
          isLimitedCapacity: course.capacity > 0,
          studentCount: enrolledCount,
          capacity: course.capacity,

          // محتوا
          chapters,
          chapterCount: course.chapters.length,
          videoCount: course.chapters.reduce((s, ch) => s + ch.videos.length, 0),

          // نظرات
          rating: Number(course.courseRating || 0).toFixed(1),
          ratingCount: course.courseRatingCount || 0,
          comments: approvedComments
        },

        relatedCourses: formattedRelated,
        notifications,
        basket
      }
    });

  } catch (err) {
    console.error('getCourseDetail error:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در بارگذاری جزئیات دوره'
    });
  }
};

module.exports = { getCourseDetail };