const Category = require('../models/Category');
const Course = require('../models/Course');
//--------------------------------------------
const createCategory = async (req, res) => {
  const { name, tags, description, displayOrder } = req.body;
  const category = new Category({ name, tags, description, displayOrder });
  await category.save();
  res.status(201).json(category);
};
//------------------------------------------
const editCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, tags, description, displayOrder } = req.body;

    console.log(`Received editCategory request for id: ${id}, Body: ${JSON.stringify(req.body, null, 2)}`);

    if (name) {
      const existingCategory = await Category.findOne({ name });
      if (existingCategory && existingCategory._id.toString() !== id) {
        console.log(`Category edit failed: Name already exists: ${name}`);
        return res.status(400).json({ message: 'Category name already in use' });
      }
    }

    const category = await Category.findByIdAndUpdate(
      id,
      { name, tags, description, displayOrder },
      { new: true, runValidators: true }
    );

    if (!category) {
      console.log(`Category not found: ${id}`);
      return res.status(404).json({ message: 'Category not found' });
    }

    console.log(`Category updated: ${category.name} (ID: ${id})`);
    res.status(200).json(category);
  } catch (error) {
    console.log(`Edit category error: ${error.message}`, { error });
    if (error.code === 11000 && error.keyPattern.name) {
      console.log(`MongoDB error: Category name already in use: ${req.body.name}`);
      return res.status(400).json({ message: 'Category name already in use' });
    }
    res.status(500).json({ message: 'Server error while updating category' });
  }
};
//----------------------------------------
const getCategories = async (req, res) => {
  const categories = await Category.find().sort('displayOrder');
  const withCounts = await Promise.all(categories.map(async (cat) => {
    const count = await Course.countDocuments({ category: cat._id });
    return { ...cat.toObject(), courseCount: count };
  }));
  res.status(200).json(withCounts);
};

module.exports = { createCategory, editCategory, getCategories };