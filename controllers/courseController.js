const Course = require('../models/Course');
const Category = require('../models/Category');
const User = require('../models/User');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const {
  ensureDir,
  generateCourseFolder,
  getCourseBasePath,
  deleteFolderRecursive,
  cleanupTemp
} = require('../utils/fileSystem');

/* ------------------------------------------------------------------ */
/* Helper: Save file and return relative path                         */
/* ------------------------------------------------------------------ */
const saveFile = (file, destFolder) => {
  if (!file) return null;
  ensureDir(destFolder);
  const fileName = `${Date.now()}_${file.originalname}`;
  const filePath = path.join(destFolder, fileName);
  fs.renameSync(file.path, filePath);
  return path.relative(path.join(__dirname, '..', 'uploads'), filePath).replace(/\\/g, '/');
};

/* ------------------------------------------------------------------ */
/* Helper: Calculate discount end date                                */
/* ------------------------------------------------------------------ */
const calculateDiscountEnd = (hours = 0, minutes = 0, seconds = 0) => {
  const ms = (hours * 3600 + minutes * 60 + seconds) * 1000;
  return ms > 0 ? new Date(Date.now() + ms) : null;
};

/* ------------------------------------------------------------------ */
/* GET /courses                                                       */
/* ------------------------------------------------------------------ */
const getCourses = async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status && ['active', 'pending', 'pre-register'].includes(status)) {
      query.status = status;
    }

    const courses = await Course.find(query)
      .populate('category', 'name')
      .populate('teacher', 'name family expertise')
      .lean();

    const formatted = courses.map(c => ({
      ...c,
      teacherName: c.teacher ? `${c.teacher.name} ${c.teacher.family}` : 'Unknown',
      studentCount: c.students.length,
      expertise: c.teacher?.expertise || '',
      isDiscountActive: c.isDiscountActive,
      finalPrice: c.finalPrice,
      coverImage: `${process.env.BASE_URL || 'http://localhost:5000'}/uploads/${c.coverImage}`,
      previewVideo: c.previewVideo ? `${process.env.BASE_URL || 'http://localhost:5000'}/uploads/${c.previewVideo}` : null,
      chapters: c.chapters.map(ch => ({
        ...ch,
        videos: ch.videos.map(v => ({
          ...v,
          fileUrl: `${process.env.BASE_URL || 'http://localhost:5000'}/uploads/${v.filePath}`
        }))
      }))
    }));

    res.status(200).json(formatted);
  } catch (err) {
    console.error('Get courses error:', err);
    res.status(500).json({ message: 'Error fetching courses' });
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/courses – admin only (FIXED: No validation error)       */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* POST /api/courses – admin only (FIXED: No validation error + syntax) */
/* ------------------------------------------------------------------ */
const createCourse = async (req, res) => {
  try {
    // ---------- 1. Basic fields ----------
    const {
      title, category, teacher, status, level, duration,
      presentationMethod, type, price, discount,
      discountHours, discountMinutes, discountSeconds
    } = req.body;

    // ---------- 2. Main files ----------
    const coverFile   = req.files.find(f => f.fieldname === 'coverImage');
    const previewFile = req.files.find(f => f.fieldname === 'previewVideo');

    // ---------- 3. Validation ----------
    if (!coverFile || !title || !category || !teacher || !status || !level ||
        !duration || !presentationMethod || !type) {
      cleanupTemp();
      return res.status(400).json({ message: 'All required fields must be provided' });
    }
    if (!['free', 'vip', 'paid'].includes(type)) {
      cleanupTemp();
      return res.status(400).json({ message: 'Invalid course type' });
    }
    if (type === 'paid' && (!price || price < 0)) {
      cleanupTemp();
      return res.status(400).json({ message: 'Price required for paid courses' });
    }

    const cat = await Category.findById(category);
    if (!cat) { cleanupTemp(); return res.status(400).json({ message: 'Invalid category' }); }

    const teacherDoc = await User.findById(teacher);
    if (!teacherDoc || teacherDoc.role !== 'teacher') {
      cleanupTemp();
      return res.status(400).json({ message: 'Invalid teacher' });
    }
    const teacherName = `${teacherDoc.name} ${teacherDoc.family}`;

    // ---------- 4. Create course with MINIMAL required fields ----------
    const course = new Course({
      title,
      category,
      teacher,
      status,
      level,
      duration,
      presentationMethod,
      type,
      price: type === 'paid' ? price : undefined,
      discount: type === 'paid' ? (discount || 0) : 0,
      // courseFolder, coverImage, previewVideo, chapters → set later
    });

    // Discount handling
    if (type === 'paid' && discount > 0) {
      const end = calculateDiscountEnd(discountHours, discountMinutes, discountSeconds);
      if (!end) {
        cleanupTemp();
        return res.status(400).json({ message: 'Discount duration must be > 0' });
      }
      course.discountEnd = end;
    }

    // ---------- 5. Save FIRST (bypass validation) ----------
    await course.save({ validateBeforeSave: false });

    // ---------- 6. Generate folder using REAL course._id ----------
    const courseFolder = generateCourseFolder(course._id);
    const basePath = getCourseBasePath(courseFolder);
    ensureDir(path.join(basePath, 'chapters'));
    ensureDir(path.join(basePath, 'download'));

    // Update course with real folder
    course.courseFolder = courseFolder;
    course.downloadFolder = `courses/${courseFolder}/download`; // درست شد!

    // ---------- 7. Save cover & preview ----------
    const coverPath = saveFile(coverFile, basePath);
    const previewPath = previewFile ? saveFile(previewFile, basePath) : null;

    course.coverImage = coverPath;
    course.previewVideo = previewPath;

    // ---------- 8. Process chapters & videos ----------
    const videoFiles = req.files.filter(f => f.fieldname.includes('.file'));
    const videoMap = {};
    videoFiles.forEach(f => {
      const m = f.fieldname.match(/chapters\[(\d+)\]\.videos\[(\d+)\]\.file/);
      if (m) videoMap[`${m[1]}-${m[2]}`] = f;
    });

    const chapterIndices = [...new Set(
      Object.keys(req.body)
        .filter(k => k.startsWith('chapters['))
        .map(k => k.match(/chapters\[(\d+)\]/)[1])
    )].map(Number).sort((a, b) => a - b);

    const chapters = [];

    for (const chIdx of chapterIndices) {
      const chapterFolder = path.join(basePath, 'chapters', `chapter_${chIdx + 1}`);
      ensureDir(chapterFolder);

      const videoIndices = [...new Set(
        Object.keys(req.body)
          .filter(k => k.startsWith(`chapters[${chIdx}].videos[`))
          .map(k => k.match(/videos\[(\d+)\]/)[1])
      )].map(Number).sort((a, b) => a - b);

      const videos = [];
      for (const vIdx of videoIndices) {
        const key = `${chIdx}-${vIdx}`;
        const file = videoMap[key];
        if (!file) continue;

        const relPath = saveFile(file, chapterFolder);
        videos.push({
          title:       req.body[`chapters[${chIdx}].videos[${vIdx}].title`] || `Video ${vIdx + 1}`,
          description: req.body[`chapters[${chIdx}].videos[${vIdx}].description`] || '',
          duration:    parseInt(req.body[`chapters[${chIdx}].videos[${vIdx}].duration`] || 0, 10),
          time:        req.body[`chapters[${chIdx}].videos[${vIdx}].time`] || '',
          filePath:    relPath
        });
      }

      chapters.push({
        title:       req.body[`chapters[${chIdx}].title`] || `Chapter ${chIdx + 1}`,
        duration:    parseInt(req.body[`chapters[${chIdx}].duration`] || 0, 10),
        description: req.body[`chapters[${chIdx}].description`] || '',
        folderPath:  `courses/${courseFolder}/chapters/chapter_${chIdx + 1}`,
        videos
      });
    }

    course.chapters = chapters;

    // ---------- 9. Final save (with all required fields) ----------
    await course.save(); // Validation passes now!

    // ---------- 10. Notify students ----------
    const students = await User.find({ role: 'student' });
    const notifs = students.map(s => ({
      user: s._id,
      title: 'دوره جدید!',
      message: `دوره "${title}" توسط ${teacherName} منتشر شد.`,
      type: 'course',
      relatedId: course._id
    }));
    if (notifs.length) await Notification.insertMany(notifs);

    // ---------- 11. Cleanup temp ----------
    cleanupTemp();

    res.status(201).json(course);
  } catch (err) {
    console.error('Create course error:', err);
    cleanupTemp();
    res.status(500).json({ message: 'Server error while creating course' });
  }
};

/* ------------------------------------------------------------------ */
/* PUT /courses/:id (admin only) – FULLY FIXED & DYNAMIC + DELETE OLD FILE */
/* ------------------------------------------------------------------ */
const editCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title, category, teacher, status, level, duration,
      presentationMethod, type, price, discount,
      discountHours, discountMinutes, discountSeconds
    } = req.body;

    const coverFile = req.files?.coverImage?.[0];
    const previewFile = req.files?.previewVideo?.[0];

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const basePath = getCourseBasePath(course.courseFolder);
    ensureDir(path.join(basePath, 'chapters'));
    ensureDir(path.join(basePath, 'download'));

    // ------------------- COVER & PREVIEW -------------------
    if (coverFile) course.coverImage = saveFile(coverFile, basePath);
    if (previewFile) course.previewVideo = saveFile(previewFile, basePath);

    // ------------------- TEXT FIELDS (use old if not sent or empty) -------------------
    course.title = (title !== undefined && title !== '') ? title : course.title;
    course.status = (status !== undefined && status !== '') ? status : course.status;
    course.level = (level !== undefined && level !== '') ? level : course.level;
    course.duration = (duration !== undefined && duration !== '') ? parseInt(duration, 10) : course.duration;
    course.presentationMethod = (presentationMethod !== undefined && presentationMethod !== '') 
      ? presentationMethod 
      : course.presentationMethod;

    // ------------------- TYPE -------------------
    if (type !== undefined && type !== '') {
      if (!['free', 'vip', 'paid'].includes(type)) {
        return res.status(400).json({ message: 'Invalid course type' });
      }
      course.type = type;
    }

    // ------------------- PRICE -------------------
    if (course.type === 'paid') {
      const newPrice = (price !== undefined && price !== '' && price >= 0) ? parseInt(price, 10) : course.price;
      course.price = newPrice;
    } else {
      course.price = undefined;
    }

    // ------------------- DISCOUNT -------------------
    if (course.type === 'paid') {
      const newDiscount = (discount !== undefined && discount !== '' && discount >= 0) 
        ? parseInt(discount, 10) 
        : course.discount;

      course.discount = newDiscount;

      if (newDiscount > 0) {
        const hours = (discountHours !== undefined && discountHours !== '') ? parseInt(discountHours, 10) : 0;
        const minutes = (discountMinutes !== undefined && discountMinutes !== '') ? parseInt(discountMinutes, 10) : 0;
        const seconds = (discountSeconds !== undefined && discountSeconds !== '') ? parseInt(discountSeconds, 10) : 0;

        const end = calculateDiscountEnd(hours, minutes, seconds);
        if (!end) {
          return res.status(400).json({ message: 'Discount duration must be > 0' });
        }
        course.discountEnd = end;
      } else {
        course.discountEnd = undefined;
      }
    } else {
      course.discount = 0;
      course.discountEnd = undefined;
    }

    // ------------------- CATEGORY (MOST IMPORTANT FIX!) -------------------
    if (category !== undefined && category !== '') {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({ message: 'Invalid category ID format' });
      }
      const cat = await Category.findById(category);
      if (!cat) return res.status(400).json({ message: 'Category not found' });
      course.category = category;
    }
    // اگر category خالی یا ارسال نشده → از قبلی استفاده می‌شود

    // ------------------- TEACHER -------------------
    if (teacher !== undefined && teacher !== '') {
      if (!mongoose.Types.ObjectId.isValid(teacher)) {
        return res.status(400).json({ message: 'Invalid teacher ID format' });
      }
      const t = await User.findById(teacher);
      if (!t || t.role !== 'teacher') return res.status(400).json({ message: 'Invalid teacher' });
      course.teacher = teacher;
    }
    // اگر teacher خالی یا ارسال نشده → از قبلی استفاده می‌شود

    // ------------------- CHAPTERS & VIDEOS (همان قبلی) -------------------
    const chapterIndices = [...new Set(
      Object.keys(req.body)
        .filter(k => k.startsWith('chapters['))
        .map(k => k.match(/chapters\[(\d+)\]/)[1])
    )].map(Number).sort((a, b) => a - b);

    if (chapterIndices.length > 0) {
      const videoFiles = req.files.filter(f => f.fieldname.includes('.file')) || [];
      const videoMap = {};
      videoFiles.forEach(f => {
        const m = f.fieldname.match(/chapters\[(\d+)\]\.videos\[(\d+)\]\.file/);
        if (m) videoMap[`${m[1]}-${m[2]}`] = f;
      });

      const newChapters = [];

      for (const chIdx of chapterIndices) {
        const chapterFolder = path.join(basePath, 'chapters', `chapter_${chIdx + 1}`);
        ensureDir(chapterFolder);

        const videoIndices = [...new Set(
          Object.keys(req.body)
            .filter(k => k.startsWith(`chapters[${chIdx}].videos[`))
            .map(k => k.match(/videos\[(\d+)\]/)[1])
        )].map(Number).sort((a, b) => a - b);

        const videos = [];
        for (const vIdx of videoIndices) {
          const key = `${chIdx}-${vIdx}`;
          const file = videoMap[key];
          const oldVideo = course.chapters[chIdx]?.videos[vIdx];

          let filePath = oldVideo?.filePath || null;

          // حذف فایل قدیمی فقط اگر فایل جدید آپلود شده باشد
          if (file && oldVideo?.filePath) {
            const oldFileFullPath = path.join(__dirname, '..', 'uploads', oldVideo.filePath);
            if (fs.existsSync(oldFileFullPath)) {
              try {
                fs.unlinkSync(oldFileFullPath);
                console.log(`Deleted old video: ${oldVideo.filePath}`);
              } catch (err) {
                console.warn(`Failed to delete old video: ${oldVideo.filePath}`, err);
              }
            }
          }

          if (file) {
            filePath = saveFile(file, chapterFolder);
          }

          if (!filePath && !oldVideo) {
            cleanupTemp();
            return res.status(400).json({
              message: `Video file is required for chapters[${chIdx}].videos[${vIdx}]`
            });
          }

          videos.push({
            title:       (req.body[`chapters[${chIdx}].videos[${vIdx}].title`] ?? oldVideo?.title) || `Video ${vIdx + 1}`,
            description: req.body[`chapters[${chIdx}].videos[${vIdx}].description`] ?? oldVideo?.description ?? '',
            duration:    parseInt(req.body[`chapters[${chIdx}].videos[${vIdx}].duration`] ?? oldVideo?.duration ?? 0, 10),
            time:        req.body[`chapters[${chIdx}].videos[${vIdx}].time`] ?? oldVideo?.time ?? '',
            filePath
          });
        }

        newChapters.push({
          title:       (req.body[`chapters[${chIdx}].title`] ?? course.chapters[chIdx]?.title) || `Chapter ${chIdx + 1}`,
          duration:    parseInt(req.body[`chapters[${chIdx}].duration`] ?? course.chapters[chIdx]?.duration ?? 0, 10),
          description: req.body[`chapters[${chIdx}].description`] ?? course.chapters[chIdx]?.description ?? '',
          folderPath:  `courses/${course.courseFolder}/chapters/chapter_${chIdx + 1}`,
          videos
        });
      }

      // ترکیب فصل‌های جدید با قبلی‌ها
      const updatedChapters = course.chapters.map((ch, i) => {
        const updated = newChapters.find(nc => nc.folderPath.includes(`chapter_${i + 1}`));
        return updated || ch;
      });

      // اضافه کردن فصل‌های جدید
      const maxExisting = course.chapters.length;
      for (let i = maxExisting; i < newChapters.length; i++) {
        updatedChapters.push(newChapters[i]);
      }

      course.chapters = updatedChapters;
    }

    // ------------------- FINAL SAVE -------------------
    await course.save();
    cleanupTemp();

    res.status(200).json(course);
  } catch (err) {
    console.error('Edit course error:', err);
    cleanupTemp();
    res.status(500).json({ message: 'Server error while updating course' });
  }
};

