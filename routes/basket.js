const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { addToBasket, getBasket, removeFromBasket, checkoutBasket } = require('../controllers/basketController');

const router = express.Router();

router.post('/', verifyToken, addToBasket);
router.get('/', verifyToken, getBasket);
router.delete('/', verifyToken, removeFromBasket);
router.post('/checkout', verifyToken, checkoutBasket);

module.exports = router;