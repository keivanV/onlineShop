const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { addToBasket, getBasket, removeFromBasket, checkoutBasket , applyDiscountCode , removeDiscountCode } = require('../controllers/basketController');

const router = express.Router();

router.post('/', verifyToken, addToBasket);
router.get('/', verifyToken, getBasket);
router.delete('/', verifyToken, removeFromBasket);
router.post('/checkout', verifyToken, checkoutBasket);

router.post('/discount',verifyToken, applyDiscountCode);
router.delete('/discount',verifyToken, removeDiscountCode);


module.exports = router;