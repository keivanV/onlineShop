// routes/courseDetail.js
const express = require('express');
const { getCourseDetail } = require('../controllers/courseDetailController');
const { authOptional } = require('../middleware/authOptional');

const router = express.Router();


router.get('/:courseId/detail', authOptional, getCourseDetail);

module.exports = router;