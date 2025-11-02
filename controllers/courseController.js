// controllers/courseController.js
const Course = require('../models/Course');
const Category = require('../models/Category');
const User = require('../models/User');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { ensureDir, saveFile, cleanupTemp } = require('../utils/fileSystem');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const url = (p) => (p ? `${BASE_URL}/uploads/${p}` : null);

/* ------------------------------------------------------------------ */
/* Helper: calculate discount end date (hours/minutes/seconds)        */
/* ------------------------------------------------------------------ */
const calculateDiscountEnd = (hours = 0, minutes = 0, seconds = 0) => {
  const ms = (hours * 3600 + minutes * 60 + seconds) * 1000;
  return ms > 0 ? new Date(Date.now() + ms) : null;
};

/* ------------------------------------------------------------------ */
/* GET /api/courses – list all courses (public)                       */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* GET /api/courses – برگرداندن همه بخش‌های گروه‌بندی شده در یک JSON */
/* ------------------------------------------------------------------ */
const getCourses = async (req, res) => {
  try {
    // فقط دوره‌های فعال
    const query = { status: 'active' };

    const courses = await Course.find(query)
      .populate('category', 'name')
      .populate('teacher', 'name family expertise')
      .lean();

    // تابع تبدیل دوره
    const formatCourse = (c) => ({
      ...c,
      teacherName: c.teacher ? `${c.teacher.name} ${c.teacher.family}` : 'نامشخص',
      studentCount: c.students.length,
      expertise: c.teacher?.expertise || '',
      isDiscountActive: c.isDiscountActive,
      finalPrice: c.finalPrice,
      coverImage: url(c.coverImage),
      previewVideoUrl: c.previewVideoUrl || null,
      updatedAt: c.updatedAt,
      createdAt: c.createdAt,
      chapters: c.chapters.map(ch => ({
        ...ch,
        videos: ch.videos.map(v => ({
          ...v,
          videoUrl: v.videoUrl
        }))
      }))
    });

    const formatted = courses.map(formatCourse);

    const result = {
      // 1. newest
      newest: [...formatted]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),

      // 2. Popular Coourses
      popular: [...formatted]
        .sort((a, b) => b.studentCount - a.studentCount),

      // 3.  Courses with OFF% 
      discount: formatted.filter(c => c.isDiscountActive && c.type === 'paid'),

      // 4. VIP Courses 
      vip: formatted.filter(c => c.type === 'vip'),

      // 5. paid Courses
      paid: formatted.filter(c => c.type === 'paid' && !c.isDiscountActive),

      // 6. all Courses 
      all: formatted
    };

    res.status(200).json(result);
  } catch (err) {
    console.error('Get courses error:', err);
    res.status(500).json({ message: 'خطای سرور' });
  }
};
/* ------------------------------------------------------------------ */
/* POST /api/courses – admin creates a course                         */
/* ------------------------------------------------------------------ */
const createCourse = async (req, res) => {
  try {
    const {
      title, description, category, teacher, status, level, duration,
      presentationMethod, type, price, discount,
      discountHours, discountMinutes, discountSeconds,
      previewVideoUrl
    } = req.body;

    const coverFile = req.file;

    // ---- Validation -------------------------------------------------
    if (!coverFile) {
      return res.status(400).json({ message: 'تصویر کاور الزامی است' });
    }
    if (!title || !category || !teacher || !status || !level || !duration || !presentationMethod || !type) {
      return res.status(400).json({ message: 'همه فیلدهای الزامی باید پر شوند' });
    }

    if (!['free', 'vip', 'paid'].includes(type)) {
      return res.status(400).json({ message: 'نوع دوره نامعتبر است' });
    }

    if (type === 'paid' && (!price || price < 0)) {
      return res.status(400).json({ message: 'برای دوره‌های پولی، قیمت الزامی است' });
    }

    // ---- تبدیل و اعتبارسنجی category -------------------------------
    let categoryIds = [];

    if (typeof category === 'string') {
      try {
        // اگر JSON بود: ["id1","id2"]
        if (category.trim().startsWith('[')) {
          categoryIds = JSON.parse(category);
        } 
        // اگر کاما جدا شده بود: id1,id2
        else {
          categoryIds = category.split(',').map(id => id.trim()).filter(id => id);
        }
      } catch (e) {
        return res.status(400).json({ message: 'فرمت دسته‌بندی نامعتبر است' });
      }
    } else if (Array.isArray(category)) {
      categoryIds = category;
    } else {
      return res.status(400).json({ message: 'دسته‌بندی باید آرایه یا رشته باشد' });
    }

    if (categoryIds.length === 0) {
      return res.status(400).json({ message: 'حداقل یک دسته‌بندی الزامی است' });
    }

    // تبدیل به ObjectId و اعتبارسنجی
    const objectIds = categoryIds.map(id => {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: `شناسه دسته‌بندی نامعتبر: ${id}` });
      }
      return new mongoose.Types.ObjectId(id);
    });

    // بررسی وجود در دیتابیس
    const validCategories = await Category.find({ _id: { $in: objectIds } });
    if (validCategories.length !== objectIds.length) {
      return res.status(400).json({ message: 'یک یا چند دسته‌بندی نامعتبر است' });
    }

    // ---- اعتبارسنجی مدرس -----------------------------------------
    const teacherDoc = await User.findById(teacher);
    if (!teacherDoc || teacherDoc.role !== 'teacher') {
      return res.status(400).json({ message: 'مدرس نامعتبر است' });
    }

    // ---- ایجاد دوره -------------------------------------------------
    const course = new Course({
      title: title.trim(),
      description: description?.trim() || '',
      category: objectIds, // آرایه از ObjectId
      teacher,
      status,
      level,
      duration: parseInt(duration),
      presentationMethod,
      type,
      price: type === 'paid' ? parseFloat(price) : 0,
      discount: type === 'paid' ? parseFloat(discount) || 0 : 0,
      previewVideoUrl: previewVideoUrl || null
    });

    // ---- مدیریت تخفیف ---------------------------------------------
    if (type === 'paid' && course.discount > 0) {
      const end = calculateDiscountEnd(
        parseInt(discountHours) || 0,
        parseInt(discountMinutes) || 0,
        parseInt(discountSeconds) || 0
      );
      if (!end) {
        return res.status(400).json({ message: 'مدت زمان تخفیف باید بیشتر از صفر باشد' });
      }
      course.discountEnd = end;
    }

    // ذخیره اولیه (برای داشتن _id)
    await course.save({ validateBeforeSave: false });

    // ---- ذخیره کاور -------------------------------------------------
    const basePath = path.join(__dirname, '..', 'uploads', 'courses', `course_${course._id}`);
    ensureDir(basePath);
    course.coverImage = saveFile(coverFile, basePath);

    // ---- فصل‌ها و ویدیوها -----------------------------------------
    const chapterIndices = [...new Set(
      Object.keys(req.body)
        .filter(k => k.startsWith('chapters['))
        .map(k => k.match(/chapters\[(\d+)\]/)[1])
    )].map(Number).sort((a, b) => a - b);

    const chapters = [];
    for (const chIdx of chapterIndices) {
      const videoIndices = [...new Set(
        Object.keys(req.body)
          .filter(k => k.startsWith(`chapters[${chIdx}].videos[`))
          .map(k => k.match(/videos\[(\d+)\]/)[1])
      )].map(Number).sort((a, b) => a - b);

      const videos = [];
      for (const vIdx of videoIndices) {
        const videoUrl = req.body[`chapters[${chIdx}].videos[${vIdx}].videoUrl`];
        if (!videoUrl) {
          return res.status(400).json({ message: `آدرس ویدیو ${vIdx + 1} در فصل ${chIdx + 1} الزامی است` });
        }

        videos.push({
          title: req.body[`chapters[${chIdx}].videos[${vIdx}].title`] || `ویدیو ${vIdx + 1}`,
          description: req.body[`chapters[${chIdx}].videos[${vIdx}].description`] || '',
          duration: parseInt(req.body[`chapters[${chIdx}].videos[${vIdx}].duration`] || 0),
          videoUrl
        });
      }

      chapters.push({
        title: req.body[`chapters[${chIdx}].title`] || `فصل ${chIdx + 1}`,
        description: req.body[`chapters[${chIdx}].description`] || '',
        duration: parseInt(req.body[`chapters[${chIdx}].duration`] || 0),
        videos
      });
    }

    course.chapters = chapters;
    await course.save();
    cleanupTemp();

    // ---- اطلاع‌رسانی به دانشجویان -----------------------------------
    const students = await User.find({ role: 'student' });
    const notifs = students.map(s => ({
      user: s._id,
      title: 'دوره جدید!',
      message: `دوره "${title}" توسط ${teacherDoc.name} ${teacherDoc.family} منتشر شد.`,
      type: 'course',
      relatedId: course._id
    }));
    if (notifs.length) await Notification.insertMany(notifs);

    // ---- پاسخ نهایی -------------------------------------------------
    const populatedCourse = await Course.findById(course._id)
      .populate('category', 'name')
      .populate('teacher', 'name family expertise');

    res.status(201).json(populatedCourse);

  } catch (err) {
    console.error('Create course error:', err.message);
    cleanupTemp();
    res.status(500).json({ message: 'خطای سرور', error: err.message });
  }
};


