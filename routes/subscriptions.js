const express = require('express');
const { createSubscriptionPlan, updateSubscriptionPlan, getSubscriptionPlans, purchaseSubscription } = require('../controllers/subscriptionController');
const { verifyToken, verifyAdmin } = require('../middleware/auth'); 
const { accessCourseVideo } = require('../controllers/courseController');

const router = express.Router();

router.get('/plans', verifyToken, getSubscriptionPlans);
router.post('/plans', verifyToken, verifyAdmin, createSubscriptionPlan);
router.put('/plans/:id', verifyToken, verifyAdmin, updateSubscriptionPlan);
router.post('/purchase', verifyToken, purchaseSubscription);
router.get('/courses/:courseId/chapters/:chapterId/videos/:videoId', verifyToken, accessCourseVideo);

module.exports = router;