
const Article = require('../models/Article');
const User = require('../models/User');
const Category = require('../models/Category');
const Admin = require('../models/Admin');
//------------------------------------------------
const createArticle = async (req, res) => {
  try {
    const { title, shortDescription, content, featuredImage, category, tags, readingTime, status } = req.body;
    const adminId = req.user.id; 
    //-----------------------------------------------
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    if (!(await Category.findById(category))) {
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
      status
    });
    await article.save();
    console.log(`Article created by admin ${adminId}: ${title}`);
    res.status(201).json(article);
  } catch (error) {
    console.error('Create article error:', error);
    res.status(500).json({ message: 'Server error while creating article' });
  }
};

const editArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const adminId = req.user.id; 


    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const article = await Article.findByIdAndUpdate(id, updates, { new: true });
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }
    console.log(`Article updated by admin ${adminId}: ${id}`);
    res.status(200).json(article);
  } catch (error) {
    console.error('Edit article error:', error);
    res.status(500).json({ message: 'Server error while editing article' });
  }
};

const deleteArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id; 
    //--------------------------------
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(403).json({ message: 'Admin access required' });
    }
    await Article.findByIdAndDelete(id);
    console.log(`Article deleted by admin ${adminId}: ${id}`);
    res.status(200).json({ message: 'Article deleted' });
  } catch (error) {
    console.error('Delete article error:', error);
    res.status(500).json({ message: 'Server error while deleting article' });
  }
};

const getArticles = async (req, res) => {
  try {
    const articles = await Article.find().populate('author', 'username').populate('category', 'name');
    res.status(200).json(articles);
  } catch (error) {
    console.error('Get articles error:', error);
    res.status(500).json({ message: 'Server error while fetching articles' });
  }
};


const getArticleById = async (req, res) => {
  try {
    const { id } = req.params;

    const article = await Article.findById(id)
      .populate('author', 'username')
      .populate('category', 'name');
    if (!article) {
      console.log(`Get article failed: Article not found: ${id}`);
      return res.status(404).json({ message: 'مقاله یافت نشد' });
    }

    console.log(`Fetched article: ${article.title} (ID: ${id})`);
    res.status(200).json(article);
  } catch (error) {
    console.error(`Get article error: ${error.message}`, { error });
    res.status(500).json({ message: 'خطا در دریافت مقاله' });
  }
};

module.exports = { createArticle, editArticle, deleteArticle, getArticles, getArticleById };
