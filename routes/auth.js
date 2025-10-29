const express = require('express');
const {
  startAuth,
  verifyOTP,
  completeRegistration,
  refreshToken
} = require('../controllers/authController');
const { otpRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/start', otpRateLimiter, startAuth);
router.post('/verify', verifyOTP);
router.post('/complete', completeRegistration);
router.post('/refresh', refreshToken);

module.exports = router;