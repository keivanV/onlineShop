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
/* Helper: Update Teacher Rating                                      */
/* ------------------------------------------------------------------ */
const updateTeacherRating = async (teacherId) => {
  try {
    const taughtCourses = await Course.find({ teacher: teacherId, status: 'active' })
      .select('courseRating courseRatingCount');

    let totalRating = 0;
    let totalCount = 0;

    taughtCourses.forEach(c => {
      if (c.courseRatingCount > 0) {
        totalRating += c.courseRating * c.courseRatingCount;
        totalCount += c.courseRatingCount;
      }
    });

    const teacherRating = totalCount > 0 ? Number((totalRating / totalCount).toFixed(2)) : 0;

    await User.findByIdAndUpdate(teacherId, { rating: teacherRating });
  } catch (err) {
    console.error('Error updating teacher rating:', err);
  }
};


const formatFullCourse = async (courseDoc, currentUserId = null) => {
  const course = await Course.populate(courseDoc, [
    { path: 'teacher', select: 'name expertise bio rating profilePic phone email' },
    { path: 'students', select: 'name profilePic email' },
    { path: 'comments.user', select: 'name profilePic' },
    { path: 'category', select: 'name slug' }
  ]);

  const isEnrolled = currentUserId 
    ? course.students.some(s => s._id.toString() === currentUserId)
    : false;

  const approvedComments = (course.comments || [])
    .filter(c => c.status === 'approved')
    .map(c => ({
      _id: c._id.toString(),
      text: c.text,
      rating: c.rating,
      createdAt: c.createdAt,
      user: {
        _id: c.user?._id?.toString(),
        name: c.user?.name || 'ناشناس',
        profilePic: c.user?.profilePic ? url(c.user.profilePic) : null
      }
    }));

  const isLimited = course.isLimitedCapacity;
  const remaining = course.remainingCapacity;

  return {
    _id: course._id.toString(),
    title: course.title,
    slug: course.slug || course._id.toString(),
    description: course.description,
    coverImage: url(course.coverImage),
    previewVideoUrl: course.previewVideoUrl ? url(course.previewVideoUrl) : null,

    teacher: course.teacher ? {
      _id: course.teacher._id.toString(),
      name: course.teacher.name?.trim() || 'نامشخص',
      expertise: course.teacher.expertise || '',
      bio: course.teacher.bio || '',
      rating: Number(course.teacher.rating || 0).toFixed(1),
      profilePic: course.teacher.profilePic ? url(course.teacher.profilePic) : null,
      phone: course.teacher.phone || null,
      email: course.teacher.email || null
    } : null,

    category: course.category.map(cat => ({
      _id: cat._id.toString(),
      name: cat.name,
      slug: cat.slug
    })),

    level: course.level,
    type: course.type,
    duration: course.duration,
    presentationMethod: course.presentationMethod,

    price: course.price || 0,
    discount: course.discount || 0,
    discountEnd: course.discountEnd,
    finalPrice: course.finalPrice,
    isDiscountActive: course.isDiscountActive,

    status: course.status,
    displayStatus: course.displayStatus,

    canEnroll: course.canEnroll,
    isEnrolled,
    isFull: course.isFull,
    isSoldOut: course.status === 'sold-out' || course.isFull,

    isLimitedCapacity: isLimited,         
    capacity: course.capacity,             
    studentCount: course.students.length, 
    remainingCapacity: remaining,          

    students: course.students.map(s => ({
      _id: s._id.toString(),
      name: s.name,
      profilePic: s.profilePic ? url(s.profilePic) : null,
      email: s.email || null
    })),

    registrationStart: course.registrationStart,
    registrationEnd: course.registrationEnd,
    courseStartDate: course.courseStartDate,
    courseEndDate: course.courseEndDate,

    chapters: course.chapters.map(ch => ({
      _id: ch._id.toString(),
      title: ch.title,
      description: ch.description || '',
      duration: ch.duration,
      videos: ch.videos.map(v => ({
        _id: v._id.toString(),
        title: v.title,
        description: v.description || '',
        duration: v.duration,
        videoUrl: v.videoUrl
      }))
    })),

    chapterCount: course.chapters.length,
    videoCount: course.chapters.reduce((sum, ch) => sum + ch.videos.length, 0),

    comments: approvedComments,
    pendingCommentsCount: course.comments.filter(c => c.status === 'pending').length,
    rating: Number(course.courseRating || 0).toFixed(1),
    ratingCount: course.courseRatingCount || 0,

    createdAt: course.createdAt,
    updatedAt: course.updatedAt
  };
};

