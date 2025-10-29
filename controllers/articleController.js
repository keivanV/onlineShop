// controllers/articleController.js
const Article = require('../models/Article');
const User = require('../models/User');
const Category = require('../models/Category');

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
      .populate('author', 'name family phone')
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
      .populate('author', 'name family phone')
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
  getArticleById
};