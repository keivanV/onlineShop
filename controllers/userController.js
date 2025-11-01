const User = require('../models/User');
const Course = require('../models/Course');
const Notification = require('../models/Notification');

const getAllStudents = async (req, res) => {
  try {
    const students = await User.find({ role: 'student' }).select('name family phone email createdAt status subscription coursesEnrolled lastLogin');
    const formattedStudents = students.map(student => ({
      ...student._doc,
      coursesCount: student.coursesEnrolled.length
    }));
    console.log(`Fetched ${students.length} students for admin`);
    res.status(200).json(formattedStudents);
  } catch (error) {
    console.log(`Get students error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while fetching students' });
  }
};

const updateStudent = async (req, res) => {
  try {
    const { phone: paramPhone } = req.params;
    const { name, family, email, phone, birthdate, city, address, profilePic, status, subscription } = req.body;

    console.log(`Received updateStudent request for phone: ${paramPhone}, Body: ${JSON.stringify(req.body, null, 2)}`);

    const user = await User.findOne({ phone: paramPhone, role: 'student' });
    if (!user) {
      console.log(`Student not found: ${paramPhone}`);
      return res.status(404).json({ message: 'Student not found' });
    }

    if (phone && phone !== user.phone) {
      if (!phone.trim()) {
        console.log('Phone validation failed: Phone is empty');
        return res.status(400).json({ message: 'Phone cannot be empty' });
      }
      const existingUser = await User.findOne({ phone });
      if (existingUser && existingUser._id.toString() !== user._id.toString()) {
        console.log(`Phone validation failed: Phone already in use: ${phone}`);
        return res.status(400).json({ message: 'Phone number already in use' });
      }
      user.phone = phone;
      user.markModified('phone');
    }

    user.name = name || user.name;
    user.family = family || user.family;
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
    console.log(`Update student error: ${error.message}`, { error });
    if (error.code === 11000 && error.keyPattern.phone) {
      return res.status(400).json({ message: 'Phone number already in use' });
    }
    res.status(500).json({ message: 'Server error while updating student' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, family, email, birthdate, city, address, profilePic } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.name = name || user.name;
    user.family = family || user.family;
    user.email = email || user.email;
    user.birthdate = birthdate || user.birthdate;
    user.city = city || user.city;
    user.address = address || user.address;
    user.profilePic = profilePic || user.profilePic;

    if (!user.isProfileComplete) {
      user.isProfileComplete = true;
    }

    const savedUser = await user.save();
    res.status(200).json(savedUser);
  } catch (error) {
    console.log(`Update profile error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while updating profile' });
  }
};

const getAllTeachers = async (req, res) => {
  try {
    const teachers = await User.find({ role: 'teacher' }).select('name family email coursesTaught rating status expertise');
    const formattedTeachers = teachers.map(teacher => ({
      ...teacher._doc,
      coursesCount: teacher.coursesTaught.length
    }));
    console.log(`Fetched ${teachers.length} teachers for admin`);
    res.status(200).json(formattedTeachers);
  } catch (error) {
    console.log(`Get teachers error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while fetching teachers' });
  }
};


const addTeacher = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || !phone.trim()) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    const user = await User.findOne({ phone, role: 'student' });
    if (!user) {
      return res.status(404).json({ message: 'Student not found' });
    }

    user.role = 'teacher';
    const savedUser = await user.save();
    console.log(`Teacher added: ${phone}`);
    res.status(200).json(savedUser);
  } catch (error) {
    console.log(`Add teacher error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while adding teacher' });
  }
};

const updateTeacher = async (req, res) => {
  try {
    const { phone: paramPhone } = req.params;
    const { name, family, email, expertise, phone, nationalId, address, bio, status, profilePic } = req.body;

    const user = await User.findOne({ phone: paramPhone, role: 'teacher' });
    if (!user) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    if (phone && phone !== user.phone) {
      if (!phone.trim()) {
        return res.status(400).json({ message: 'Phone cannot be empty' });
      }
      const existingUser = await User.findOne({ phone });
      if (existingUser && existingUser._id.toString() !== user._id.toString()) {
        return res.status(400).json({ message: 'Phone number already in use' });
      }
      user.phone = phone;
      user.markModified('phone');
    }

    user.name = name || user.name;
    user.family = family || user.family;
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
    console.log(`Update teacher error: ${error.message}`, { error });
    if (error.code === 11000 && error.keyPattern.phone) {
      return res.status(400).json({ message: 'Phone number already in use' });
    }
    res.status(500).json({ message: 'Server error while updating teacher' });
  }
};

const getUserDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. اطلاعات کامل کاربر
    const user = await User.findById(userId)
      .select('name family phone email role status subscription subscriptionExpiresAt bio expertise profilePic isProfileComplete createdAt lastLogin')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'کاربر یافت نشد' });
    }

    // 2. دوره‌های ثبت‌نام شده + اطلاعات کامل + مدرس
    const enrolledCourses = await Course.find({ students: userId, status: 'active' })
      .populate('teacher', 'name family expertise bio profilePic')
      .populate('category', 'name')
      .select('title description coverImage level duration type price discount discountEnd previewVideoUrl presentationMethod chapters students createdAt')
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
          coverImage: course.coverImage,
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
          createdAt: course.createdAt
        },
        teacher: {
          id: teacher._id,
          name: `${teacher.name} ${teacher.family}`,
          expertise: teacher.expertise || '',
          bio: teacher.bio || '',
          profilePic: teacher.profilePic ? teacher.profilePic : null
        }
      };
    });

    // 3. کامنت‌های کاربر + دوره مربوطه
    const coursesWithComments = await Course.find({ 'comments.user': userId })
      .select('title comments')
      .lean();

    const userComments = [];
    for (const course of coursesWithComments) {
      const relevantComments = course.comments
        .filter(c => c.user.toString() === userId.toString())
        .map(c => ({
          commentId: c._id,
          text: c.text,
          rating: c.rating || 0,
          status: c.status,
          createdAt: c.createdAt
        }));

      userComments.push({
        courseId: course._id,
        courseTitle: course.title,
        comments: relevantComments
      });
    }

    // 4. اعلانات کاربر
    const notifications = await Notification.find({ user: userId })
      .select('title message type relatedId isRead createdAt')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();


    // 5. تاریخچه پرداخت (آخرین 10)
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
          coverImage: c.course.coverImage ? `${BASE_URL}/uploads/${c.course.coverImage}` : null,
          id: c.course._id
        })),
        ...(p.subscriptionPlan ? [{
          type: 'subscription',
          title: `${p.subscriptionPlan.duration.replace('month', ' ماه')} VIP`,
          id: p.subscriptionPlan._id
        }] : [])
      ]
    }));
      
    // پاسخ نهایی
    const dashboard = {
      user: {
        ...user,
        profilePic: user.profilePic ? user.profilePic : null,
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