/* ------------------------------------------------------------------ */
/* GET /api/courses – list all courses (public)                       */
/* ------------------------------------------------------------------ */
const getCourses = async (req, res) => {
  try {
    const userId = req.user?._id?.toString();

    // حذف .lean() ← این خط حیاتیه!
    const courses = await Course.find({ status: { $nin: ['stopped'] } })
      .populate('teacher', 'name expertise bio rating profilePic phone email')
      .populate('students', 'name profilePic email')
      .populate('comments.user', 'name profilePic')
      .populate('category', 'name slug');
      // .lean() رو حذف کردیم → virtualها کار می‌کنن

    const formatted = await Promise.all(
      courses.map(course => formatFullCourse(course, userId))
    );

    res.json({
      newest: [...formatted].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      popular: [...formatted].sort((a, b) => b.studentCount - a.studentCount),
      discount: formatted.filter(c => c.isDiscountActive && c.type === 'paid'),
      vip: formatted.filter(c => c.type === 'vip'),
      paid: formatted.filter(c => c.type === 'paid'),
      free: formatted.filter(c => c.type === 'free'),
      all: formatted
    });
  } catch (err) {
    console.error('getCourses error:', err);
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

    await User.findByIdAndUpdate(teacher, {
      $addToSet: { coursesTaught: course._id }
    });


    cleanupTemp();

    // ---- اطلاع‌رسانی به دانشجویان -----------------------------------
    const students = await User.find({ role: 'student' });
    const notifs = students.map(s => ({
      user: s._id,
      title: 'دوره جدید!',
      message: `دوره "${title}" توسط ${teacherDoc.name} منتشر شد.`,
      type: 'course',
      relatedId: course._id
    }));
    if (notifs.length) await Notification.insertMany(notifs);

    // ---- پاسخ نهایی -------------------------------------------------
    const populatedCourse = await Course.findById(course._id)
      .populate('category', 'name')
      .populate('teacher', 'name  expertise');

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

    // --- آپدیت کاور (فقط اگر فایل ارسال شده بود) ---
    if (coverFile) {
      if (course.coverImage) {
        const oldPath = path.join(__dirname, '..', 'uploads', course.coverImage);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      course.coverImage = saveFile(coverFile, basePath);
    }

    // --- آپدیت فیلدهای ساده (فقط اگر مقدار معتبر داشت) ---
    const safeUpdate = (field, value, parser = v => v) => {
      if (value !== undefined && value !== null && value !== '' && !Number.isNaN(value)) {
        course[field] = parser(value);
      }
    };

    safeUpdate('title', req.body.title);
    safeUpdate('status', req.body.status);
    safeUpdate('level', req.body.level);
    safeUpdate('duration', req.body.duration, parseInt);
    safeUpdate('presentationMethod', req.body.presentationMethod);
    safeUpdate('previewVideoUrl', req.body.previewVideoUrl);

    // --- نوع دوره ---
    if (req.body.type && ['free', 'vip', 'paid'].includes(req.body.type)) {
      course.type = req.body.type;
    }

    // --- قیمت و تخفیف (فقط برای دوره‌های پولی) ---
    if (course.type === 'paid') {
      safeUpdate('price', req.body.price, parseFloat);
      safeUpdate('discount', req.body.discount, parseFloat);

      // تخفیف فقط اگر مقدارش تغییر کرده باشه
      if (req.body.discount !== undefined) {
        const discountValue = parseFloat(req.body.discount);
        if (discountValue > 0) {
          const end = calculateDiscountEnd(
            parseInt(req.body.discountHours) || 0,
            parseInt(req.body.discountMinutes) || 0,
            parseInt(req.body.discountSeconds) || 0
          );
          course.discountEnd = end || undefined;
        } else {
          course.discountEnd = undefined;
        }
      }
    } else if (req.body.type && req.body.type !== 'paid') {
      course.price = undefined;
      course.discount = 0;
      course.discountEnd = undefined;
    }

    // --- توضیحات دوره ---
    if (req.body.description !== undefined && req.body.description !="") {
      course.description = req.body.description?.trim() || '';
    }

    // --- دسته‌بندی ---
    if (req.body.category !== undefined) {
      let cats = [];
      if (typeof req.body.category === 'string') {
        try {
          cats = req.body.category.trim().startsWith('[')
            ? JSON.parse(req.body.category)
            : req.body.category.split(',').map(id => id.trim()).filter(Boolean);
        } catch (e) {
          return res.status(400).json({ message: 'فرمت دسته‌بندی نامعتبر است' });
        }
      } else if (Array.isArray(req.body.category)) {
        cats = req.body.category.filter(Boolean);
      }

      if (cats.length > 0) {
        const validCats = await Category.find({ _id: { $in: cats } });
        if (validCats.length !== cats.length) {
          return res.status(400).json({ message: 'یک یا چند دسته‌بندی نامعتبر است' });
        }
        course.category = cats;
      }
    }

    // --- مدرس ---
    if (req.body.teacher && req.body.teacher !== course.teacher.toString()) {
      const newTeacher = await User.findById(req.body.teacher);
      if (!newTeacher || newTeacher.role !== 'teacher') {
        return res.status(400).json({ message: 'مدرس نامعتبر است' });
      }
      await User.findByIdAndUpdate(course.teacher, { $pull: { coursesTaught: course._id } });
      await User.findByIdAndUpdate(req.body.teacher, { $addToSet: { coursesTaught: course._id } });
      course.teacher = req.body.teacher;
    }

    // --- ظرفیت دوره (کاملاً ایمن) ---
    if (req.body.capacity !== undefined && req.body.capacity !== null && req.body.capacity !== '') {
      const newCapacity = parseInt(req.body.capacity);
      if (!isNaN(newCapacity) && newCapacity >= 0) {
        course.capacity = newCapacity;
      }
    }

    // --- فصل‌ها و ویدیوها (ضد Swagger empty value!) ---
    const chapterIndices = [...new Set(
      Object.keys(req.body)
        .filter(k => k.startsWith('chapters[') && k.includes('].title'))
        .map(k => k.match(/chapters\[(\d+)\]/)[1])
    )].map(Number);

    if (chapterIndices.length > 0) {
      const updatedChapters = [...course.chapters];

      for (const chIdx of chapterIndices) {
        const chapterTitle = req.body[`chapters[${chIdx}].title`];
        // اگر عنوان فصل خالی یا وجود نداشت → این فصل ویرایش نشده
        if (!chapterTitle || chapterTitle.trim() === '') continue;

        if (!updatedChapters[chIdx]) {
          updatedChapters[chIdx] = { title: '', description: '', duration: 0, videos: [] };
        }

        const chapter = updatedChapters[chIdx];
        chapter.title = chapterTitle.trim();
        chapter.description = req.body[`chapters[${chIdx}].description`]?.trim() || '';
        chapter.duration = parseInt(req.body[`chapters[${chIdx}].duration`]) || 0;

        const videoIndices = [...new Set(
          Object.keys(req.body)
            .filter(k => k.startsWith(`chapters[${chIdx}].videos[`) && k.includes('].videoUrl'))
            .map(k => k.match(/videos\[(\d+)\]/)[1])
        )].map(Number);

        const updatedVideos = [...(chapter.videos || [])];

        for (const vIdx of videoIndices) {
          const videoUrl = req.body[`chapters[${chIdx}].videos[${vIdx}].videoUrl`];
          // اگر videoUrl خالی بود → این ویدیو ویرایش نشده
          if (!videoUrl || videoUrl.trim() === '') continue;

          if (!updatedVideos[vIdx]) updatedVideos[vIdx] = {};

          const video = updatedVideos[vIdx];
          video.title = req.body[`chapters[${chIdx}].videos[${vIdx}].title`]?.trim() || `ویدیو ${vIdx + 1}`;
          video.description = req.body[`chapters[${chIdx}].videos[${vIdx}].description`]?.trim() || '';
          video.duration = parseInt(req.body[`chapters[${chIdx}].videos[${vIdx}].duration`]) || 0;
          video.videoUrl = videoUrl.trim();
        }

        chapter.videos = updatedVideos.filter(v => v && v.videoUrl && v.videoUrl.trim() !== '');
      }

      course.chapters = updatedChapters.filter(ch => ch && ch.title && ch.videos?.length > 0);
    }

    // ذخیره نهایی — pre-save hook خودش isFull و remainingCapacity رو آپدیت می‌کنه
    await course.save();
    cleanupTemp();

    // پاسخ با virtual ها
    const populated = await Course.findById(course._id)
      .populate('teacher', 'name expertise rating')
      .populate('category', 'name');

    res.json(populated);

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
    const userId = req.user._id;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'دوره یافت نشد' });

    if (course.students.some(s => s.toString() === userId.toString())) {
      return res.status(400).json({ message: 'شما قبلاً ثبت‌نام کرده‌اید' });
    }

    if (!course.canEnroll) {
      return res.status(400).json({
        message: course.isFull ? 'ظرفیت دوره تکمیل شده است' : 'مهلت ثبت‌نام به پایان رسیده',
        isFull: course.isFull,
        remainingCapacity: course.remainingCapacity
      });
    }

    if (course.type === 'paid') {
      return res.status(402).json({ message: 'نیاز به پرداخت' });
    }

    if (course.type === 'vip') {
      const user = await User.findById(userId);
      if (user.subscription !== 'vip' || new Date() > user.subscriptionExpiresAt) {
        return res.status(403).json({ message: 'اشتراک VIP فعال لازم است' });
      }
    }

    course.students.push(userId);
    await course.save(); // pre-save خودش status رو آپدیت می‌کنه

    await User.findByIdAndUpdate(userId, { $addToSet: { coursesEnrolled: courseId } });

    res.json({ message: 'ثبت‌نام با موفقیت انجام شد' });
  } catch (err) {
    console.error('enrollCourse error:', err);
    res.status(500).json({ message: 'خطای سرور' });
  }
};