/* ------------------------------------------------------------------ */
/* PUT /api/courses/:id – admin edits a course                        */
/* ------------------------------------------------------------------ */
const editCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const coverFile = req.file;
    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: 'دوره یافت نشد' });

    const basePath = path.join(__dirname, '..', 'uploads', 'courses', `course_${course._id}`);
    ensureDir(basePath);

    // ---- آپدیت کاور -------------------------------------------------
    if (coverFile) {
      if (course.coverImage) {
        const oldPath = path.join(__dirname, '..', 'uploads', course.coverImage);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      course.coverImage = saveFile(coverFile, basePath);
    }

    // ---- آپدیت فیلدهای ساده ----------------------------------------
    const safeUpdate = (field, value, parser = v => v) => {
      if (value !== undefined && value !== '' && !Number.isNaN(value)) {
        course[field] = parser(value);
      }
    };

    safeUpdate('title', req.body.title);
    safeUpdate('status', req.body.status);
    safeUpdate('level', req.body.level);
    safeUpdate('duration', req.body.duration, parseInt);
    safeUpdate('presentationMethod', req.body.presentationMethod);
    safeUpdate('previewVideoUrl', req.body.previewVideoUrl);

    if (req.body.type && ['free', 'vip', 'paid'].includes(req.body.type)) {
      course.type = req.body.type;
    }

    if (course.type === 'paid') {
      safeUpdate('price', req.body.price, parseFloat);
      safeUpdate('discount', req.body.discount, parseFloat);

      if (course.discount > 0) {
        const end = calculateDiscountEnd(
          parseInt(req.body.discountHours) || 0,
          parseInt(req.body.discountMinutes) || 0,
          parseInt(req.body.discountSeconds) || 0
        );
        if (end) course.discountEnd = end;
      } else {
        course.discountEnd = undefined;
      }
    } else {
      course.price = undefined;
      course.discount = 0;
      course.discountEnd = undefined;
    }

    // ---- آپدیت category (آرایه) ------------------------------------
    if (req.body.category) {
      const cats = Array.isArray(req.body.category) ? req.body.category : [req.body.category];
      if (cats.length === 0) {
        return res.status(400).json({ message: 'حداقل یک دسته‌بندی الزامی است' });
      }

      const validCats = await Category.find({ _id: { $in: cats } });
      if (validCats.length !== cats.length) {
        return res.status(400).json({ message: 'یک یا چند دسته‌بندی نامعتبر است' });
      }

      course.category = cats;
    }

    if (req.body.description !== undefined && req.body.description !== '') {
      course.description = req.body.description.trim();
    }

    if (req.body.teacher) {
      const t = await User.findById(req.body.teacher);
      if (!t || t.role !== 'teacher') return res.status(400).json({ message: 'مدرس نامعتبر است' });
      course.teacher = req.body.teacher;
    }

    // ---- فصل‌ها و ویدیوها -----------------------------------------
    const chapterIndices = [...new Set(
      Object.keys(req.body)
        .filter(k => k.startsWith('chapters['))
        .map(k => k.match(/chapters\[(\d+)\]/)[1])
    )].map(Number);

    if (chapterIndices.length > 0) {
      const updatedChapters = [...course.chapters];

      for (const chIdx of chapterIndices) {
        const videoIndices = [...new Set(
          Object.keys(req.body)
            .filter(k => k.startsWith(`chapters[${chIdx}].videos[`))
            .map(k => k.match(/videos\[(\d+)\]/)[1])
        )].map(Number);

        if (!updatedChapters[chIdx]) {
          updatedChapters[chIdx] = { title: '', description: '', duration: 0, videos: [] };
        }

        const chapter = updatedChapters[chIdx];

        if (req.body[`chapters[${chIdx}].title`] !== undefined) {
          chapter.title = req.body[`chapters[${chIdx}].title`] || `فصل ${chIdx + 1}`;
        }
        if (req.body[`chapters[${chIdx}].description`] !== undefined) {
          chapter.description = req.body[`chapters[${chIdx}].description`] || '';
        }
        if (req.body[`chapters[${chIdx}].duration`] !== undefined) {
          chapter.duration = parseInt(req.body[`chapters[${chIdx}].duration`]) || 0;
        }

        const updatedVideos = [...(chapter.videos || [])];

        for (const vIdx of videoIndices) {
          const videoUrl = req.body[`chapters[${chIdx}].videos[${vIdx}].videoUrl`];
          if (!videoUrl) return res.status(400).json({ message: `آدرس ویدیو ${vIdx + 1} الزامی است` });

          if (!updatedVideos[vIdx]) {
            updatedVideos[vIdx] = { title: '', description: '', duration: 0, videoUrl: '' };
          }

          const video = updatedVideos[vIdx];
          if (req.body[`chapters[${chIdx}].videos[${vIdx}].title`] !== undefined) {
            video.title = req.body[`chapters[${chIdx}].videos[${vIdx}].title`] || `ویدیو ${vIdx + 1}`;
          }
          if (req.body[`chapters[${chIdx}].videos[${vIdx}].description`] !== undefined) {
            video.description = req.body[`chapters[${chIdx}].videos[${vIdx}].description`] || '';
          }
          if (req.body[`chapters[${chIdx}].videos[${vIdx}].duration`] !== undefined) {
            video.duration = parseInt(req.body[`chapters[${chIdx}].videos[${vIdx}].duration`]) || 0;
          }
          video.videoUrl = videoUrl;
        }

        chapter.videos = updatedVideos.filter(v => v && v.videoUrl);
      }

      course.chapters = updatedChapters.filter(ch => ch && ch.title && ch.videos.length > 0);
    }

    await course.save();
    cleanupTemp();

    res.json(course);
  } catch (err) {
    console.error('Edit course error:', err.message);
    cleanupTemp();
    res.status(500).json({ message: 'خطای سرور' });
  }
};

