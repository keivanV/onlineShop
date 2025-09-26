const express = require('express');
const { registerUser, verifyOTP, loginUser, loginAdmin, refreshToken, forgotPassword, resetPassword } = require('../controllers/authController');
const { otpRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/register', otpRateLimiter, registerUser);
router.post('/verify-otp', verifyOTP);
router.post('/forgot-password', otpRateLimiter, forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/login-user', loginUser);
router.post('/login-admin', loginAdmin);
router.post('/refresh', refreshToken);

module.exports = router;