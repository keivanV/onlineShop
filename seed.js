// seed.js
const mongoose = require('mongoose');
require('dotenv').config();

// Models
const User = require('./models/User');
const Category = require('./models/Category');
const Course = require('./models/Course');
const Podcast = require('./models/Podcast');
const Notification = require('./models/Notification');
const SubscriptionPlan = require('./models/SubscriptionPlan');
const Basket = require('./models/Basket');
const Payment = require('./models/Payment'); 

// Connect
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/lms');
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('DB connection error:', err.message);
    process.exit(1);
  }
};

// Clear DB
const clearDB = async () => {
  const collections = Object.keys(mongoose.connection.collections);
  for (const name of collections) {
    await mongoose.connection.collections[name].deleteMany({});
  }
  console.log('Database cleared');
};

// Seed
const seedData = async () => {
  try {
    // 1. Admin
    const admin = await User.findOneAndUpdate(
      { phone: '09120000000' },
      {
        name: 'Admin',
        family: 'Manager',
        email: 'admin@platform.com',
        phone: '09120000000',
        role: 'admin',
        isProfileComplete: true,
      },
      { upsert: true, new: true }
    );
    console.log('Admin ready:', admin.phone);

    // 2. Subscription Plans
    const plans = await SubscriptionPlan.insertMany([
      { duration: '1month', price: 150000 },
      { duration: '3month', price: 400000 },
      { duration: '6month', price: 700000 },
    ]);
    console.log('Subscription plans created');

    // 3. Categories
    const categories = await Category.insertMany([
      { name: 'Programming', displayOrder: 1 },
      { name: 'Web Design', displayOrder: 2 },
      { name: 'AI & ML', displayOrder: 3 },
      { name: 'Graphic Design', displayOrder: 4 },
      { name: 'VIP Exclusive', displayOrder: 5 },
    ]);
    console.log('Categories created');

    // 4. Teachers
    const teachers = await User.insertMany([
      { name: 'Mohammad', family: 'Ahmadi', phone: '09123456789', email: 'mohammad@lms.com', role: 'teacher', expertise: 'React, Node.js', bio: 'Senior Frontend Developer', isProfileComplete: true },
      { name: 'Zahra', family: 'Rezaei', phone: '09129876543', email: 'zahra@lms.com', role: 'teacher', expertise: 'Python, ML', bio: 'AI Researcher', isProfileComplete: true },
      { name: 'Ali', family: 'Mohammadi', phone: '09134567890', email: 'ali@lms.com', role: 'teacher', expertise: 'Figma, UX', bio: 'Lead Designer', isProfileComplete: true },
      { name: 'Nima', family: 'Sadeghi', phone: '09145678901', email: 'nima@lms.com', role: 'teacher', expertise: 'Blockchain, Web3', bio: 'Web3 Pioneer', isProfileComplete: true },
    ]);
    console.log('Teachers created');

    // 5. Students
    const students = await User.insertMany([
      // Regular users
      { name: 'Reza', family: 'Kazemi', phone: '09911223344', email: 'reza@lms.com', role: 'student', subscription: 'regular', isProfileComplete: true },
      { name: 'Fatemeh', family: 'Hosseini', phone: '09944556677', email: 'fatemeh@lms.com', role: 'student', subscription: 'regular', isProfileComplete: true },

      // VIP Users (will be updated via payment)
      { name: 'Sara', family: 'Nouri', phone: '09922334455', email: 'sara@lms.com', role: 'student', subscription: 'regular', isProfileComplete: true },
      { name: 'Hossein', family: 'Akbari', phone: '09933445566', email: 'hossein@lms.com', role: 'student', subscription: 'regular', isProfileComplete: true },
      { name: 'Amir', family: 'Rahimi', phone: '09955667788', email: 'amir@lms.com', role: 'student', subscription: 'regular', isProfileComplete: true },
    ]);
    console.log('Students created (3 will become VIP via payments)');

    // 6. Courses
    const courses = await Course.insertMany([
      // FREE
      {
        title: 'JavaScript Basics',
        description: 'Learn JS from scratch',
        coverImage: 'courses/js/cover.jpg',
        category: [categories[0]._id],
        teacher: teachers[0]._id,
        status: 'active',
        level: 'beginner',
        duration: 7200,
        presentationMethod: 'streaming',
        type: 'free',
        price: 0,
        discount: 0,
        previewVideoUrl: 'https://youtube.com/js-preview',
        chapters: [
          {
            title: 'Variables & Data Types',
            duration: 3600,
            videos: [
              { title: 'What is JS?', duration: 1800, videoUrl: 'https://youtube.com/js1' },
              { title: 'let, const, var', duration: 1800, videoUrl: 'https://youtube.com/js2' }
            ]
          }
        ],
      },

      // PAID
      {
        title: 'Advanced React & Redux',
        description: 'Master React with Redux Toolkit',
        coverImage: 'courses/react/cover.jpg',
        category: [categories[0]._id, categories[1]._id],
        teacher: teachers[0]._id,
        status: 'active',
        level: 'advanced',
        duration: 10800,
        presentationMethod: 'streaming',
        type: 'paid',
        price: 1200000,
        discount: 40,
        discountEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        previewVideoUrl: 'https://youtube.com/react-preview',
        chapters: [
          {
            title: 'Hooks Deep Dive',
            duration: 5400,
            videos: [
              { title: 'useEffect & useRef', duration: 2700, videoUrl: 'https://youtube.com/r1' },
              { title: 'Custom Hooks', duration: 2700, videoUrl: 'https://youtube.com/r2' }
            ]
          }
        ],
      },

      // VIP-ONLY
      {
        title: 'Web3 & Blockchain Development',
        description: 'Build dApps with Solidity & Ethers.js (VIP Only)',
        coverImage: 'courses/web3/cover.jpg',
        category: [categories[4]._id],
        teacher: teachers[3]._id,
        status: 'active',
        level: 'advanced',
        duration: 12600,
        presentationMethod: 'download',
        type: 'vip',
        price: 0,
        previewVideoUrl: 'https://youtube.com/web3-preview',
        chapters: [
          {
            title: 'Blockchain Fundamentals',
            duration: 6300,
            videos: [
              { title: 'What is Blockchain?', duration: 3150, videoUrl: 'https://youtube.com/w1' },
              { title: 'Smart Contracts', duration: 3150, videoUrl: 'https://youtube.com/w2' }
            ]
          }
        ],
      }
    ]);
    console.log('Courses created (1 Free, 1 Paid, 1 VIP)');

    // 7. Payments & Update Users
    const payments = await Payment.insertMany([
      // 1. خرید دوره React با تخفیف (موفق)
      {
        user: students[0]._id,
        courses: [{ course: courses[1]._id, appliedDiscount: 40 }],
        amount: 720000, // 1200000 * 0.6
        authority: 'A0000001',
        refId: '123456789',
        status: 'completed',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },

      // 2. خرید اشتراک 3 ماهه (Sara → VIP)
      {
        user: students[2]._id,
        subscriptionPlan: plans[1]._id,
        amount: 400000,
        authority: 'A0000002',
        refId: '223456789',
        status: 'completed',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },

      // 3. خرید اشتراک 6 ماهه (Hossein → VIP)
      {
        user: students[3]._id,
        subscriptionPlan: plans[2]._id,
        amount: 700000,
        authority: 'A0000003',
        refId: '323456789',
        status: 'completed',
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      },

      // 4. خرید دوره React (Amir) - ناموفق
      {
        user: students[4]._id,
        courses: [{ course: courses[1]._id, appliedDiscount: 0 }],
        amount: 1200000,
        authority: 'A0000004',
        status: 'failed',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },

      // 5. خرید همزمان دوره + اشتراک (Amir → VIP + دوره)
      {
        user: students[4]._id,
        courses: [{ course: courses[1]._id, appliedDiscount: 40 }],
        subscriptionPlan: plans[0]._id,
        amount: 720000 + 150000, // 870000
        authority: 'A0000005',
        refId: '423456789',
        status: 'completed',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
    ]);
    console.log('Payments created (5 records)');

    // به‌روزرسانی کاربران VIP
    await User.updateMany(
      { _id: { $in: [students[2]._id, students[3]._id, students[4]._id] } },
      {
        subscription: 'vip',
        subscriptionExpiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 6 ماه
      }
    );

    // اضافه کردن دوره‌ها به students
    await User.findByIdAndUpdate(students[0]._id, { $push: { coursesEnrolled: courses[1]._id } });
    await User.findByIdAndUpdate(students[4]._id, { $push: { coursesEnrolled: courses[1]._id } });

    // اضافه کردن دوره VIP به کاربران VIP
    await User.updateMany(
      { _id: { $in: [students[2]._id, students[3]._id, students[4]._id] } },
      { $push: { coursesEnrolled: courses[2]._id } }
    );

    // به‌روزرسانی students در دوره‌ها
    await Course.findByIdAndUpdate(courses[0]._id, { $set: { students: [students[0]._id, students[1]._id] } });
    await Course.findByIdAndUpdate(courses[1]._id, { $set: { students: [students[0]._id, students[4]._id] } });
    await Course.findByIdAndUpdate(courses[2]._id, { $set: { students: [students[2]._id, students[3]._id, students[4]._id] } });

    // 8. Baskets
    await Basket.insertMany([
      { user: students[0]._id, courses: [{ course: courses[1]._id, addedAt: new Date() }] },
      { user: students[2]._id, courses: [{ course: courses[2]._id, addedAt: new Date() }] },
    ]);
    console.log('Baskets created');

    // 9. Podcasts
    await Podcast.insertMany([
      {
        title: 'DevTalk #1 - Future of Web',
        description: 'Discussion with top devs',
        duration: 52,
        episode: 1,
        tags: ['web', 'career'],
        audioUrl: '/uploads/podcasts/devtalk1.mp3',
        coverImage: '/uploads/podcasts/cover1.jpg',
        author: teachers[0]._id,
        status: 'published'
      },
    ]);
    console.log('Podcasts created');

    // 10. Notifications
    await Notification.insertMany([
      { user: students[2]._id, title: 'VIP فعال شد', message: 'اشتراک ۳ ماهه شما فعال شد', type: 'system', isRead: false },
      { user: students[4]._id, title: 'پرداخت موفق', message: 'دوره React و اشتراک ۱ ماهه با موفقیت خریداری شد', type: 'system', isRead: false },
      { user: students[4]._id, title: 'دوره جدید', message: 'دوره Web3 در دسترس شماست', type: 'course', relatedId: courses[2]._id, isRead: false },
    ]);
    console.log('Notifications created');

    console.log('Seed completed successfully! Payments, VIP users & history ready.');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  }
};

// Run
(async () => {
  await connectDB();
  await clearDB(); 
  await seedData();
})();