/* ------------------------------------------------------------------ */
/* DELETE /api/courses/:id – admin deletes a course                   */
/* ------------------------------------------------------------------ */
const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: 'دوره یافت نشد' });

    if (course.coverImage) {
      const coverPath = path.join(__dirname, '..', 'uploads', course.coverImage);
      if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
    }

    await Course.findByIdAndDelete(id);
    res.json({ message: 'دوره با موفقیت حذف شد' });
  } catch (err) {
    console.error('Delete course error:', err);
    res.status(500).json({ message: 'خطای سرور' });
  }
};

/* ------------------------------------------------------------------ */
/* Enroll, comments, video access – بدون تغییر                        */
/* ------------------------------------------------------------------ */
const enrollCourse = async (req, res) => {
  try {
    const { courseId } = req.body;
    const userId = req.user.id;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'دوره یافت نشد' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'کاربر یافت نشد' });

    if (course.students.includes(userId)) {
      return res.status(400).json({ message: 'شما قبلاً ثبت‌نام کرده‌اید' });
    }

    if (course.type === 'paid') {
      return res.status(402).json({ message: 'نیاز به پرداخت' });
    }

    if (course.type === 'vip' && user.subscription !== 'vip') {
      return res.status(403).json({ message: 'اشتراک VIP لازم است' });
    }

    course.students.push(userId);
    await course.save();

    user.coursesEnrolled.push(courseId);
    await user.save();

    res.json({ message: 'ثبت‌نام با موفقیت انجام شد' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطای سرور' });
  }
};

