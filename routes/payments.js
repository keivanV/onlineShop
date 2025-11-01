const express = require('express');
const { createPayment, verifyPayment , getPaymentHistory } = require('../controllers/paymentController');
const { verifyToken , verifyAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/', verifyToken, createPayment);
router.get('/verify', verifyPayment); 


//  For User 
router.get('/history', verifyToken, getPaymentHistory);

// For Admin + User
router.get('/history/user/:userId', verifyToken, verifyAdmin, (req, res) => {
  req.query.userId = req.params.userId;
  return getPaymentHistory(req, res);
});

// For Admin All
router.get('/history/all', verifyToken, verifyAdmin, (req, res) => {
  req.query.userId = null;
  return getPaymentHistory(req, res);
});



module.exports = router;