/* ------------------------------------------------------------------ */
/* DELETE /courses/:id (admin only) – FULLY FIXED: DELETE ALL FILES & FOLDERS */
/* ------------------------------------------------------------------ */
const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const basePath = getCourseBasePath(course.courseFolder);

    if (fs.existsSync(basePath)) {
      deleteFolderRecursive(basePath);
      console.log(`Deleted course folder: ${basePath}`);
    }

    await Course.findByIdAndDelete(id);
    res.status(200).json({ message: 'Course and all associated files deleted' });
  } catch (err) {
    console.error('Delete course error:', err);
    res.status(500).json({ message: 'Server error while deleting course' });
  }
};
/* ------------------------------------------------------------------ */
/* POST /courses/:courseId/enroll: Enroll in a course                 */
/* ------------------------------------------------------------------ */
const enrollCourse = async (req, res) => {
  try {
    const { courseId } = req.body;
    const userId = req.user.id;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (course.students.includes(userId)) {
      return res.status(400).json({ message: 'You are already enrolled in this course' });
    }

    if (course.type === 'paid') {
      return res.status(402).json({ message: 'Payment required for this course. Please use the payment API.' });
    }

    if (course.type === 'vip' && user.subscription !== 'vip') {
      return res.status(403).json({ message: 'Active VIP subscription required' });
    }

    course.students.push(userId);
    await course.save();

    user.coursesEnrolled.push(courseId);
    await user.save();

    res.status(200).json({ message: 'Enrolled successfully', courseId });
  } catch (err) {
    console.error('Enroll course error:', err);
    res.status(500).json({ message: 'Server error while enrolling in course' });
  }
};

