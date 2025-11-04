// controllers/userController.js
const User = require('../models/User');
const Course = require('../models/Course');
const Notification = require('../models/Notification');
const Payment = require("../models/Payment");

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const url = (p) => (p ? `${BASE_URL}/uploads/${p}` : null);

const getAllStudents = async (req, res) => {
  try {
    const students = await User.find({ role: 'student' })
      .select('name  phone email role status subscription subscriptionExpiresAt coursesEnrolled profilePic createdAt')
      .populate('coursesEnrolled', 'title coverImage courseRating courseRatingCount type price discount discountEnd')
      .lean();

    const formattedStudents = students.map(student => {
      const enrolledCourses = student.coursesEnrolled.map(course => {
        const isDiscountActive = course.discount > 0 && course.discountEnd && new Date() <= course.discountEnd;
        const finalPrice = course.type === 'paid' && isDiscountActive
          ? Math.round(course.price - (course.price * course.discount) / 100)
          : course.price;

        return {
          courseId: course._id,
          title: course.title,
          coverImage: url(course.coverImage),
          type: course.type,
          price: course.price || 0,
          finalPrice: finalPrice || 0,
          isDiscountActive,
          courseRating: course.courseRating || 0,
          courseRatingCount: course.courseRatingCount || 0
        };
      });

      return {
        id: student._id,
        name: `${student.name}`,
        phone: student.phone,
        email: student.email,
        status: student.status,
        subscription: student.subscription,
        subscriptionExpiresAt: student.subscriptionExpiresAt,
        profilePic: student.profilePic ? url(student.profilePic) : null,
        createdAt: student.createdAt,
        coursesCount: enrolledCourses.length,
        enrolledCourses
      };
    });

    console.log(`Fetched ${formattedStudents.length} students with course details`);
    res.status(200).json(formattedStudents);
  } catch (error) {
    console.error('Get all students error:', error);
    res.status(500).json({ message: 'Server error while fetching students' });
  }
};

const updateStudent = async (req, res) => {
  try {
    const { phone: paramPhone } = req.params;
    const { name, email, phone, birthdate, city, address, profilePic, status, subscription } = req.body;

    const user = await User.findOne({ phone: paramPhone, role: 'student' });
    if (!user) return res.status(404).json({ message: 'Student not found' });

    if (phone && phone !== user.phone) {
      if (!phone.trim()) return res.status(400).json({ message: 'Phone cannot be empty' });
      const existingUser = await User.findOne({ phone });
      if (existingUser && existingUser._id.toString() !== user._id.toString()) {
        return res.status(400).json({ message: 'Phone number already in use' });
      }
      user.phone = phone;
      user.markModified('phone');
    }

    user.name = name || user.name;
    user.email = email || user.email;
    user.birthdate = birthdate || user.birthdate;
    user.city = city || user.city;
    user.address = address || user.address;
    user.profilePic = profilePic || user.profilePic;
    user.status = status || user.status;
    user.subscription = subscription || user.subscription;

    const savedUser = await user.save();
    console.log(`Student updated: ${savedUser.phone}`);
    res.status(200).json(savedUser);
  } catch (error) {
    console.error('Update student error:', error);
    if (error.code === 11000 && error.keyPattern.phone) {
      return res.status(400).json({ message: 'Phone number already in use' });
    }
    res.status(500).json({ message: 'Server error while updating student' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name,  email, birthdate, city, address, profilePic } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.name = name || user.name;
    user.email = email || user.email;
    user.birthdate = birthdate || user.birthdate;
    user.city = city || user.city;
    user.address = address || user.address;
    user.profilePic = profilePic || user.profilePic;

    if (!user.isProfileComplete) user.isProfileComplete = true;

    const savedUser = await user.save();
    res.status(200).json(savedUser);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error while updating profile' });
  }
};

const getAllTeachers = async (req, res) => {
  try {
    const teachers = await User.find({ role: 'teacher' })
      .select('name  phone email expertise bio rating coursesTaught profilePic createdAt')
      .populate({
        path: 'coursesTaught',
        select: 'title coverImage status type students courseRating courseRatingCount',
        match: { status: 'active' }
      })
      .lean();

    const formattedTeachers = teachers.map(teacher => {
      const activeCourses = teacher.coursesTaught || [];
      const taughtCourses = activeCourses.map(course => ({
        courseId: course._id,
        title: course.title,
        coverImage: url(course.coverImage),
        type: course.type,
        studentCount: course.students?.length || 0,
        courseRating: course.courseRating || 0,
        courseRatingCount: course.courseRatingCount || 0
      }));

      return {
        id: teacher._id,
        phone: teacher.phone,
        
        name: `${teacher.name}`,
        email: teacher.email,
        expertise: teacher.expertise || '',
        bio: teacher.bio || '',
        rating: teacher.rating || 0,
        profilePic: teacher.profilePic ? url(teacher.profilePic) : null,
        createdAt: teacher.createdAt,
        coursesCount: taughtCourses.length,
        totalStudents: taughtCourses.reduce((sum, c) => sum + c.studentCount, 0),
        taughtCourses
      };
    });

    console.log(`Fetched ${formattedTeachers.length} teachers with course details`);
    res.status(200).json(formattedTeachers);
  } catch (error) {
    console.error('Get all teachers error:', error);
    res.status(500).json({ message: 'Server error while fetching teachers' });
  }
};

const addTeacher = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || !phone.trim()) return res.status(400).json({ message: 'Phone number is required' });

    const user = await User.findOne({ phone, role: 'student' });
    if (!user) return res.status(404).json({ message: 'Student not found' });

    user.role = 'teacher';
    const savedUser = await user.save();
    console.log(`Teacher added: ${phone}`);
    res.status(200).json(savedUser);
  } catch (error) {
    console.error('Add teacher error:', error);
    res.status(500).json({ message: 'Server error while adding teacher' });
  }
};