const addComment = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { text, rating } = req.body;
    const userId = req.user.id;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'دوره یافت نشد' });

    if (!course.students.includes(userId)) {
      return res.status(403).json({ message: 'برای نظر دادن باید در دوره ثبت‌نام کنید' });
    }

    course.comments.push({ user: userId, text, rating, status: 'pending' });
    await course.save();

    res.status(201).json({ message: 'نظر شما برای تأیید ارسال شد' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطای سرور' });
  }
};

const getComments = async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId)
      .populate('comments.user', 'name family')
      .select('comments');

    if (!course) return res.status(404).json({ message: 'دوره یافت نشد' });

    const approved = course.comments.filter(c => c.status === 'approved');
    res.json(approved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطای سرور' });
  }
};

const approveComment = async (req, res) => {
  try {
    const { courseId, commentId } = req.params;
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'دوره یافت نشد' });

    const comment = course.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: 'نظر یافت نشد' });

    if (comment.status !== 'pending') {
      return res.status(400).json({ message: 'نظر در حالت تأیید نیست' });
    }

    comment.status = 'approved';
    await course.save();
    res.json({ message: 'نظر تأیید شد' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطای سرور' });
  }
};

const getPendingComments = async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId)
      .populate('comments.user', 'name family')
      .select('comments');

    if (!course) return res.status(404).json({ message: 'دوره یافت نشد' });

    const pending = course.comments.filter(c => c.status === 'pending');
    res.json(pending);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطای سرور' });
  }
};

