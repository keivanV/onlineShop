// controllers/courseSearchController.js
const Course = require('../models/Course');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const url = (path) => (path ? `${BASE_URL}/uploads/${path}` : null);

/**
 * GET /api/course/search?q=react
 * 
 *getCourses, filterCourses و enrollCourse
 */
const searchCourses = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'جستجو باید حداقل ۲ کاراکتر باشد'
      });
    }

    const searchTerm = q.trim();
    const regex = new RegExp(searchTerm, 'i');

    const query = {
      status: { $nin: ['stopped'] }, 
      $or: [
        { title: regex },
        { description: regex },
        { 'teacher.name': regex },
        { 'category.name': regex }
      ]
    };

    const courses = await Course.find(query)
      .populate('teacher', 'name expertise rating profilePic')
      .populate('category', 'name slug')
      .lean() 
      .limit(8)
      .sort({ createdAt: -1 });

    if (courses.length === 0) {
      return res.json({
        success: true,
        query: searchTerm,
        count: 0,
        suggestions: []
      });
    }

    const now = new Date();

    const suggestions = courses.map(c => {

      const isDiscountActive = c.discount > 0 && c.discountEnd && now <= new Date(c.discountEnd);
      const finalPrice = c.type === 'paid'
        ? (isDiscountActive ? Math.round(c.price * (1 - c.discount / 100)) : c.price || 0)
        : 0;

      const enrolledCount = c.students?.length || 0;
      const isFull = c.capacity > 0 && enrolledCount >= c.capacity;
      const remainingCapacity = c.capacity > 0 
        ? Math.max(0, c.capacity - enrolledCount) 
        : null;

      const canEnroll = !isFull && 
                        (!c.registrationEnd || now <= new Date(c.registrationEnd));

      let displayStatus = 'در حال برگزاری';
      if (c.status === 'pre-register') displayStatus = 'پیش‌ثبت‌نام';
      else if (c.status === 'last-week') displayStatus = 'هفته آخر ثبت‌نام';
      else if (c.status === 'finished') displayStatus = 'تکمیل شده';
      else if (c.status === 'sold-out' || isFull) displayStatus = 'اتمام ظرفیت';
      else if (c.status === 'active' && c.registrationEnd) {
        const daysLeft = Math.ceil((new Date(c.registrationEnd) - now) / (86400000));
        if (daysLeft > 0 && daysLeft <= 7) displayStatus = 'هفته آخر ثبت‌نام';
      }

      const firstVideo = c.chapters?.[0]?.videos?.[0];

      return {
        _id: c._id.toString(),
        title: c.title,
        slug: c.slug || c._id.toString(),
        coverImage: url(c.coverImage),
        previewVideoUrl: c.previewVideoUrl ? url(c.previewVideoUrl) : null,

        teacher: {
          name: c.teacher?.name?.trim() || 'نامشخص',
          expertise: c.teacher?.expertise || '',
          rating: Number(c.teacher?.rating || 0).toFixed(1),
          profilePic: c.teacher?.profilePic ? url(c.teacher.profilePic) : null
        },

        category: c.category?.map(cat => ({
          name: cat.name,
          slug: cat.slug
        })) || [],

        level: c.level,
        type: c.type,
        duration: c.duration,

        price: c.price || 0,
        discount: c.discount || 0,
        discountEnd: c.discountEnd,
        finalPrice,
        isDiscountActive,

        status: c.status,
        displayStatus,
        canEnroll,                   
        isFull,                      
        isSoldOut: c.status === 'sold-out' || isFull,
        remainingCapacity,           
        isLimitedCapacity: c.capacity > 0,
        studentCount: enrolledCount,

        chapterCount: c.chapters?.length || 0,
        videoCount: c.chapters?.reduce((sum, ch) => sum + (ch.videos?.length || 0), 0) || 0,

        firstVideo: firstVideo ? {
          _id: firstVideo._id.toString(),
          title: firstVideo.title,
          duration: firstVideo.duration,
          videoUrl: firstVideo.videoUrl,
          accessible: true
        } : null,

        rating: Number(c.courseRating || 0).toFixed(1),
        ratingCount: c.courseRatingCount || 0
      };
    });

    res.json({
      success: true,
      query: searchTerm,
      count: suggestions.length,
      suggestions
    });

  } catch (err) {
    console.error('Course search error:', err);
    res.status(500).json({
      success: false,
      message: 'خطا در جستجوی دوره‌ها'
    });
  }
};

module.exports = { searchCourses };