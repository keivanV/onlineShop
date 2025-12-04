// seed.js — نسخه نهایی، کاملاً درست، تست‌شده و حرفه‌ای (2025)

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const User = require('./models/User');
const Category = require('./models/Category');
const Course = require('./models/Course');
const Article = require('./models/Article');

const { ensureDir } = require('./utils/fileSystem');

const SEED_IMAGES_PATH = path.join(__dirname, 'seed-images');
const UPLOADS_PATH = path.join(__dirname, 'uploads');

/* ------------------------------------------------------------------ */
/* Clear all data before seeding                                      */
/* ------------------------------------------------------------------ */
const clearDatabase = async () => {
  console.log('در حال پاکسازی دیتابیس و آپلودها...');

  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }

  if (fs.existsSync(UPLOADS_PATH)) {
    fs.rmSync(UPLOADS_PATH, { recursive: true, force: true });
  }

  ensureDir(path.join(UPLOADS_PATH, 'courses'));
  ensureDir(path.join(UPLOADS_PATH, 'articles'));
  ensureDir(path.join(UPLOADS_PATH, 'profiles'));

  console.log('دیتابیس و آپلودها پاک شدند!\n');
};

/* ------------------------------------------------------------------ */
/* Copy image from seed-images to uploads                             */
/* ------------------------------------------------------------------ */
const copySeedImage = (folder, id, filename) => {
  const source = path.join(SEED_IMAGES_PATH, filename);
  const fallback = path.join(SEED_IMAGES_PATH, 'default.jpg');
  const finalSource = fs.existsSync(source) ? source : (fs.existsSync(fallback) ? fallback : null);

  if (!finalSource) {
    console.warn(`عکس پیدا نشد: ${filename} → استفاده از مسیر پیش‌فرض`);
    return `${folder}/default.jpg`;
  }

  const destFolder = path.join(UPLOADS_PATH, folder, `${folder}_${id}`);
  ensureDir(destFolder);

  const ext = path.extname(finalSource);
  const newName = `cover-${Date.now()}${ext}`;
  const destPath = path.join(destFolder, newName);

  fs.copyFileSync(finalSource, destPath);
  return `${folder}/${folder}_${id}/${newName}`;
};

/* ------------------------------------------------------------------ */
/* Connect to MongoDB                                                 */
/* ------------------------------------------------------------------ */
const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lms');
  console.log('اتصال به MongoDB برقرار شد\n');
};

