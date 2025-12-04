// routes/courses.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const {
  getCourses, createCourse, editCourse, deleteCourse,
  enrollCourse, addComment, getComments,
  approveComment, getPendingComments, getCourse, searchCourses, filterCourses
} = require('../controllers/courseController');

const router = express.Router();

/* ------------------------------------------------------------------ */
/* Multer – accept ONLY the coverImage (image)                        */
/* ------------------------------------------------------------------ */
const tempDir = path.join(__dirname, '..', 'uploads', 'temp');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdir(tempDir, { recursive: true }, (err) => {
      if (err) return cb(err);
      cb(null, tempDir);
    });
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}_${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'coverImage' && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('فقط فایل تصویری برای coverImage مجاز است'));
    }
  }
});

/* ------------------------------------------------------------------ */
/* Public routes                                                      */
/* ------------------------------------------------------------------ */
router.get('/', getCourses);
router.get('/search', searchCourses);


router.get('/filter', filterCourses);

/* ------------------------------------------------------------------ */
/* Admin routes – create / edit (coverImage only)                     */
/* ------------------------------------------------------------------ */
router.post('/', verifyToken, verifyAdmin, upload.single('coverImage'), createCourse);
router.put('/:id', verifyToken, verifyAdmin, upload.single('coverImage'), editCourse);
router.delete('/:id', verifyToken, verifyAdmin, deleteCourse);

/* ------------------------------------------------------------------ */
/* Enrollment & payment                                               */
/* ------------------------------------------------------------------ */
router.post('/enroll', verifyToken, enrollCourse);

/* ------------------------------------------------------------------ */
/* Comments                                                           */
/* ------------------------------------------------------------------ */
router.post('/:courseId/comments', verifyToken, addComment);
router.get('/:courseId/comments', getComments);
router.get('/:courseId/comments/pending', verifyToken, verifyAdmin, getPendingComments);
router.put('/:courseId/comments/:commentId/approve', verifyToken, verifyAdmin, approveComment);

module.exports = router;