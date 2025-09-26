const User = require('../models/User');
const TempUser = require('../models/TempUser');
const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');
//------------------------------------------------------
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
//------------------------------------------------------
const registerUser = async (req, res) => {
  try {
    const { name, family, phone, email, password, confirmPassword, birthdate, city, address, profilePic } = req.body;

    // Validate required fields
    if (!name || !family || !phone || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    if (!password.trim()) {
      return res.status(400).json({ message: 'Password cannot be empty' });
    }

    // Check if user already exists in User collection
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ message: 'Phone already registered' });
    }

    // Delete any existing TempUser to allow new OTP after rate limit
    await TempUser.deleteOne({ phone });

    // Generate and save new OTP
    const otp = generateOTP();
    const tempUser = new TempUser({
      name,
      family,
      phone,
      email,
      password,
      birthdate,
      city,
      address,
      profilePic,
      otp,
      otpExpires: Date.now() + 10 * 60 * 1000 // 10 minutes
    });
    await tempUser.save();

    res.status(200).json({ message: 'OTP sent', otp }); // Return OTP as per instruction
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ message: 'Phone and OTP are required' });
    }

    const tempUser = await TempUser.findOne({ phone, otp, otpExpires: { $gt: Date.now() } });
    if (!tempUser) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Move data to User collection
    const user = new User({
      name: tempUser.name,
      family: tempUser.family,
      phone: tempUser.phone,
      email: tempUser.email,
      password: tempUser.password,
      birthdate: tempUser.birthdate,
      city: tempUser.city,
      address: tempUser.address,
      profilePic: tempUser.profilePic
    });

    await user.save();
    await TempUser.deleteOne({ phone }); // Clean up temp user

    const accessToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: user._id, role: user.role }, process.env.REFRESH_SECRET);
    user.refreshToken = refreshToken;
    await user.save();

    res.status(200).json({ accessToken, refreshToken });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: 'Server error during OTP verification' });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ message: 'Phone is required' });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate OTP
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    res.status(200).json({ message: 'OTP sent for password reset', otp }); // Return OTP for testing; in production, send via SMS
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error during forgot password' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { phone, otp, newPassword, confirmNewPassword } = req.body;
    if (!phone || !otp || !newPassword || !confirmNewPassword) {
      return res.status(400).json({ message: 'Phone, OTP, new password, and confirm password are required' });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    if (!newPassword.trim()) {
      return res.status(400).json({ message: 'Password cannot be empty' });
    }

    const user = await User.findOne({ phone, otp, otpExpires: { $gt: Date.now() } });
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    user.password = newPassword; // Will be hashed in pre-save hook
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error during password reset' });
  }
};

const loginUser = async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ message: 'Phone and password are required' });
    }

    const user = await User.findOne({ phone });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    user.lastLogin = Date.now();
    await user.save();

    const accessToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: user._id, role: user.role }, process.env.REFRESH_SECRET);
    user.refreshToken = refreshToken;
    await user.save();

    res.status(200).json({ accessToken, refreshToken });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

const loginAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const admin = await Admin.findOne({ username });
    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const accessToken = jwt.sign({ id: admin._id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: admin._id, role: 'admin' }, process.env.REFRESH_SECRET);
    admin.refreshToken = refreshToken;
    await admin.save();

    res.status(200).json({ accessToken, refreshToken });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ message: 'Server error during admin login' });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ message: 'No refresh token provided' });
    }

    jwt.verify(refreshToken, process.env.REFRESH_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: 'Invalid refresh token' });
      }

      let model = decoded.role === 'admin' ? Admin : User;
      const user = await model.findById(decoded.id);
      if (!user || user.refreshToken !== refreshToken) {
        return res.status(403).json({ message: 'Invalid refresh token' });
      }

      const accessToken = jwt.sign({ id: user._id, role: decoded.role }, process.env.JWT_SECRET, { expiresIn: '15m' });
      res.status(200).json({ accessToken });
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ message: 'Server error during token refresh' });
  }
};

module.exports = { registerUser, verifyOTP, forgotPassword, resetPassword, loginUser, loginAdmin, refreshToken };