const express = require('express');
const { createPayment, verifyPayment } = require('../controllers/paymentController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.post('/', verifyToken, createPayment);
router.get('/verify', verifyPayment); 


module.exports = router;