const addComment = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { text, rating } = req.body;
    const userId = req.user.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'امتیاز باید بین ۱ تا ۵ باشد' });
    }

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'دوره یافت نشد' });

    if (!course.students.includes(userId)) {
      return res.status(403).json({ message: 'برای نظر دادن باید در دوره ثبت‌نام کنید' });
    }

    // جلوگیری از نظر دادن دوباره
    const existingComment = course.comments.find(c =>
      c.user.toString() === userId && c.status !== 'rejected'
    );
    if (existingComment) {
      return res.status(400).json({ message: 'شما قبلاً نظر داده‌اید' });
    }

    course.comments.push({
      user: userId,
      text: text.trim(),
      rating: parseInt(rating),
      status: 'pending'
    });

    await course.save();
    res.status(201).json({ message: 'نظر شما برای تأیید ارسال شد' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطای سرور' });
  }
};

/* ------------------------------------------------------------------ */
/* Get Comments                                                       */
/* ------------------------------------------------------------------ */
const getComments = async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId)
      .populate('comments.user', 'name  profilePic')
      .select('comments courseRating courseRatingCount');

    if (!course) return res.status(404).json({ message: 'دوره یافت نشد' });

    const approved = course.comments
      .filter(c => c.status === 'approved')
      .map(c => ({
        commentId: c._id,
        text: c.text,
        rating: c.rating,
        user: {
          name: `${c.user.name} `,
          profilePic: c.user.profilePic ? url(c.user.profilePic) : null
        },
        createdAt: c.createdAt
      }));

    res.json({
      comments: approved,
      courseRating: course.courseRating || 0,
      courseRatingCount: course.courseRatingCount || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطای سرور' });
  }
};
/* ------------------------------------------------------------------ */
/* Approve Comment + Update Ratings                                   */
/* ------------------------------------------------------------------ */
const approveComment = async (req, res) => {
  try {
    const { courseId, commentId } = req.params;
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'دوره یافت نشد' });

    const comment = course.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: 'نظر یافت نشد' });

    if (comment.status !== 'pending') {
      return res.status(400).json({ message: 'نظر قبلاً بررسی شده' });
    }

    comment.status = 'approved';

    // محاسبه rating دوره
    const approvedComments = course.comments.filter(c => c.status === 'approved');
    const totalRating = approvedComments.reduce((sum, c) => sum + c.rating, 0);
    const ratingCount = approvedComments.length;

    course.courseRating = ratingCount > 0 ? Number((totalRating / ratingCount).toFixed(2)) : 0;
    course.courseRatingCount = ratingCount;

    await course.save();

    // بروزرسانی rating مدرس
    await updateTeacherRating(course.teacher);

    res.json({
      message: 'نظر تأیید شد',
      courseRating: course.courseRating,
      courseRatingCount: course.courseRatingCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطای سرور' });
  }
};