/* ------------------------------------------------------------------ */
/* POST /courses/:courseId/comments: Add a comment                    */
/* ------------------------------------------------------------------ */
const addComment = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { text, rating } = req.body;
    const userId = req.user.id;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    if (!course.students.includes(userId)) {
      return res.status(403).json({ message: 'You must be enrolled to comment' });
    }

    course.comments.push({
      user: userId,
      text,
      rating,
      status: 'pending'
    });

    await course.save();
    res.status(201).json({ message: 'Comment submitted for approval' });
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(500).json({ message: 'Server error while adding comment' });
  }
};

/* ------------------------------------------------------------------ */
/* GET /courses/:courseId/comments: Get approved comments             */
/* ------------------------------------------------------------------ */
const getComments = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findById(courseId)
      .populate('comments.user', 'name family')
      .select('comments');

    if (!course) return res.status(404).json({ message: 'Course not found' });

    const approvedComments = course.comments.filter(comment => comment.status === 'approved');
    res.status(200).json(approvedComments);
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ message: 'Server error while fetching comments' });
  }
};

/* ------------------------------------------------------------------ */
/* PATCH /courses/:courseId/comments/:commentId/approve               */
/* ------------------------------------------------------------------ */
const approveComment = async (req, res) => {
  try {
    const { courseId, commentId } = req.params;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const comment = course.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    if (comment.status !== 'pending') {
      return res.status(400).json({ message: 'Comment is not pending' });
    }

    comment.status = 'approved';
    await course.save();

    res.status(200).json({ message: 'Comment approved' });
  } catch (err) {
    console.error('Approve comment error:', err);
    res.status(500).json({ message: 'Server error while approving comment' });
  }
};

