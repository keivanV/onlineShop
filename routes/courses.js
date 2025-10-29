const express = require('express');
const multer = require('multer');
const path = require('path');
const {
  getCourses,
  createCourse,
  editCourse,
  deleteCourse,
  enrollCourse,
  accessCourseVideo,
  addComment,
  getComments,
  approveComment,
  getPendingComments,
  getCourse
} = require('../controllers/courseController');
const { createPayment } = require('../controllers/paymentController');
const { verifyToken, verifyAdmin } = require('../middleware/auth');

const router = express.Router();

/* ------------------------------------------------------------------ */
/* Multer Configuration: Handle ANY uploaded file (cover, preview, videos) */
/* ------------------------------------------------------------------ */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB per file
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/', 'video/'];
    if (allowedTypes.some(type => file.mimetype.startsWith(type))) {
      cb(null, true);
    } else {
      cb(new Error('فقط فایل‌های تصویری و ویدیویی مجاز هستند'));
    }
  }
});

/* ------------------------------------------------------------------ */
/* Public Routes                                                      */
/* ------------------------------------------------------------------ */

router.get('/', getCourses);
router.get('/:idOrName', getCourse);

/* ------------------------------------------------------------------ */
/* Admin Routes — Create & Edit Course (ANY number of chapters/videos) */
/* ------------------------------------------------------------------ */

// POST /api/courses → Create course
router.post(
  '/',
  verifyToken,
  verifyAdmin,
  upload.any(), // har tedad file ba har onvan
  createCourse
);

// PUT /api/courses/:id → Edit course (supports adding videos to ANY chapter)
router.put(
  '/:id',
  verifyToken,
  verifyAdmin,
  upload.any(), // -> chapters[999].videos[999].file)
  editCourse
);

// DELETE /api/courses/:id
router.delete('/:id', verifyToken, verifyAdmin, deleteCourse);

/* ------------------------------------------------------------------ */
/* Enrollment & Payment                                               */
/* ------------------------------------------------------------------ */

router.post('/enroll', verifyToken, enrollCourse);
router.post('/pay', verifyToken, createPayment);

/* ------------------------------------------------------------------ */
/* Comments                                                           */
/* ------------------------------------------------------------------ */

router.post('/:courseId/comments', verifyToken, addComment);
router.get('/:courseId/comments', getComments);

/* ------------------------------------------------------------------ */
/* Admin: Comment Moderation                                          */
/* ------------------------------------------------------------------ */

router.get('/:courseId/comments/pending', verifyToken, verifyAdmin, getPendingComments);
router.put(
  '/:courseId/comments/:commentId/approve',
  verifyToken,
  verifyAdmin,
  approveComment
);

/* ------------------------------------------------------------------ */
/* Video Access                                                       */
/* ------------------------------------------------------------------ */

router.get(
  '/:courseId/chapters/:chapterId/videos/:videoId',
  verifyToken,
  accessCourseVideo
);

/* ------------------------------------------------------------------ */
/* Export Router                                                      */
/* ------------------------------------------------------------------ */
module.exports = router;