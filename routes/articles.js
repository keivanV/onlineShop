const express = require('express');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const { createArticle, editArticle, deleteArticle, getArticles, getArticleById } = require('../controllers/articleController');

const router = express.Router();

router.get('/', getArticles);
router.get('/:id', getArticleById); 
router.post('/', verifyToken, verifyAdmin, createArticle);
router.put('/:id', verifyToken, verifyAdmin, editArticle);
router.delete('/:id', verifyToken, verifyAdmin, deleteArticle);

module.exports = router;