
const express = require('express');
const { getAllStudents, updateStudent, updateProfile, getAllTeachers, addTeacher, updateTeacher, getUserDashboard } = require('../controllers/userController');
const { verifyToken, verifyAdmin, verifyUser } = require('../middleware/auth');

const router = express.Router();

router.get('/students', verifyToken, verifyAdmin, getAllStudents);
router.put('/students/:phone', verifyToken, verifyAdmin, updateStudent);
router.put('/profile', verifyToken, verifyUser, updateProfile);
router.get('/teachers', verifyToken, verifyAdmin, getAllTeachers);
router.post('/teachers', verifyToken, verifyAdmin, addTeacher);
router.put('/teachers/:phone', verifyToken, verifyAdmin, updateTeacher);
router.get('/dashboard', verifyToken, verifyUser, getUserDashboard);

module.exports = router;
