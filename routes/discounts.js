const express = require('express');
const router = express.Router();
const discountController = require('../controllers/discountController');
const { verifyToken, verifyAdmin, verifyUser } = require('../middleware/auth');

router.get('/', verifyToken, verifyAdmin, discountController.getDiscountCodes);
router.post('/', verifyToken, verifyAdmin, discountController.createDiscountCode);
router.put('/:id', verifyToken, verifyAdmin, discountController.editDiscountCode);
router.post('/apply', verifyToken, verifyUser, discountController.applyDiscountCode);

module.exports = router;