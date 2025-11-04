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
    console.log('Teachers created (4 teachers)');

    // 5. Students
    const students = await User.insertMany([
      { name: 'Reza', family: 'Kazemi', phone: '09911223344', email: 'reza@lms.com', role: 'student', subscription: 'regular', isProfileComplete: true },
      { name: 'Fatemeh', family: 'Hosseini', phone: '09944556677', email: 'fatemeh@lms.com', role: 'student', subscription: 'regular', isProfileComplete: true },
      { name: 'Sara', family: 'Nouri', phone: '09922334455', email: 'sara@lms.com', role: 'student', subscription: 'regular', isProfileComplete: true },
      { name: 'Hossein', family: 'Akbari', phone: '09933445566', email: 'hossein@lms.com', role: 'student', subscription: 'regular', isProfileComplete: true },
      { name: 'Amir', family: 'Rahimi', phone: '09955667788', email: 'amir@lms.com', role: 'student', subscription: 'regular', isProfileComplete: true },
      { name: 'Mina', family: 'Jafari', phone: '09966778899', email: 'mina@lms.com', role: 'student', subscription: 'regular', isProfileComplete: true },
      { name: 'Kaveh', family: 'Moradi', phone: '09977889900', email: 'kaveh@lms.com', role: 'student', subscription: 'regular', isProfileComplete: true },
      { name: 'Parisa', family: 'Ebrahimi', phone: '09988990011', email: 'parisa@lms.com', role: 'student', subscription: 'regular', isProfileComplete: true },
    ]);
    console.log('Students created (8 total, 3 will become VIP)');

    // 6. Courses — هر معلم ۲ دوره
    const courses = await Course.insertMany([
      // === Teacher 0: Mohammad (2 دوره) ===
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
        previewVideoUrl: 'https://youtube.com/js-preview',
        chapters: [
          { title: 'Variables & Data Types', duration: 3600, videos: [
            { title: 'What is JS?', duration: 1800, videoUrl: 'https://youtube.com/js1' },
            { title: 'let, const, var', duration: 1800, videoUrl: 'https://youtube.com/js2' }
          ]}
        ],
        students: [],
        comments: []
      },
      {
        title: 'Advanced React & Redux',
        description: 'Master React with RTK',
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
          { title: 'Hooks Deep Dive', duration: 5400, videos: [
            { title: 'useEffect & useRef', duration: 2700, videoUrl: 'https://youtube.com/r1' },
            { title: 'Custom Hooks', duration: 2700, videoUrl: 'https://youtube.com/r2' }
          ]}
        ],
        students: [],
        comments: []
      },

      // === Teacher 1: Zahra (2 دوره) ===
      {
        title: 'Python for Data Science',
        description: 'Pandas, NumPy, Matplotlib',
        coverImage: 'courses/python/cover.jpg',
        category: [categories[0]._id, categories[2]._id],
        teacher: teachers[1]._id,
        status: 'active',
        level: 'intermediate',
        duration: 9000,
        presentationMethod: 'streaming',
        type: 'paid',
        price: 950000,
        discount: 25,
        discountEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        previewVideoUrl: 'https://youtube.com/python-preview',
        chapters: [
          { title: 'Data Analysis with Pandas', duration: 4500, videos: [
            { title: 'DataFrames', duration: 2250, videoUrl: 'https://youtube.com/p1' },
            { title: 'Cleaning Data', duration: 2250, videoUrl: 'https://youtube.com/p2' }
          ]}
        ],
        students: [],
        comments: []
      },
      {
        title: 'Machine Learning Fundamentals',
        description: 'From Linear Regression to Neural Networks',
        coverImage: 'courses/ml/cover.jpg',
        category: [categories[2]._id],
        teacher: teachers[1]._id,
        status: 'active',
        level: 'advanced',
        duration: 13500,
        presentationMethod: 'download',
        type: 'vip',
        price: 0,
        previewVideoUrl: 'https://youtube.com/ml-preview',
        chapters: [
          { title: 'Supervised Learning', duration: 6750, videos: [
            { title: 'Regression', duration: 3375, videoUrl: 'https://youtube.com/ml1' },
            { title: 'Classification', duration: 3375, videoUrl: 'https://youtube.com/ml2' }
          ]}
        ],
        students: [],
        comments: []
      },

      // === Teacher 2: Ali (2 دوره) ===
      {
        title: 'UI/UX Design with Figma',
        description: 'From Wireframe to Prototype',
        coverImage: 'courses/figma/cover.jpg',
        category: [categories[1]._id, categories[3]._id],
        teacher: teachers[2]._id,
        status: 'active',
        level: 'beginner',
        duration: 6000,
        presentationMethod: 'streaming',
        type: 'free',
        price: 0,
        previewVideoUrl: 'https://youtube.com/figma-preview',
        chapters: [
          { title: 'Figma Basics', duration: 3000, videos: [
            { title: 'Interface Tour', duration: 1500, videoUrl: 'https://youtube.com/f1' },
            { title: 'Components', duration: 1500, videoUrl: 'https://youtube.com/f2' }
          ]}
        ],
        students: [],
        comments: []
      },
      {
        title: 'Advanced UI Animation',
        description: 'Motion Design with Figma & After Effects',
        coverImage: 'courses/animation/cover.jpg',
        category: [categories[1]._id, categories[3]._id],
        teacher: teachers[2]._id,
        status: 'active',
        level: 'advanced',
        duration: 8400,
        presentationMethod: 'streaming',
        type: 'paid',
        price: 1100000,
        discount: 30,
        discountEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        previewVideoUrl: 'https://youtube.com/anim-preview',
        chapters: [
          { title: 'Micro-interactions', duration: 4200, videos: [
            { title: 'Timing & Easing', duration: 2100, videoUrl: 'https://youtube.com/a1' },
            { title: 'Smart Animate', duration: 2100, videoUrl: 'https://youtube.com/a2' }
          ]}
        ],
        students: [],
        comments: []
      },

      // === Teacher 3: Nima (2 دوره) ===
      {
        title: 'Web3 & Blockchain Development',
        description: 'Build dApps with Solidity & Ethers.js',
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
          { title: 'Blockchain Fundamentals', duration: 6300, videos: [
            { title: 'What is Blockchain?', duration: 3150, videoUrl: 'https://youtube.com/w1' },
            { title: 'Smart Contracts', duration: 3150, videoUrl: 'https://youtube.com/w2' }
          ]}
        ],
        students: [],
        comments: []
      },
      {
        title: 'DeFi & Smart Contracts',
        description: 'Build Decentralized Finance Apps',
        coverImage: 'courses/defi/cover.jpg',
        category: [categories[4]._id],
        teacher: teachers[3]._id,
        status: 'active',
        level: 'advanced',
        duration: 10800,
        presentationMethod: 'streaming',
        type: 'paid',
        price: 1400000,
        discount: 35,
        discountEnd: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
        previewVideoUrl: 'https://youtube.com/defi-preview',
        chapters: [
          { title: 'Uniswap & AMM', duration: 5400, videos: [
            { title: 'Liquidity Pools', duration: 2700, videoUrl: 'https://youtube.com/d1' },
            { title: 'Swaps', duration: 2700, videoUrl: 'https://youtube.com/d2' }
          ]}
        ],
        students: [],
        comments: []
      }
    ]);
    console.log('Courses created (8 total: هر معلم ۲ دوره)');

    // --- بروزرسانی coursesTaught برای معلمان ---
    const teacherCourses = {
      [teachers[0]._id]: [courses[0]._id, courses[1]._id], // Mohammad
      [teachers[1]._id]: [courses[2]._id, courses[3]._id], // Zahra
      [teachers[2]._id]: [courses[4]._id, courses[5]._id], // Ali
      [teachers[3]._id]: [courses[6]._id, courses[7]._id], // Nima
    };

    for (const [teacherId, courseIds] of Object.entries(teacherCourses)) {
      await User.findByIdAndUpdate(teacherId, { $set: { coursesTaught: courseIds } });
    }
    console.log('coursesTaught updated for all teachers (2 courses each)');

    // 7. Enroll students in courses
    const enroll = async (courseIdx, studentIndices) => {
      const course = courses[courseIdx];
      const studentIds = studentIndices.map(i => students[i]._id);
      await Course.findByIdAndUpdate(course._id, { $set: { students: studentIds } });
      await User.updateMany(
        { _id: { $in: studentIds } },
        { $push: { coursesEnrolled: course._id } }
      );
    };

    await enroll(0, [0,1,5,6]); // JS
    await enroll(1, [0,4,5,7]); // React
    await enroll(2, [1,5,6]);   // Python
    await enroll(3, [2,3,4]);   // ML
    await enroll(4, [0,2,7]);   // Figma
    await enroll(5, [1,4,6]);   // Animation
    await enroll(6, [2,3,4]);   // Web3
    await enroll(7, [0,5,7]);   // DeFi

    // 8. Payments
    const payments = await Payment.insertMany([
      { user: students[0]._id, courses: [{ course: courses[1]._id, appliedDiscount: 40 }], amount: 720000, refId: '123456789', status: 'completed' },
      { user: students[2]._id, subscriptionPlan: plans[1]._id, amount: 400000, refId: '223456789', status: 'completed' },
      { user: students[3]._id, subscriptionPlan: plans[2]._id, amount: 700000, refId: '323456789', status: 'completed' },
      { user: students[4]._id, courses: [{ course: courses[1]._id, appliedDiscount: 40 }], subscriptionPlan: plans[0]._id, amount: 870000, refId: '423456789', status: 'completed' },
    ]);
    console.log('Payments created');

    // Update VIP users
    await User.updateMany(
      { _id: { $in: [students[2]._id, students[3]._id, students[4]._id] } },
      { subscription: 'vip', subscriptionExpiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) }
    );

    // 9. Add Approved Comments
    const comments = [
      // Course 0: JS
      { courseId: courses[0]._id, userId: students[0]._id, text: 'عالی بود', rating: 5, status: 'approved' },
      { courseId: courses[0]._id, userId: students[1]._id, text: 'خیلی خوب', rating: 4, status: 'approved' },
      { courseId: courses[0]._id, userId: students[5]._id, text: 'مفید', rating: 5, status: 'approved' },
      { courseId: courses[0]._id, userId: students[6]._id, text: 'متوسط', rating: 3, status: 'approved' },

      // Course 1: React
      { courseId: courses[1]._id, userId: students[0]._id, text: 'عالی', rating: 5, status: 'approved' },
      { courseId: courses[1]._id, userId: students[4]._id, text: 'فوق‌العاده', rating: 5, status: 'approved' },
      { courseId: courses[1]._id, userId: students[5]._id, text: 'خوب', rating: 4, status: 'approved' },
      { courseId: courses[1]._id, userId: students[7]._id, text: 'عالی', rating: 5, status: 'approved' },

      // Course 2: Python
      { courseId: courses[2]._id, userId: students[1]._id, text: 'عملکرد بالا', rating: 5, status: 'approved' },
      { courseId: courses[2]._id, userId: students[5]._id, text: 'مثال‌های واقعی', rating: 4, status: 'approved' },
      { courseId: courses[2]._id, userId: students[6]._id, text: 'سریع', rating: 4, status: 'approved' },

      // Course 3: ML
      { courseId: courses[3]._id, userId: students[2]._id, text: 'عالی', rating: 5, status: 'approved' },
      { courseId: courses[3]._id, userId: students[3]._id, text: 'عمیق', rating: 4, status: 'approved' },
      { courseId: courses[3]._id, userId: students[4]._id, text: 'پیشرفته', rating: 5, status: 'approved' },

      // Course 4: Figma
      { courseId: courses[4]._id, userId: students[0]._id, text: 'طراحی حرفه‌ای', rating: 5, status: 'approved' },
      { courseId: courses[4]._id, userId: students[2]._id, text: 'پروتوتایپ عالی', rating: 5, status: 'approved' },
      { courseId: courses[4]._id, userId: students[7]._id, text: 'مفید', rating: 4, status: 'approved' },

      // Course 5: Animation
      { courseId: courses[5]._id, userId: students[1]._id, text: 'حرکات نرم', rating: 5, status: 'approved' },
      { courseId: courses[5]._id, userId: students[4]._id, text: 'خلاقانه', rating: 5, status: 'approved' },
      { courseId: courses[5]._id, userId: students[6]._id, text: 'جالب', rating: 4, status: 'approved' },

      // Course 6: Web3
      { courseId: courses[6]._id, userId: students[2]._id, text: 'آینده', rating: 5, status: 'approved' },
      { courseId: courses[6]._id, userId: students[3]._id, text: 'ساده', rating: 4, status: 'approved' },
      { courseId: courses[6]._id, userId: students[4]._id, text: 'پیشرفته', rating: 5, status: 'approved' },

      // Course 7: DeFi
      { courseId: courses[7]._id, userId: students[0]._id, text: 'مالی غیرمتمرکز', rating: 5, status: 'approved' },
      { courseId: courses[7]._id, userId: students[5]._id, text: 'جالب', rating: 4, status: 'approved' },
      { courseId: courses[7]._id, userId: students[7]._id, text: 'عالی', rating: 5, status: 'approved' },
    ];

    for (const c of comments) {
      await Course.findByIdAndUpdate(c.courseId, {
        $push: { comments: { user: c.userId, text: c.text, rating: c.rating, status: c.status } }
      });
    }

    // Recalculate course & teacher ratings
    for (const course of courses) {
      const populated = await Course.findById(course._id).select('comments');
      const approved = populated.comments.filter(c => c.status === 'approved');
      const total = approved.reduce((sum, c) => sum + c.rating, 0);
      const count = approved.length;
      const avg = count > 0 ? Number((total / count).toFixed(2)) : 0;

      await Course.findByIdAndUpdate(course._id, {
        courseRating: avg,
        courseRatingCount: count
      });
    }

    for (const teacher of teachers) {
      const taught = await Course.find({ teacher: teacher._id, status: 'active' }).select('courseRating courseRatingCount');
      let totalRating = 0, totalCount = 0;
      taught.forEach(c => {
        if (c.courseRatingCount > 0) {
          totalRating += c.courseRating * c.courseRatingCount;
          totalCount += c.courseRatingCount;
        }
      });
      const rating = totalCount > 0 ? Number((totalRating / totalCount).toFixed(2)) : 0;
      await User.findByIdAndUpdate(teacher._id, { rating });
    }

    console.log('Comments added & ratings calculated');

    // 10. Baskets, Podcasts, Notifications
    await Basket.insertMany([
      { user: students[0]._id, courses: [{ course: courses[1]._id, addedAt: new Date() }] },
      { user: students[2]._id, courses: [{ course: courses[6]._id, addedAt: new Date() }] },
    ]);

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

    await Notification.insertMany([
      { user: students[2]._id, title: 'VIP فعال شد', message: 'اشتراک ۳ ماهه شما فعال شد', type: 'system', isRead: false },
      { user: students[4]._id, title: 'پرداخت موفق', message: 'دوره React و اشتراک ۱ ماهه با موفقیت خریداری شد', type: 'system', isRead: false },
      { user: students[4]._id, title: 'دوره جدید', message: 'دوره Web3 در دسترس شماست', type: 'course', relatedId: courses[6]._id, isRead: false },
    ]);

    console.log('Baskets, Podcasts, Notifications created');
    console.log('Seed completed: هر معلم ۲ دوره دارد!');

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