/* ------------------------------------------------------------------ */
/* GET /:courseId/chapters/:chapterId/videos/:videoId – access check  */
/* ------------------------------------------------------------------ */
const accessCourseVideo = async (req, res) => {
  try {
    const { courseId, chapterId, videoId } = req.params;
    const userId = req.user?._id;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'دوره یافت نشد' });

    const chapter = course.chapters.id(chapterId);
    if (!chapter) return res.status(404).json({ message: 'فصل یافت نشد' });

    const video = chapter.videos.id(videoId);
    if (!video) return res.status(404).json({ message: 'ویدیو یافت نشد' });

    const isFirst = chapter.videos[0]._id.toString() === videoId;

    if (isFirst) {
      return res.json({ video: { ...video.toObject(), accessible: true } });
    }

    if (!userId) return res.status(401).json({ message: 'ورود به سیستم الزامی است' });

    if (!course.students.includes(userId)) {
      return res.status(403).json({ message: 'شما در این دوره ثبت‌نام نکرده‌اید' });
    }

    if (course.type === 'vip') {
      const user = await User.findById(userId);
      const hasVip = user.subscription === 'vip' && new Date() <= user.subscriptionExpiresAt;
      if (!hasVip) return res.status(403).json({ message: 'اشتراک VIP لازم است' });
    }

    res.json({ video: { ...video.toObject(), accessible: true } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطای سرور' });
  }
};

module.exports = {
  getCourses,
  createCourse,
  editCourse,
  deleteCourse,
  enrollCourse,
  addComment,
  getComments,
  approveComment,
  getPendingComments,
  accessCourseVideo
};