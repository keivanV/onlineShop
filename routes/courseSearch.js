// routes/courseSearch.js
const express = require('express');
const { searchCourses } = require('../controllers/courseSearchController');
const router = express.Router();

router.get('/search', searchCourses);

module.exports = router;