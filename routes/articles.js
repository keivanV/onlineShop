const express = require('express');
const {
  createArticle,
  editArticle,
  deleteArticle,
  getArticles,
  getArticleById,
  addCommentToArticle,
  getArticleComments,
  approveArticleComment
} = require('../controllers/articleController');

const { verifyToken, verifyAdmin } = require('../middleware/auth');

const router = express.Router();


router.get('/', getArticles);


router.get('/:id', getArticleById);


router.get('/:articleId/comments', getArticleComments);



router.post('/:articleId/comments', verifyToken, addCommentToArticle);



router.post('/', verifyToken, verifyAdmin, createArticle);


router.put('/:id', verifyToken, verifyAdmin, editArticle);

router.delete('/:id', verifyToken, verifyAdmin, deleteArticle);


router.patch(
  '/:articleId/comments/:commentId/approve',
  verifyToken,
  verifyAdmin,
  approveArticleComment
);

router.patch(
  '/:articleId/comments/:commentId/reject',
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const { articleId, commentId } = req.params;
      const article = await require('../models/Article').findById(articleId);
      if (!article) return res.status(404).json({ message: 'مقاله یافت نشد' });

      const comment = article.comments.id(commentId);
      if (!comment) return res.status(404).json({ message: 'کامنت یافت نشد' });

      comment.status = 'rejected';
      await article.save();

      res.json({ message: 'کامنت رد شد' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'خطا در رد کامنت' });
    }
  }
);

module.exports = router;