/* ------------------------------------------------------------------ */
/* GET /courses/:courseId/comments/pending: Get pending comments      */
/* ------------------------------------------------------------------ */
const getPendingComments = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findById(courseId)
      .populate('comments.user', 'name family')
      .select('comments');

    if (!course) return res.status(404).json({ message: 'Course not found' });

    const pendingComments = course.comments.filter(comment => comment.status === 'pending');
    res.status(200).json(pendingComments);
  } catch (err) {
    console.error('Get pending comments error:', err);
    res.status(500).json({ message: 'Server error while fetching pending comments' });
  }
};

/* ------------------------------------------------------------------ */
/* GET /courses/:idOrName: Get course by ID or title                  */
/* ------------------------------------------------------------------ */
const getCourse = async (req, res) => {
  try {
    const { idOrName } = req.params;

    let course;
    if (mongoose.Types.ObjectId.isValid(idOrName)) {
      course = await Course.findById(idOrName);
    } else {
      course = await Course.findOne({ title: idOrName });
    }

    if (!course) return res.status(404).json({ message: 'Course not found' });

    await course.populate([
      { path: 'category', select: 'name' },
      { path: 'teacher', select: 'name family expertise' },
      { path: 'students', select: 'name family' },
      { path: 'comments.user', select: 'name family' }
    ]);

    const formattedCourse = {
      ...course.toObject(),
      coverImage: `${process.env.BASE_URL || 'http://localhost:5000'}/uploads/${course.coverImage}`,
      previewVideo: course.previewVideo ? `${process.env.BASE_URL || 'http://localhost:5000'}/uploads/${course.previewVideo}` : null,
      chapters: course.chapters.map(ch => ({
        ...ch,
        videos: ch.videos.map(v => ({
          ...v,
          fileUrl: `${process.env.BASE_URL || 'http://localhost:5000'}/uploads/${v.filePath}`
        }))
      }))
    };

    res.status(200).json(formattedCourse);
  } catch (err) {
    console.error('Get course error:', err);
    res.status(500).json({ message: 'Server error while fetching course' });
  }
};