const getPendingComments = async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId)
      .populate('comments.user', 'name')
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

const searchCourses = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.status(400).json({ message: 'حداقل ۲ کاراکتر وارد کنید' });

    const regex = new RegExp(q.trim(), 'i');
    const userId = req.user?._id?.toString();

    const courses = await Course.find({
      status: { $nin: ['stopped'] },
      $or: [
        { title: regex },
        { description: regex },
        { 'teacher.name': regex },
        { 'category.name': regex }
      ]
    })
      .populate('teacher', 'name expertise bio rating profilePic')
      .populate('category', 'name slug')
      .limit(8)
      .sort({ createdAt: -1 });

    const suggestions = await Promise.all(
      courses.map(async (course) => {
        const formatted = await formatFullCourse(course, userId);
        const firstVideo = course.chapters?.[0]?.videos?.[0];
        if (firstVideo) {
          formatted.firstVideo = {
            _id: firstVideo._id.toString(),
            title: firstVideo.title,
            duration: firstVideo.duration,
            videoUrl: firstVideo.videoUrl,
            accessible: true
          };
        }
        return formatted;
      })
    );

    res.json({
      success: true,
      query: q.trim(),
      count: suggestions.length,
      suggestions
    });
  } catch (err) {
    console.error('searchCourses error:', err);
    res.status(500).json({ message: 'خطا در جستجو' });
  }
};

