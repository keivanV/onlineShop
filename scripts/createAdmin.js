// scripts/createAdmin.js
const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const admin = await User.findOneAndUpdate(
      { phone: '09120000000' },
      {
        name: 'Admin',
        family: 'Manager',
        email: 'admin@platform.com',
        phone: '09120000000',
        role: 'admin',
        isProfileComplete: true
      },
      { upsert: true, new: true }
    );

    console.log('Admin created/updated:', admin.phone, admin.role);
    process.exit();
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });