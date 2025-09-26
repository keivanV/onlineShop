
const User = require('../models/User');
const Course = require('../models/Course');
const bcrypt = require('bcryptjs');
//-------------------------------------------------
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
//------------------------------------------------
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

    console.log(`Current student phone: ${user.phone}, Provided phone: ${phone}`);

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
      console.log(`Updating phone for student: ${paramPhone}, Old phone: ${user.phone}, New phone: ${phone}`);
      user.phone = phone;
      user.markModified('phone');
    } else if (!phone) {
      console.log(`No phone provided in request for student: ${paramPhone}`);
    } else {
      console.log(`No phone update for student: ${paramPhone}, provided phone same as current: ${phone}`);
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
      console.log(`MongoDB error: Phone number already in use: ${phone}`);
      return res.status(400).json({ message: 'Phone number already in use' });
    }
    res.status(500).json({ message: 'Server error while updating student' });
  }
};
//---------------------------------------------
const updateProfile = async (req, res) => {
  try {
    const { name, family, email, birthdate, city, address, profilePic, newPassword, confirmNewPassword } = req.body;
    const userId = req.user.id;

    console.log(`Received updateProfile request for user: ${userId}, Body: ${JSON.stringify(req.body, null, 2)}`);

    const user = await User.findById(userId);
    if (!user) {
      console.log(`User not found: ${userId}`);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log(`Current user phone: ${user.phone}, Phone field ignored in updateProfile`);

    if (newPassword || confirmNewPassword) {
      if (!newPassword || !confirmNewPassword) {
        console.log('Password validation failed: Both new password and confirm password are required');
        return res.status(400).json({ message: 'Both new password and confirm password are required' });
      }
      if (newPassword !== confirmNewPassword) {
        console.log('Password validation failed: New passwords do not match');
        return res.status(400).json({ message: 'New passwords do not match' });
      }
      if (!newPassword.trim()) {
        console.log('Password validation failed: New password cannot be empty');
        return res.status(400).json({ message: 'New password cannot be empty' });
      }
      console.log(`Setting plain password for user: ${userId}`);
      user.password = newPassword;
      user.markModified('password');
    }

    user.name = name || user.name;
    user.family = family || user.family;
    user.email = email || user.email;
    user.birthdate = birthdate || user.birthdate;
    user.city = city || user.city;
    user.address = address || user.address;
    user.profilePic = profilePic || user.profilePic;

    const savedUser = await user.save();
    console.log(`User updated: ${userId}, Phone: ${savedUser.phone}`);
    res.status(200).json(savedUser);
  } catch (error) {
    console.log(`Update profile error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while updating profile' });
  }
};
//-------------------------------------------------
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
//-------------------------------------------
const addTeacher = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || !phone.trim()) {
      console.log('Phone validation failed: Phone is empty');
      return res.status(400).json({ message: 'Phone number is required' });
    }

    const user = await User.findOne({ phone, role: 'student' });
    if (!user) {
      console.log(`Student not found with phone: ${phone}`);
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
//--------------------------------------------
const updateTeacher = async (req, res) => {
  try {
    const { phone: paramPhone } = req.params;
    const { name, family, email, expertise, phone, nationalId, address, bio, status, profilePic } = req.body;

    console.log(`Received updateTeacher request for phone: ${paramPhone}, Body: ${JSON.stringify(req.body, null, 2)}`);

    const user = await User.findOne({ phone: paramPhone, role: 'teacher' });
    if (!user) {
      console.log(`Teacher not found: ${paramPhone}`);
      return res.status(404).json({ message: 'Teacher not found' });
    }

    console.log(`Current teacher phone: ${user.phone}, Provided phone: ${phone}`);

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
      console.log(`Updating phone for teacher: ${paramPhone}, Old phone: ${user.phone}, New phone: ${phone}`);
      user.phone = phone;
      user.markModified('phone');
    } else if (!phone) {
      console.log(`No phone provided in request for teacher: ${paramPhone}`);
    } else {
      console.log(`No phone update for teacher: ${paramPhone}, provided phone same as current: ${phone}`);
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
      console.log(`MongoDB error: Phone number already in use: ${phone}`);
      return res.status(400).json({ message: 'Phone number already in use' });
    }
    res.status(500).json({ message: 'Server error while updating teacher' });
  }
};
//----------------------------------------------
const getUserDashboard = async (req, res) => {
  try {
    const userId = req.user.id; 
    const user = await User.findById(userId)
      .populate({
        path: 'coursesEnrolled',
        select: 'title coverImage category teacher status level duration type price',
        populate: [
          { path: 'category', select: 'name' },
          { path: 'teacher', select: 'name family expertise' }
        ]
      })
      .populate({
        path: 'coursesTaught',
        select: 'title coverImage category status level duration type price studentCount',
        populate: { path: 'category', select: 'name' }
      });

    if (!user) {
      console.log(`Dashboard failed: User not found: ${userId}`);
      return res.status(404).json({ message: 'User not found' });
    }

    const dashboardData = {
      role: user.role,
      enrolledCourses: user.coursesEnrolled || [],
      taughtCourses: user.role === 'teacher' ? (user.coursesTaught || []) : []
    };

    console.log(`Dashboard fetched for user ${userId}, role: ${user.role}, enrolled: ${dashboardData.enrolledCourses.length}, taught: ${dashboardData.taughtCourses.length}`);
    res.status(200).json(dashboardData);
  } catch (error) {
    console.error(`Get dashboard error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while fetching dashboard' });
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
