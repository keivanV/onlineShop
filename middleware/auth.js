// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-otp -otpExpires -refreshToken');

    if (!user) return res.status(401).json({ message: 'User not found' });
    if (user.status === 'ban') return res.status(403).json({ message: 'Account is banned' });

    req.user = {
      id: user._id.toString(),
      role: user.role,
      phone: user.phone
    };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const verifyAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

const verifyUser = (req, res, next) => {
  if (!['student', 'teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Invalid user role' });
  }
  next();
};

const verifyProfileComplete = async (req, res, next) => {
  // admin niyaz be takmil profile nadare
  if (req.user.role === 'admin') return next();

  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.isProfileComplete) {
      return res.status(403).json({
        message: 'Please complete your profile first',
        requiresCompletion: true
      });
    }
    next();
  } catch (error) {
    console.error('Profile check error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { verifyToken, verifyAdmin, verifyUser, verifyProfileComplete };