// controllers/articleController.js
const Article = require('../models/Article');
const User = require('../models/User');
const Category = require('../models/Category');

// FOR REGISTERED USERS ..
const addCommentToArticle = async (req, res) => {
  try {
    const { articleId } = req.params;
    const { text, rating } = req.body;
    const userId = req.user._id;

    if (!text || text.trim().length < 5) {
      return res.status(400).json({ message: 'متن کامنت باید حداقل ۵ کاراکتر باشد' });
    }

    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({ message: 'امتیاز باید بین ۱ تا ۵ باشد' });
    }

    const article = await Article.findById(articleId);
    if (!article || article.status !== 'published') {
      return res.status(404).json({ message: 'مقاله یافت نشد' });
    }

    // جلوگیری از کامنت تکراری
    const existing = article.comments.find(c => c.user.toString() === userId.toString());
    if (existing) {
      return res.status(400).json({ message: 'شما قبلاً کامنت داده‌اید' });
    }

    article.comments.push({
      user: userId,
      text: text.trim(),
      rating: rating ? parseInt(rating) : undefined,
      status: 'pending'
    });

    await article.save();
    res.status(201).json({ message: 'کامنت شما با موفقیت ارسال شد و در انتظار تأیید است' });

  } catch (error) {
    console.error('Add article comment error:', error);
    res.status(500).json({ message: 'خطا در ارسال کامنت' });
  }
};



// Get approved comments for article + total comments count
const getArticleComments = async (req, res) => {
  try {
    const { articleId } = req.params;

    const article = await Article.findById(articleId)
      .select('comments articleRating articleRatingCount')
      .populate('comments.user', 'name profilePic');

    if (!article) {
      return res.status(404).json({ message: 'مقاله یافت نشد' });
    }

    const approvedComments = article.comments
      .filter(c => c.status === 'approved')
      .map(c => ({
        _id: c._id,
        text: c.text,
        rating: c.rating || 0,
        user: {
          name: c.user?.name || 'کاربر ناشناس',
          profilePic: c.user?.profilePic || null
        },
        createdAt: c.createdAt
      }));

    const commentsCount = article.comments.length;

    res.json({
      comments: approvedComments,
      commentCount: approvedComments.length,       
      commentsCount,                               
      articleRating: article.articleRating || 0,
      articleRatingCount: article.articleRatingCount || 0
    });

  } catch (error) {
    console.error('Get article comments error:', error);
    res.status(500).json({ message: 'خطا در دریافت کامنت‌ها' });
  }
};

// Approve comment (Admin only)
const approveArticleComment = async (req, res) => {
  try {
    const { articleId, commentId } = req.params;
    const adminId = req.user._id;

    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ message: 'دسترسی ادمین لازم است' });
    }

    const article = await Article.findById(articleId);
    if (!article) return res.status(404).json({ message: 'مقاله یافت نشد' });

    const comment = article.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: 'کامنت یافت نشد' });

    if (comment.status !== 'pending') {
      return res.status(400).json({ message: 'این کامنت قبلاً بررسی شده' });
    }

    comment.status = 'approved';
    await article.save();

    // محاسبه مجدد امتیاز مقاله
    const approved = article.comments.filter(c => c.status === 'approved' && c.rating);
    const total = approved.reduce((sum, c) => sum + c.rating, 0);
    const count = approved.length;

    article.articleRating = count > 0 ? Number((total / count).toFixed(2)) : 0;
    article.articleRatingCount = count;

    await article.save();

    res.json({
      message: 'کامنت تأیید شد',
      articleRating: article.articleRating,
      articleRatingCount: article.articleRatingCount
    });

  } catch (error) {
    console.error('Approve article comment error:', error);
    res.status(500).json({ message: 'خطا در تأیید کامنت' });
  }
};

// Create a new article (Admin only)
const createArticle = async (req, res) => {
  try {
    const { title, shortDescription, content, featuredImage, category, tags, readingTime, status } = req.body;
    const adminId = req.user.id;

    // Verify user is admin
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    // Validate category exists
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res.status(400).json({ message: 'Invalid category' });
    }

    const article = new Article({
      title,
      shortDescription,
      content,
      featuredImage,
      author: adminId,
      category,
      tags,
      readingTime,
      status: status || 'published'
    });

    await article.save();
    console.log(`Article created by admin ${admin.phone}: ${title}`);
    res.status(201).json(article);
  } catch (error) {
    console.error('Create article error:', error);
    res.status(500).json({ message: 'Server error while creating article' });
  }
};

// Edit an existing article (Admin only)
const editArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const adminId = req.user.id;

    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const article = await Article.findByIdAndUpdate(id, updates, { new: true });
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }

    console.log(`Article updated by admin ${admin.phone}: ${id}`);
    res.status(200).json(article);
  } catch (error) {
    console.error('Edit article error:', error);
    res.status(500).json({ message: 'Server error while editing article' });
  }
};

// Delete an article (Admin only)
const deleteArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const article = await Article.findByIdAndDelete(id);
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }

    console.log(`Article deleted by admin ${admin.phone}: ${id}`);
    res.status(200).json({ message: 'Article deleted successfully' });
  } catch (error) {
    console.error('Delete article error:', error);
    res.status(500).json({ message: 'Server error while deleting article' });
  }
};

// Get all articles (public)
const getArticles = async (req, res) => {
  try {
    const articles = await Article.find()
      .populate('author', 'name  phone')
      .populate('category', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json(articles);
  } catch (error) {
    console.error('Get articles error:', error);
    res.status(500).json({ message: 'Server error while fetching articles' });
  }
};

// Get single article by ID (public)
const getArticleById = async (req, res) => {
  try {
    const { id } = req.params;

    const article = await Article.findById(id)
      .populate('author', 'name  phone')
      .populate('category', 'name');

    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }

    console.log(`Fetched article: ${article.title} (ID: ${id})`);
    res.status(200).json(article);
  } catch (error) {
    console.error('Get article error:', error);
    res.status(500).json({ message: 'Server error while fetching article' });
  }
};

module.exports = {
  createArticle,
  editArticle,
  deleteArticle,
  getArticles,
  getArticleById,
  addCommentToArticle,      
  getArticleComments,      
  approveArticleComment    
};