/* ------------------------------------------------------------------ */
/* GET /courses/:courseId/chapters/:chapterId/videos/:videoId         */
/* ------------------------------------------------------------------ */
const accessCourseVideo = async (req, res) => {
  try {
    const { courseId, chapterId, videoId } = req.params;
    const userId = req.user.id;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!course.students.includes(userId)) {
      return res.status(403).json({ message: 'You are not enrolled in this course' });
    }

    if (course.type === 'vip' && user.subscription !== 'vip') {
      return res.status(403).json({ message: 'Active VIP subscription required' });
    }

    const chapter = course.chapters.id(chapterId);
    if (!chapter) return res.status(404).json({ message: 'Chapter not found' });

    const video = chapter.videos.id(videoId);
    if (!video) return res.status(404).json({ message: 'Video not found' });

    const videoUrl = `${process.env.BASE_URL || 'http://localhost:5000'}/uploads/${video.filePath}`;
    res.status(200).json({
      message: course.presentationMethod === 'streaming' ? 'Streaming access granted' : 'Download access granted',
      video: {
        title: video.title,
        description: video.description,
        duration: video.duration,
        time: video.time,
        [course.presentationMethod === 'streaming' ? 'streamingUrl' : 'downloadUrl']: videoUrl
      }
    });
  } catch (err) {
    console.error('Access video error:', err);
    res.status(500).json({ message: 'Server error while accessing video' });
  }
};

/* ------------------------------------------------------------------ */
/* Export all controllers                                             */
/* ------------------------------------------------------------------ */
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
  getCourse,
  accessCourseVideo
};