const filterCourses = async (req, res) => {
  try {
    const {
      sort = 'newest', search = '', freeCourse, onlyDiscount,
      type, category, level, page = 1, limit = 12
    } = req.query;

    const query = { status: { $nin: ['stopped'] } };
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const userId = req.user?._id?.toString();

    if (search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ title: regex }, { description: regex }];
    }
    if (freeCourse === 'true') query.type = 'free';
    if (freeCourse === 'false') query.type = { $in: ['paid', 'vip'] };
    if (onlyDiscount === 'true') {
      query.discount = { $gt: 0 };
      query.discountEnd = { $gt: new Date() };
    }
    if (type) {
      const types = type.split(',').map(t => t.trim()).filter(Boolean);
      if (types.length) query.type = { $in: types };
    }
    if (category) {
      const cats = category.split(',').map(c => c.trim()).filter(Boolean);
      if (cats.length) {
        const catDocs = await Category.find({ slug: { $in: cats } }).select('_id');
        query.category = { $in: catDocs.map(c => c._id) };
      }
    }
    if (level) query.level = level;

    const sortOptions = {
      newest: { createdAt: -1 },
      popular: { 'students.length': -1 },
      price_asc: { finalPrice: 1 },
      price_desc: { finalPrice: -1 }
    };

    const courses = await Course.find(query)
      .populate('teacher', 'name expertise bio rating profilePic')
      .populate('category', 'name slug')
      .sort(sortOptions[sort] || { createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Course.countDocuments(query);
    const formatted = await Promise.all(courses.map(c => formatFullCourse(c, userId)));

    res.json({
      courses: formatted,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalCourses: total,
        hasNext: skip + courses.length < total,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    console.error('filterCourses error:', err);
    res.status(500).json({ message: 'خطای سرور در فیلتر' });
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
  accessCourseVideo,
  searchCourses,
  filterCourses
};