const updateTeacher = async (req, res) => {
  try {
    const { phone: paramPhone } = req.params;
    const { name,  email, expertise, phone, nationalId, address, bio, status, profilePic } = req.body;

    const user = await User.findOne({ phone: paramPhone, role: 'teacher' });
    if (!user) return res.status(404).json({ message: 'Teacher not found' });

    if (phone && phone !== user.phone) {
      if (!phone.trim()) return res.status(400).json({ message: 'Phone cannot be empty' });
      const existingUser = await User.findOne({ phone });
      if (existingUser && existingUser._id.toString() !== user._id.toString()) {
        return res.status(400).json({ message: 'Phone number already in use' });
      }
      user.phone = phone;
      user.markModified('phone');
    }

    user.name = name || user.name;
    user.email = email || user.email;
    user.expertise = expertise || user.expertise;
    user.nationalId = nationalId || user.nationalId;
    user.address = address || user.address;
    user.bio = bio || user.bio;
    user.status = status || user.status;
    user.profilePic = profilePic || user.profilePic;

    const savedUser = await user.save();
    console.log(`Teacher updated: ${savedUser.phone}`);
    res.status(200).json(savedUser);
  } catch (error) {
    console.error('Update teacher error:', error);
    if (error.code === 11000 && error.keyPattern.phone) {
      return res.status(400).json({ message: 'Phone number already in use' });
    }
    res.status(500).json({ message: 'Server error while updating teacher' });
  }
};

const getUserDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. اطلاعات کاربر
    const user = await User.findById(userId)
      .select('name  phone email role status subscription subscriptionExpiresAt bio expertise profilePic isProfileComplete createdAt lastLogin')
      .lean();

    if (!user) return res.status(404).json({ message: 'کاربر یافت نشد' });

    // 2. دوره‌های ثبت‌نام شده
    const enrolledCourses = await Course.find({ students: userId, status: 'active' })
      .populate('teacher', 'name  rating expertise bio profilePic')
      .populate('category', 'name')
      .select('title description coverImage level duration type price discount discountEnd previewVideoUrl presentationMethod chapters students createdAt courseRating courseRatingCount')
      .lean();

    const formattedEnrolledCourses = enrolledCourses.map(course => {
      const teacher = course.teacher;
      const finalPrice = course.type === 'paid' && course.discount > 0 && course.discountEnd && new Date() <= course.discountEnd
        ? Math.round(course.price - (course.price * course.discount) / 100)
        : course.price;

      return {
        course: {
          id: course._id,
          title: course.title,
          description: course.description,
          coverImage: url(course.coverImage),
          level: course.level,
          duration: course.duration,
          type: course.type,
          price: course.price || 0,
          discount: course.discount || 0,
          finalPrice,
          isDiscountActive: course.discount > 0 && course.discountEnd && new Date() <= course.discountEnd,
          previewVideoUrl: course.previewVideoUrl,
          presentationMethod: course.presentationMethod,
          chaptersCount: course.chapters?.length || 0,
          studentCount: course.students?.length || 0,
          createdAt: course.createdAt,
          courseRating: course.courseRating || 0,
          courseRatingCount: course.courseRatingCount || 0
        },
        teacher: {
          id: teacher._id,
          name: `${teacher.name} ${teacher}`,
          expertise: teacher.expertise || '',
          bio: teacher.bio || '',
          profilePic: teacher.profilePic ? url(teacher.profilePic) : null,
          rating: teacher.rating || 0
        }
      };
    });

    // 3. کامنت‌های کاربر + اطلاعات دوره
    const coursesWithComments = await Course.find({ 'comments.user': userId })
      .select('title coverImage courseRating courseRatingCount comments')
      .lean();

    const userComments = [];
    for (const course of coursesWithComments) {
      const relevantComments = course.comments
        .filter(c => c.user.toString() === userId.toString())
        .map(c => ({
          commentId: c._id,
          text: c.text,
          rating: c.rating,
          status: c.status,
          createdAt: c.createdAt
        }));

      if (relevantComments.length > 0) {
        userComments.push({
          courseId: course._id,
          courseTitle: course.title,
          courseCover: url(course.coverImage),
          courseRating: course.courseRating || 0,
          courseRatingCount: course.courseRatingCount || 0,
          comments: relevantComments
        });
      }
    }

    // 4. اعلانات
    const notifications = await Notification.find({ user: userId })
      .select('title message type relatedId isRead createdAt')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    // 5. تاریخچه پرداخت
    const recentPayments = await Payment.find({ user: userId })
      .populate('courses.course', 'title coverImage')
      .populate('subscriptionPlan', 'duration')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const paymentHistory = recentPayments.map(p => ({
      paymentId: p._id,
      amount: p.amount,
      status: p.status,
      refId: p.refId || null,
      createdAt: p.createdAt,
      items: [
        ...p.courses.map(c => ({
          type: 'course',
          title: c.course.title,
          coverImage: c.course.coverImage ? url(c.course.coverImage) : null,
          id: c.course._id
        })),
        ...(p.subscriptionPlan ? [{
          type: 'subscription',
          title: `${p.subscriptionPlan.duration.replace('month', ' ماه')} VIP`,
          id: p.subscriptionPlan._id
        }] : [])
      ]
    }));

    const dashboard = {
      user: {
        ...user,
        profilePic: user.profilePic ? url(user.profilePic) : null,
        coursesEnrolledCount: formattedEnrolledCourses.length,
        commentsCount: userComments.reduce((sum, c) => sum + c.comments.length, 0)
      },
      enrolledCourses: formattedEnrolledCourses,
      comments: userComments,
      notifications,
      paymentHistory
    };

    console.log(`Dashboard loaded for user: ${userId}`);
    res.status(200).json(dashboard);
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ message: 'خطای سرور در بارگذاری داشبورد' });
  }
};

module.exports = {
  getAllStudents,
  updateStudent,
  updateProfile,
  getAllTeachers,
  addTeacher,
  updateTeacher,
  getUserDashboard
};