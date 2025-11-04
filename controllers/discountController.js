
const DiscountCode = require('../models/DiscountCode');
const Course = require('../models/Course');

const createDiscountCode = async (req, res) => {
  try {
    const { code, discountPercent, maxUses, isActive, expiresAt } = req.body;

    if (!req.user || !req.user.id) {
      console.log('Discount code creation failed: No user ID provided');
      return res.status(401).json({ message: 'User not authenticated' });
    }

    if (req.user.role !== 'admin') {
      console.log(`Discount code creation failed: User role is ${req.user.role}`);
      return res.status(403).json({ message: 'Admin access required' });
    }

    if (!code || !code.trim()) {
      console.log('Discount code creation failed: Code is required');
      return res.status(400).json({ message: 'Code is required' });
    }
    if (discountPercent < 0 || discountPercent > 100) {
      console.log(`Discount code creation failed: Invalid discount percent: ${discountPercent}`);
      return res.status(400).json({ message: 'Discount percent must be between 0 and 100' });
    }
    if (maxUses < 0) {
      console.log(`Discount code creation failed: Invalid max uses: ${maxUses}`);
      return res.status(400).json({ message: 'Max uses must be non-negative' });
    }
    const existingCode = await DiscountCode.findOne({ code: code.toUpperCase() });
    if (existingCode) {
      console.log(`Discount code creation failed: Code already exists: ${code}`);
      return res.status(400).json({ message: 'Discount code already exists' });
    }
    const discountCode = new DiscountCode({
      code: code.toUpperCase(),
      discountPercent,
      maxUses,
      isActive: isActive !== undefined ? isActive : true,
      expiresAt: expiresAt || null
    });
    await discountCode.save();
    console.log(`Discount code created: ${code}`);
    res.status(201).json(discountCode);
  } catch (error) {
    console.log(`Create discount code error: ${error.message}`, { error });
    if (error.code === 11000 && error.keyPattern.code) {
      console.log(`MongoDB error: Discount code already in use: ${req.body.code}`);
      return res.status(400).json({ message: 'Discount code already in use' });
    }
    res.status(500).json({ message: 'Server error while creating discount code' });
  }
};

const editDiscountCode = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, discountPercent, maxUses, isActive, expiresAt } = req.body;

    console.log(`Received editDiscountCode request for id: ${id}, Body: ${JSON.stringify(req.body, null, 2)}`);

    if (code) {
      const existingCode = await DiscountCode.findOne({ code: code.toUpperCase() });
      if (existingCode && existingCode._id.toString() !== id) {
        console.log(`Discount code edit failed: Code already exists: ${code}`);
        return res.status(400).json({ message: 'Discount code already in use' });
      }
    }
    if (discountPercent !== undefined && (discountPercent < 0 || discountPercent > 100)) {
      console.log(`Discount code edit failed: Invalid discount percent: ${discountPercent}`);
      return res.status(400).json({ message: 'Discount percent must be between 0 and 100' });
    }
    if (maxUses !== undefined && maxUses < 0) {
      console.log(`Discount code edit failed: Invalid max uses: ${maxUses}`);
      return res.status(400).json({ message: 'Max uses must be non-negative' });
    }

    const discountCode = await DiscountCode.findByIdAndUpdate(
      id,
      {
        code: code ? code.toUpperCase() : undefined,
        discountPercent,
        maxUses,
        isActive,
        expiresAt: expiresAt || undefined
      },
      { new: true, runValidators: true }
    );

    if (!discountCode) {
      console.log(`Discount code not found: ${id}`);
      return res.status(404).json({ message: 'Discount code not found' });
    }

    console.log(`Discount code updated: ${discountCode.code} (ID: ${id})`);
    res.status(200).json(discountCode);
  } catch (error) {
    console.log(`Edit discount code error: ${error.message}`, { error });
    if (error.code === 11000 && error.keyPattern.code) {
      console.log(`MongoDB error: Discount code already in use: ${req.body.code}`);
      return res.status(400).json({ message: 'Discount code already in use' });
    }
    res.status(500).json({ message: 'Server error while updating discount code' });
  }
};

const getDiscountCodes = async (req, res) => {
  try {
    const discountCodes = await DiscountCode.find().populate('usedBy.user', 'name');
    console.log(`Fetched ${discountCodes.length} discount codes`);
    res.status(200).json(discountCodes);
  } catch (error) {
    console.log(`Get discount codes error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while fetching discount codes' });
  }
};

const applyDiscountCode = async (req, res) => {
  try {
    const { code, courseId } = req.body;
    const userId = req.user.id;

    if (!code || !courseId) {
      console.log('Apply discount code failed: Code and courseId are required');
      return res.status(400).json({ message: 'Code and courseId are required' });
    }

    const discountCode = await DiscountCode.findOne({ code: code.toUpperCase() });
    if (!discountCode) {
      console.log(`Apply discount code failed: Code not found: ${code}`);
      return res.status(404).json({ message: 'Discount code not found' });
    }

    if (!discountCode.isActive) {
      console.log(`Apply discount code failed: Code is inactive: ${code}`);
      return res.status(400).json({ message: 'Discount code is inactive' });
    }

    if (discountCode.usedCount >= discountCode.maxUses) {
      console.log(`Apply discount code failed: Max uses reached for code: ${code}`);
      return res.status(400).json({ message: 'Discount code has reached maximum uses' });
    }

    if (discountCode.expiresAt && new Date() > discountCode.expiresAt) {
      console.log(`Apply discount code failed: Code expired: ${code}`);
      return res.status(400).json({ message: 'Discount code has expired' });
    }

    const alreadyUsed = discountCode.usedBy.some(
      entry => entry.user.toString() === userId.toString() && entry.course.toString() === courseId
    );
    if (alreadyUsed) {
      console.log(`Apply discount code failed: Code already used by user ${userId} for course ${courseId}`);
      return res.status(400).json({ message: 'You have already used this discount code for this course' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      console.log(`Apply discount code failed: Course not found: ${courseId}`);
      return res.status(404).json({ message: 'Course not found' });
    }

    const originalPrice = course.price || 0;
    let finalPrice = originalPrice;
    let courseDiscountAmount = 0;
    let codeDiscountAmount = 0;

    if (course.discount && course.discount > 0) {
      courseDiscountAmount = (originalPrice * course.discount) / 100;
      finalPrice -= courseDiscountAmount;
    }

    codeDiscountAmount = (finalPrice * discountCode.discountPercent) / 100;
    finalPrice -= codeDiscountAmount;

    finalPrice = Math.max(0, finalPrice);

    console.log(`Discount code applied: ${code} on course ${courseId}, originalPrice: ${originalPrice}, courseDiscount: ${course.discount || 0}%, codeDiscount: ${discountCode.discountPercent}%, finalPrice: ${finalPrice}`);
    res.status(200).json({
      originalPrice,
      courseDiscountPercent: course.discount || 0,
      courseDiscountAmount,
      codeDiscountPercent: discountCode.discountPercent,
      codeDiscountAmount,
      finalPrice
    });
  } catch (error) {
    console.log(`Apply discount code error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while applying discount code' });
  }
};

module.exports = { createDiscountCode, editDiscountCode, getDiscountCodes, applyDiscountCode };
