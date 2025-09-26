const express = require('express');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const { getCourses, createCourse, editCourse, deleteCourse, enrollCourse, accessCourseVideo, addComment, getComments, approveComment, getPendingComments, getCourse } = require('../controllers/courseController');
const { createPayment } = require('../controllers/paymentController');

const router = express.Router();

router.get('/', getCourses);
router.post('/', verifyToken, verifyAdmin, createCourse);
router.put('/:id', verifyToken, verifyAdmin, editCourse);
router.delete('/:id', verifyToken, verifyAdmin, deleteCourse);
router.post('/enroll', verifyToken, enrollCourse);
router.post('/pay', verifyToken, createPayment);
router.get('/:idOrName', verifyToken, getCourse);
router.post('/:courseId/comments', verifyToken, addComment);
router.get('/:courseId/comments', verifyToken, getComments);
router.get('/:courseId/comments/pending', verifyToken, verifyAdmin, getPendingComments);
router.put('/:courseId/comments/:commentId/approve', verifyToken, verifyAdmin, approveComment);
router.get('/:courseId/chapters/:chapterId/videos/:videoId', verifyToken, accessCourseVideo);

module.exports = router;