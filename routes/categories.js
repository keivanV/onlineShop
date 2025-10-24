const express = require('express');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const { createCategory, editCategory, getCategories } = require('../controllers/categoryController');

const router = express.Router();

router.post('/', verifyToken, verifyAdmin, createCategory);
router.put('/:id', verifyToken, verifyAdmin, editCategory);
router.get('/', getCategories); // Or open ?!

module.exports = router;