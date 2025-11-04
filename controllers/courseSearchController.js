// controllers/courseSearchController.js
const Course = require('../models/Course');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const url = (path) => (path ? `${BASE_URL}/uploads/${path}` : null);

/**
 * GET /api/course/search?q=react
 * Autocomplete-style search on course title, teacher, category
 * Returns up to 5 FULL course details
 */
const searchCourses = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ message: 'Query must be at least 2 characters' });
    }

    const searchRegex = new RegExp(q.trim(), 'i');

    const courses = await Course.find({
      status: 'active',
      $or: [
        { title: searchRegex },
        { 'teacher.name': searchRegex },
        { 'category.name': searchRegex }
      ]
    })
      .populate('category', 'name')
      .populate('teacher', 'name expertise')
      .lean()
      .limit(5);

    const formatted = courses.map(c => ({
      _id: c._id,
      title: c.title,
      coverImage: url(c.coverImage),
      previewVideo: url(c.previewVideo),
      teacherName: c.teacher ? `${c.teacher.name}` : 'Unknown',
      category: c.category?.name || '',
      level: c.level,
      duration: c.duration,
      price: c.price,
      discount: c.discount,
      finalPrice: c.finalPrice,
      isDiscountActive: c.isDiscountActive,
      type: c.type,
      studentCount: c.students.length,
      rating: c.rating,
      firstVideo: c.chapters[0]?.videos[0]
        ? {
            _id: c.chapters[0].videos[0]._id,
            title: c.chapters[0].videos[0].title,
            fileUrl: url(c.chapters[0].videos[0].filePath),
            accessible: true
          }
        : null
    }));

    res.status(200).json({ suggestions: formatted });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { searchCourses };