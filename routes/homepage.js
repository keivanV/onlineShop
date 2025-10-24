const express = require('express');
const Course = require('../models/Course');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const User = require('../models/User');
const mongoose = require('mongoose');

const router = express.Router();

// Get homepage data with pagination and filtering
router.get('/', async (req, res) => {
  try {
    // Extract query parameters
    const { page = 1, limit = 3, status, category } = req.query;
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);

    // Build query for courses
    const query = {};
    if (status) query.status = status;
    if (category && mongoose.Types.ObjectId.isValid(category)) {
      query.category = category;
    }

    // Calculate statistics
    const totalCourses = await Course.countDocuments();
    const completedCourses = await Course.countDocuments({ status: 'active' });
    const ongoingCourses = await Course.countDocuments({ status: 'pending' });
    const totalStudents = await User.countDocuments({ role: 'student' });

    // Get latest course and calculate time since publication
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

    // Get paginated courses with details
    const courses = await Course.find(query)
      .populate('teacher', 'name family expertise')
      .populate('category', 'name')
      .select('title coverImage status level duration type price createdAt')
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .lean();

    // Calculate total pages
    const totalFilteredCourses = await Course.countDocuments(query);
    const totalPages = Math.ceil(totalFilteredCourses / limitNumber);

    // Check if user is admin
    const isAdmin = req.user && req.user.role === 'admin';

    const response = {
      statistics: {
        totalCourses,
        completedCourses,
        ongoingCourses,
        totalStudents,
        latestCourseTime: timeSincePublished
      },
      courses: courses.map(course => ({
        id: course._id,
        title: course.title,
        coverImage: course.coverImage,
        teacher: course.teacher ? `${course.teacher.name} ${course.teacher.family}` : 'نامشخص',
        expertise: course.teacher?.expertise || '',
        price: course.price || 0,
        status: course.status,
        level: course.level,
        duration: course.duration,
        type: course.type,
        category: course.category?.name || '',
        createdAt: course.createdAt
      })),
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalCourses: totalFilteredCourses,
        limit: limitNumber
      },
      canCreateCourse: isAdmin
    };

    res.status(200).json(response);
  } catch (error) {
    console.error(`Homepage error: ${error.message}`, { error });
    res.status(500).json({ message: 'خطا در دریافت اطلاعات صفحه اصلی' });
  }
});

module.exports = router;