/* ------------------------------------------------------------------ */
/* Main Seed Function                                                 */
/* ------------------------------------------------------------------ */
const seedData = async () => {
  console.log('شروع سید دیتا با تمام وضعیت‌های واقعی...\n');

  // 1. ادمین
  const admin = await User.findOneAndUpdate(
    { phone: '09120000000' },
    { name: 'ادمین سیستم', email: 'admin@lms.com', role: 'admin', isProfileComplete: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log('ادمین آماده شد');

  // 2. دسته‌بندی‌ها
  const categories = await Category.insertMany([
    { name: 'برنامه‌نویسی', slug: 'programming', displayOrder: 1 },
    { name: 'طراحی وب', slug: 'web-design', displayOrder: 2 },
    { name: 'هوش مصنوعی', slug: 'ai', displayOrder: 3 },
    { name: 'طراحی گرافیک', slug: 'graphic-design', displayOrder: 4 },
    { name: 'توسعه شخصی', slug: 'personal-growth', displayOrder: 5 },
    { name: 'ری‌اکت و نکست', slug: 'react-next', displayOrder: 6 },
  ]);
  console.log(`${categories.length} دسته‌بندی ساخته شد`);

  // 3. مدرسین
  const teachers = await User.insertMany([
    { name: 'محمد احمدی', phone: '09137778888', email: 'mohammad@teacher.com', role: 'teacher', expertise: 'React, Next.js, Node.js', isProfileComplete: true },
    { name: 'زهرا رضایی', phone: '09137778889', email: 'zahra@teacher.com', role: 'teacher', expertise: 'Python, AI, Deep Learning', isProfileComplete: true },
    { name: 'علی محمدی', phone: '09137778890', email: 'ali@teacher.com', role: 'teacher', expertise: 'Figma, UI/UX, Design Systems', isProfileComplete: true },
  ]);
  console.log(`${teachers.length} مدرس ساخته شد`);

  // 4. ۳۰ دانشجوی واقعی (برای تست sold-out کامل)
  const studentNames = [
    'رضا کاظمی', 'فاطمه حسینی', 'سارا نوری', 'حسین اکبری', 'امیر رحیمی',
    'مینا جعفری', 'کاوه مرادی', 'نیما شریفی', 'لیلا احمدی', 'پویا رضوی',
    'مهدی رضایی', 'نازنین کریمی', 'علیرضا محمدی', 'زینب احمدی', 'محمدحسین شریفی',
    'آرش یوسفی', 'سحر قاسمی', 'بهنام حسینی', 'شیدا مرادی', 'کیانوش رحمانی',
    'نرگس موسوی', 'امیرحسین طاهری', 'مهسا رضایی', 'پارسا احمدی', 'یاسمین نجفی',
    'دانیال کریمی', 'رها شریفی', 'آرتین محمدی', 'الناز حسینی', 'سامان یوسفی'
  ];

  const students = [];
  let phoneCounter = 9910000001;

  for (const name of studentNames) {
    const phone = `0${phoneCounter}`;
    const email = `${name.toLowerCase().replace(/ /g, '.')}.${phoneCounter}@student.com`;

    const user = await User.findOneAndUpdate(
      { phone },
      { name, email, role: 'student', isProfileComplete: true },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    students.push(user);
    phoneCounter++;
  }
  console.log(`${students.length} دانشجو ساخته شد (۳۰ نفر واقعی)\n`);

  // 5. دوره‌ها — تمام وضعیت‌های واقعی
  const courseConfigs = [
    {
      title: 'آموزش کامل جاوااسکریپت مدرن 2025',
      image: 'js.jpg',
      teacher: teachers[0]._id,
      category: [categories[0]._id],
      type: 'free',
      status: 'active',
      level: 'مقدماتی',
      capacity: 0,
      students: students.slice(0, 15),
    },
    {
      title: 'ری‌اکت پیشرفته + Next.js 14 + Server Components',
      image: 'react.jpg',
      teacher: teachers[0]._id,
      category: [categories[0]._id, categories[5]._id],
      type: 'paid',
      price: 1_950_000,
      discount: 40,
      discountEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'last-week',
      level: 'پیشرفته',
      capacity: 0,
      students: students.slice(5, 18),
    },
    {
      title: 'هوش مصنوعی مولد با Python و Stable Diffusion',
      image: 'ai.jpg',
      teacher: teachers[1]._id,
      category: [categories[2]._id],
      type: 'paid',
      price: 2_800_000,
      status: 'pre-register',
      registrationEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      level: 'پیشرفته',
      capacity: 30,
      students: students.slice(10, 15),
    },
    {
      title: 'فول‌استک MERN Stack — پروژه فروشگاه (VIP)',
      image: 'mern.jpg',
      teacher: teachers[0]._id,
      category: [categories[0]._id],
      type: 'vip',
      price: 0,
      capacity: 20,
      status: 'active', // pre-save خودش sold-out می‌کنه
      level: 'پیشرفته',
      students: students.slice(0, 20), // دقیقاً ۲۰ نفر → sold-out
    },
    {
      title: 'طراحی UI/UX حرفه‌ای با فیگما',
      image: 'figma.jpg',
      teacher: teachers[2]._id,
      category: [categories[3]._id],
      type: 'free',
      status: 'active',
      level: 'متوسط',
      capacity: 0,
      students: students.slice(8, 25),
    },
    {
      title: 'آموزش کامل Node.js و Express — پروژه بلاگ',
      image: 'node.jpg',
      teacher: teachers[0]._id,
      category: [categories[0]._id],
      type: 'paid',
      price: 1_200_000,
      status: 'finished',
      level: 'متوسط',
      capacity: 50,
      students: students.slice(0, 45), // جا داره ولی finished → ثبت‌نام بازه
    },
  ];

  for (const config of courseConfigs) {
    const course = new Course({
      title: config.title,
      description: `دوره کامل و پروژه‌محور: ${config.title}`,
      teacher: config.teacher,
      category: config.category,
      type: config.type,
      price: config.price || 0,
      discount: config.discount || 0,
      discountEnd: config.discountEnd || undefined,
      status: config.status,
      level: config.level,
      presentationMethod: config.type === 'vip' ? 'قابلیت دریافت' : 'پخش آنلاین',
      duration: Math.floor(12000 + Math.random() * 30000),
      previewVideoUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
      capacity: config.capacity || 0,
      registrationEnd: config.registrationEnd || undefined,
      students: config.students.map(s => s._id),
      chapters: [
        { title: 'مقدمه', duration: 3600, videos: [{ title: 'خوش‌آمدگویی', duration: 1800, videoUrl: 'https://sample.videos/intro.mp4' }] },
        { title: 'مباحث اصلی', duration: 14400, videos: [{ title: 'پروژه عملی', duration: 7200, videoUrl: 'https://sample.videos/project.mp4' }] },
      ],
    });

    await course.save(); // pre-save خودش sold-out رو درست می‌کنه
    course.coverImage = copySeedImage('courses', course._id, config.image);
    await course.save();

    console.log(`✓ ${course.displayStatus} → ${course.title} (${course.students.length}/${course.capacity || 'نامحدود'} دانشجو)`);
  }

  console.log('\nهمه دوره‌ها با وضعیت‌های واقعی ساخته شدند!');

  // 6. مقاله نمونه
  await Article.insertOne({
    title: 'چرا Next.js 14 بهترین انتخاب برای سال ۲۰۲۵ است؟',
    shortDescription: 'بررسی Server Components، App Router و عملکرد فوق‌العاده',
    content: '<p>متن کامل مقاله...</p>',
    featuredImage: copySeedImage('articles', 'next2025', 'react-article.jpg'),
    author: admin._id,
    category: categories[5]._id,
    tags: ['Next.js', 'React', '2025'],
    readingTime: 10,
    status: 'published',
  });

  console.log('\nسید کامل شد! حالا برو به:');
  console.log('http://localhost:5000/api/courses');
  console.log('و ببین که دوره MERN واقعاً sold-out شده');
};

/* ------------------------------------------------------------------ */
/* Run seed                                                           */
/* ------------------------------------------------------------------ */
(async () => {
  try {
    await connectDB();
    await clearDatabase();
    await seedData();
    process.exit(0);
  } catch (err) {
    console.error('\nخطا در سید:', err.message);
    console.error(err);
    process.exit(1);
  }
})();