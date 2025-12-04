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
const Article = require('../models/Article'); 
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

    // === Courses ===
    const coursePopulate = [
      { path: 'teacher', select: 'name expertise rating' },
      { path: 'category', select: 'name' }
    ];

    const [
      allCourses,
      bestSellers,
      newestCourses,
      discountedCourses
    ] = await Promise.all([
      Course.find({ status: 'active' }).populate(coursePopulate).lean(),
      Course.find({ type: 'paid', status: 'active' }).populate(coursePopulate).sort({ 'students.length': -1 }).limit(8).lean(),
      Course.find({ status: 'active' }).populate(coursePopulate).sort({ createdAt: -1 }).limit(8).lean(),
      Course.find({ discount: { $gt: 0 }, status: 'active' }).populate(coursePopulate).sort({ discount: -1 }).limit(8).lean()
    ]);

    // === Articles + Comments + User data in one query ===
    const articles = await Article.aggregate([
      { $match: { status: 'published' } },
      { $sort: { createdAt: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'authorData'
        }
      },
      { $unwind: { path: '$authorData', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryData'
        }
      },
      { $unwind: { path: '$categoryData', preserveNullAndEmptyArrays: true } },

      // فقط کامنت‌های تأیید شده + آخرین ۵ تا + با اطلاعات کاربر
      {
        $addFields: {
          approvedComments: {
            $filter: {
              input: '$comments',
              as: 'c',
              cond: { $eq: ['$$c.status', 'approved'] }
            }
          }
        }
      },
      {
        $addFields: {
          latestComments: { $slice: ['$approvedComments', -5] },
          commentCount: { $size: '$approvedComments' }
        }
      },

      // اطلاعات کاربر کامنت‌ها
      {
        $lookup: {
          from: 'users',
          localField: 'latestComments.user',
          foreignField: '_id',
          as: 'commentUsers'
        }
      },

      {
        $project: {
          title: 1,
          shortDescription: 1,
          featuredImage: 1,
          readingTime: 1,
          tags: 1,
          createdAt: 1,
          updatedAt: 1,
          articleRating: 1,
          articleRatingCount: 1,
          commentCount: 1,
          authorName: '$authorData.name',
          categoryName: '$categoryData.name',
          comments: {
            $map: {
              input: '$latestComments',
              as: 'c',
              in: {
                text: '$$c.text',
                rating: '$$c.rating',
                createdAt: '$$c.createdAt',
                user: {
                  $let: {
                    vars: { userObj: { $arrayElemAt: ['$commentUsers', { $indexOfArray: ['$commentUsers._id', '$$c.user'] }] } },
                    in: {
                      name: '$$userObj.name',
                      avatar: '$$userObj.avatar'
                    }
                  }
                }
              }
            }
          }
        }
      }
    ]);

    // محاسبه محبوب‌ترین مقالات
    const popularArticles = [...articles]
      .sort((a, b) => {
        const scoreA = (a.articleRating || 0) * (a.articleRatingCount || 0) + a.commentCount;
        const scoreB = (b.articleRating || 0) * (b.articleRatingCount || 0) + b.commentCount;
        return scoreB - scoreA;
      })
      .slice(0, 8);

    const newestArticles = articles.slice(articles.slice(0, 8));

    // === Statistics ===
    const [totalCourses, totalArticles, totalStudents] = await Promise.all([
      Course.countDocuments({ status: 'active' }),
      Article.countDocuments({ status: 'published' }),
      User.countDocuments({ role: 'student' })
    ]);

    const latestCourse = await Course.findOne({ status: 'active' }).sort({ createdAt: -1 }).select('createdAt').lean();
    const latestArticle = await Article.findOne({ status: 'published' }).sort({ createdAt: -1 }).select('createdAt').lean();
    const latestDate = [latestCourse?.createdAt, latestArticle?.createdAt]
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0];

    const latestUpdate = latestDate
      ? (() => {
          const mins = Math.floor((Date.now() - new Date(latestDate)) / 60000);
          if (mins < 60) return `${mins} دقیقه پیش`;
          if (mins < 1440) return `${Math.floor(mins / 60)} ساعت پیش`;
          return `${Math.floor(mins / 1440)} روز پیش`;
        })()
      : 'لحظه‌ای پیش';

    // === Formatting ===
    const formatCourse = (c) => ({
      id: c._id,
      title: c.title,
      description: c.description || '',
      coverImage: url(c.coverImage),
      teacher: c.teacher?.name || 'نامشخص',
      teacherRating: c.teacher?.rating || 0,
      expertise: c.teacher?.expertise || '',
      category: Array.isArray(c.category) ? c.category.map(cat => cat.name).join('، ') : '',
      level: c.level,
      duration: c.duration,
      type: c.type,
      price: c.price || 0,
      discount: c.discount || 0,
      discountEnd: c.discountEnd,
      finalPrice: c.price && c.discount > 0 ? Math.round(c.price * (1 - c.discount / 100)) : c.price,
      studentCount: c.students?.length || 0,
      rating: Number(c.courseRating || 0).toFixed(1),
      ratingCount: c.courseRatingCount || 0,
      chapterCount: c.chapters?.length || 0,
      videoCount: c.chapters?.reduce((t, ch) => t + ch.videos.length, 0) || 0,
      previewVideoUrl: c.previewVideoUrl,
      capacity: c.capacity,
      isLimited: c.capacity > 0,
      isFull: c.capacity > 0 && c.students?.length >= c.capacity,
      createdAt: c.createdAt
    });

    const formatArticle = (a) => ({
      id: a._id,
      title: a.title,
      shortDescription: a.shortDescription,
      featuredImage: url(a.featuredImage),
      author: a.authorName || 'ادمین',
      category: a.categoryName || 'عمومی',
      tags: a.tags || [],
      readingTime: a.readingTime,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      commentCount: a.commentCount || 0,
      rating: Number(a.articleRating || 0).toFixed(1),
      ratingCount: a.articleRatingCount || 0,
      slug: a.title.toLowerCase().replace(/[^a-z0-9آ-ی\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-'),
      comments: (a.comments || []).map(c => ({
        text: c.text,
        rating: c.rating || 0,
        createdAt: c.createdAt,
        user: {
          name: c.user?.name || 'کاربر',
          avatar: c.user?.avatar ? url(c.user.avatar) : null
        }
      }))
    });

    // === User Data ===
    let basketData = { itemCount: 0, items: [] };
    let notifications = [];
    let userProfile = null;

    if (isLoggedIn) {
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
            discount: i.course.discount || 0
          }))
        };
      }

      notifications = await Notification.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      userProfile = await User.findById(userId)
        .select('name phone email role subscription subscriptionExpiresAt coursesEnrolled')
        .lean();
    }

    // === Podcasts ===
    const podcasts = await Podcast.find({ status: 'published' })
      .populate('author', 'name')
      .select('title description duration audioUrl coverImage createdAt')
      .limit(6)
      .lean();

    // === Final Response ===
    res.json({
      statistics: {
        totalCourses,
        totalArticles,
        totalStudents,
        latestUpdate
      },
      courses: {
        all: allCourses.map(formatCourse),
        bestSellers: bestSellers.map(formatCourse),
        newest: newestCourses.map(formatCourse),
        discounted: discountedCourses.map(formatCourse)
      },
      articles: {
        all: articles.map(formatArticle),
        newest: newestArticles.map(formatArticle),
        popular: popularArticles.map(formatArticle)
      },
      podcasts: podcasts.map(p => ({
        ...p,
        authorName: p.author?.name || 'نامشخص',
        audioUrl: url(p.audioUrl),
        coverImage: url(p.coverImage)
      })),
      user: {
        isLoggedIn,
        profile: userProfile,
        basket: basketData,
        notifications
      },
      canCreateContent: isAdmin
    });

  } catch (error) {
    console.error('Homepage error:', error);
    res.status(500).json({ message: 'Server error' });
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