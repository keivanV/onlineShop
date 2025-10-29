// controllers/authController.js
const User = require('../models/User');
const TempUser = require('../models/TempUser');
const jwt = require('jsonwebtoken');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  const refreshToken = jwt.sign(
    { id: user._id, role: user.role },
    process.env.REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  return { accessToken, refreshToken };
};

// --- startAuth ---
const startAuth = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || !/^\d{11}$/.test(phone)) {
      return res.status(400).json({ message: 'Valid phone number is required' });
    }

    await TempUser.deleteOne({ phone });

    const otp = generateOTP();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 دقیقه

    const existingUser = await User.findOne({ phone });

    if (existingUser) {
      existingUser.otp = otp;
      existingUser.otpExpires = otpExpires;
      await existingUser.save();
    } else {
      const tempUser = new TempUser({ phone, otp, otpExpires });
      await tempUser.save();
    }

    console.log(`OTP for ${phone}: ${otp}`);

    res.status(200).json({
      message: 'OTP sent successfully',
      otp: otp,
      requiresCompletion: !existingUser
    });
  } catch (error) {
    console.error('Start auth error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// --- verifyOTP ---
const verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ message: 'Phone and OTP are required' });
    }

    const user = await User.findOne({
      phone,
      otp,
      otpExpires: { $gt: Date.now() }
    });

    if (user) {
      user.otp = undefined;
      user.otpExpires = undefined;
      user.lastLogin = Date.now();
      await user.save();

      const { accessToken, refreshToken } = generateTokens(user);
      user.refreshToken = refreshToken;
      await user.save();

      return res.status(200).json({
        message: 'Login successful',
        accessToken,
        refreshToken,
        requiresCompletion: false
      });
    }

    const tempUser = await TempUser.findOne({
      phone,
      otp,
      otpExpires: { $gt: Date.now() }
    });

    if (!tempUser) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    res.status(200).json({
      message: 'OTP verified, please complete your profile',
      requiresCompletion: true,
      tempUserId: tempUser._id
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// --- completeRegistration ---
const completeRegistration = async (req, res) => {
  try {
    const { tempUserId, name, family, email, role = 'student' } = req.body;

    if (!tempUserId || !name || !family || !email) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const tempUser = await TempUser.findById(tempUserId);
    if (!tempUser) return res.status(400).json({ message: 'Invalid session' });

    const existingUser = await User.findOne({ phone: tempUser.phone });
    if (existingUser) {
      await TempUser.deleteOne({ _id: tempUserId });
      return res.status(400).json({ message: 'User already exists' });
    }

    const allowedRoles = ['student', 'teacher'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const user = new User({
      name, family, email, phone: tempUser.phone,
      role,
      isProfileComplete: true
    });

    await user.save();
    await TempUser.deleteOne({ _id: tempUserId });

    const { accessToken, refreshToken } = generateTokens(user);
    user.refreshToken = refreshToken;
    await user.save();

    res.status(201).json({
      message: 'Registration completed',
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Complete registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// --- refreshToken ---
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ message: 'No refresh token provided' });
    }

    jwt.verify(refreshToken, process.env.REFRESH_SECRET, async (err, decoded) => {
      if (err) return res.status(403).json({ message: 'Invalid refresh token' });

      const user = await User.findById(decoded.id);
      if (!user || user.refreshToken !== refreshToken) {
        return res.status(403).json({ message: 'Invalid refresh token' });
      }

      const accessToken = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      res.status(200).json({ accessToken });
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { startAuth, verifyOTP, completeRegistration, refreshToken };