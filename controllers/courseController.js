const Course = require('../models/Course');
const Category = require('../models/Category');
const User = require('../models/User');
const DiscountCode = require('../models/DiscountCode');
//----------------------------------------------------
const getCourses = async (req, res) => {
  try {
    const { status } = req.query; // Extract status query parameter

    // Build query object
    const query = {};
    if (status && ['active', 'pending', 'pre-register'].includes(status)) {
      query.status = status;
    }

    const courses = await Course.find(query)
      .populate('category', 'name')
      .populate('teacher', 'name family expertise')
      .lean();

    const formattedCourses = courses.map(course => ({
      ...course,
      teacherName: course.teacher ? `${course.teacher.name} ${course.teacher.family}` : 'Unknown',
      studentCount: course.students.length,
      expertise: course.teacher?.expertise || ''
    }));

    console.log(`Fetched ${courses.length} courses for user: ${req.user?.id || 'anonymous'}, status filter: ${status || 'none'}`);
    res.status(200).json(formattedCourses);
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ message: 'خطا در دریافت دوره‌ها' });
  }
};

//---------------------------------------
const createCourse = async (req, res) => {
  try {
    const { coverImage, title, category, teacher, status, level, duration, previewVideo, presentationMethod, downloadLink, prerequisites, type, price, discount, chapters } = req.body;

    if (!coverImage || !title || !category || !teacher || !status || !level || !duration || !presentationMethod || !type) {
      console.log('Create course failed: Missing required fields');
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    if (!['free', 'vip', 'paid'].includes(type)) {
      console.log(`Create course failed: Invalid type: ${type}`);
      return res.status(400).json({ message: 'Invalid course type' });
    }

    if (type === 'paid' && (!price || price < 0)) {
      console.log(`Create course failed: Price required for paid course, got: ${price}`);
      return res.status(400).json({ message: 'Price is required for paid courses and must be non-negative' });
    }

    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      console.log(`Create course failed: Invalid category: ${category}`);
      return res.status(400).json({ message: 'Invalid category' });
    }

    const teacherExists = await User.findById(teacher);
    if (!teacherExists || teacherExists.role !== 'teacher') {
      console.log(`Create course failed: Invalid teacher: ${teacher}`);
      return res.status(400).json({ message: 'Invalid teacher' });
    }

    const course = new Course({
      coverImage,
      title,
      category,
      teacher,
      status,
      level,
      duration,
      previewVideo,
      presentationMethod,
      downloadLink,
      prerequisites,
      type,
      price: type === 'paid' ? price : undefined,
      discount: type === 'paid' ? discount : 0,
      chapters
    });

    await course.save();
    console.log(`Course created: ${title} (ID: ${course._id})`);
    res.status(201).json(course);
  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ message: 'Server error while creating course' });
  }
};

const editCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const { coverImage, title, category, teacher, status, level, duration, previewVideo, presentationMethod, downloadLink, prerequisites, type, price, discount, chapters } = req.body;

    const course = await Course.findById(id);
    if (!course) {
      console.log(`Edit course failed: Course not found: ${id}`);
      return res.status(404).json({ message: 'Course not found' });
    }

    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        console.log(`Edit course failed: Invalid category: ${category}`);
        return res.status(400).json({ message: 'Invalid category' });
      }
    }

    if (teacher) {
      const teacherExists = await User.findById(teacher);
      if (!teacherExists || teacherExists.role !== 'teacher') {
        console.log(`Edit course failed: Invalid teacher: ${teacher}`);
        return res.status(400).json({ message: 'Invalid teacher' });
      }
    }

    if (type && !['free', 'vip', 'paid'].includes(type)) {
      console.log(`Edit course failed: Invalid type: ${type}`);
      return res.status(400).json({ message: 'Invalid course type' });
    }

    if (type === 'paid' && (price === undefined || price < 0)) {
      console.log(`Edit course failed: Price required for paid course, got: ${price}`);
      return res.status(400).json({ message: 'Price is required for paid courses and must be non-negative' });
    }

    course.coverImage = coverImage || course.coverImage;
    course.title = title || course.title;
    course.category = category || course.category;
    course.teacher = teacher || course.teacher;
    course.status = status || course.status;
    course.level = level || course.level;
    course.duration = duration || course.duration;
    course.previewVideo = previewVideo || course.previewVideo;
    course.presentationMethod = presentationMethod || course.presentationMethod;
    course.downloadLink = downloadLink || course.downloadLink;
    course.prerequisites = prerequisites || course.prerequisites;
    course.type = type || course.type;
    course.price = type === 'paid' ? price : undefined;
    course.discount = type === 'paid' ? discount || 0 : 0;
    course.chapters = chapters || course.chapters;

    await course.save();
    console.log(`Course updated: ${course.title} (ID: ${id})`);
    res.status(200).json(course);
  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ message: 'Server error while updating course' });
  }
};

const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findByIdAndDelete(id);
    if (!course) {
      console.log(`Delete course failed: Course not found: ${id}`);
      return res.status(404).json({ message: 'Course not found' });
    }
    console.log(`Course deleted: ${id}`);
    res.status(200).json({ message: 'Course deleted' });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ message: 'Server error while deleting course' });
  }
};

const enrollCourse = async (req, res) => {
  try {
    const { courseId } = req.body;
    const userId = req.user.id;

    console.log(`Received enrollCourse request for user: ${userId}, course: ${courseId}`);

    const course = await Course.findById(courseId);
    if (!course) {
      console.log(`Enroll course failed: Course not found: ${courseId}`);
      return res.status(404).json({ message: 'Course not found' });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log(`Enroll course failed: User not found: ${userId}`);
      return res.status(404).json({ message: 'User not found' });
    }

    if (course.students.includes(userId)) {
      console.log(`Enroll course failed: User ${userId} already enrolled in course ${courseId}`);
      return res.status(400).json({ message: 'You are already enrolled in this course' });
    }

    if (course.type === 'paid') {
      console.log(`Enroll course failed: Payment required for course ${courseId}`);
      return res.status(402).json({ message: 'Payment required for this course. Please use the payment API.' });
    }

    if (course.type === 'vip' && !user.isVipActive()) {
      console.log(`Enroll course failed: User ${userId} does not have active VIP subscription for course ${courseId}`);
      return res.status(403).json({ message: 'Active VIP subscription required to enroll in this course' });
    }

    course.students.push(userId);
    await course.save();
    user.coursesEnrolled.push(courseId);
    await user.save();

    console.log(`User ${userId} enrolled in course ${courseId}`);
    res.status(200).json({
      message: 'Enrolled successfully',
      courseId
    });
  } catch (error) {
    console.error(`Enroll course error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while enrolling in course' });
  }
};

const addComment = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { text, rating } = req.body;
    const userId = req.user.id;

    console.log(`Received addComment request for user: ${userId}, course: ${courseId}`);

    const course = await Course.findById(courseId);
    if (!course) {
      console.log(`Add comment failed: Course not found: ${courseId}`);
      return res.status(404).json({ message: 'Course not found' });
    }

    if (!course.students.includes(userId)) {
      console.log(`Add comment failed: User ${userId} not enrolled in course ${courseId}`);
      return res.status(403).json({ message: 'You must be enrolled in the course to comment' });
    }

    course.comments.push({
      user: userId,
      text,
      rating,
      status: 'pending' // Set initial status to pending
    });

    await course.save();
    console.log(`Comment added (pending) to course ${courseId} by user ${userId}`);
    res.status(201).json({ message: 'Comment submitted for approval' });
  } catch (error) {
    console.error(`Add comment error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while adding comment' });
  }
};

const getComments = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findById(courseId).populate('comments.user', 'name family');
    if (!course) {
      console.log(`Get comments failed: Course not found: ${courseId}`);
      return res.status(404).json({ message: 'Course not found' });
    }

    // Filter only approved comments
    const approvedComments = course.comments.filter(comment => comment.status === 'approved');

    res.status(200).json(approvedComments);
  } catch (error) {
    console.error(`Get comments error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while fetching comments' });
  }
};

const approveComment = async (req, res) => {
  try {
    const { courseId, commentId } = req.params;

    const course = await Course.findById(courseId);
    if (!course) {
      console.log(`Approve comment failed: Course not found: ${courseId}`);
      return res.status(404).json({ message: 'Course not found' });
    }

    const comment = course.comments.id(commentId);
    if (!comment) {
      console.log(`Approve comment failed: Comment not found: ${commentId}`);
      return res.status(404).json({ message: 'Comment not found' });
    }

    if (comment.status !== 'pending') {
      console.log(`Approve comment failed: Comment not pending: ${commentId}`);
      return res.status(400).json({ message: 'Comment is not pending' });
    }

    comment.status = 'approved';
    await course.save();

    console.log(`Comment approved: ${commentId} in course ${courseId}`);
    res.status(200).json({ message: 'Comment approved' });
  } catch (error) {
    console.error(`Approve comment error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while approving comment' });
  }
};

const getPendingComments = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findById(courseId).populate('comments.user', 'name family');
    if (!course) {
      console.log(`Get pending comments failed: Course not found: ${courseId}`);
      return res.status(404).json({ message: 'Course not found' });
    }

    // Filter only pending comments
    const pendingComments = course.comments.filter(comment => comment.status === 'pending');

    res.status(200).json(pendingComments);
  } catch (error) {
    console.error(`Get pending comments error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while fetching pending comments' });
  }
};

const getCourse = async (req, res) => {
  try {
    const { idOrName } = req.params;

    let course;
    if (mongoose.Types.ObjectId.isValid(idOrName)) {
      course = await Course.findById(idOrName)
        .populate('category', 'name')
        .populate('teacher', 'name family expertise')
        .populate('students', 'name family')
        .populate('comments.user', 'name family')
        .lean();
    } else {
      course = await Course.findOne({ title: idOrName })
        .populate('category', 'name')
        .populate('teacher', 'name family expertise')
        .populate('students', 'name family')
        .populate('comments.user', 'name family')
        .lean();
    }

    if (!course) {
      console.log(`Get course failed: Course not found: ${idOrName}`);
      return res.status(404).json({ message: 'Course not found' });
    }

    console.log(`Fetched course: ${course.title} (ID: ${course._id})`);
    res.status(200).json(course);
  } catch (error) {
    console.error(`Get course error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while fetching course' });
  }
};

const accessCourseVideo = async (req, res) => {
  try {
    const { courseId, chapterId, videoId } = req.params;
    const userId = req.user.id;

    console.log(`Received accessCourseVideo request for user: ${userId}, course: ${courseId}, chapter: ${chapterId}, video: ${videoId}`);

    const course = await Course.findById(courseId);
    if (!course) {
      console.log(`Access video failed: Course not found: ${courseId}`);
      return res.status(404).json({ message: 'Course not found' });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log(`Access video failed: User not found: ${userId}`);
      return res.status(404).json({ message: 'User not found' });
    }

    if (!course.students.includes(userId)) {
      console.log(`Access video failed: User ${userId} not enrolled in course ${courseId}`);
      return res.status(403).json({ message: 'You are not enrolled in this course' });
    }

    if (course.type === 'vip' && !user.isVipActive()) {
      console.log(`Access video failed: User ${userId} does not have active VIP subscription for course ${courseId}`);
      return res.status(403).json({ message: 'Active VIP subscription required to access this course video' });
    }

    const chapter = course.chapters.id(chapterId);
    if (!chapter) {
      console.log(`Access video failed: Chapter not found: ${chapterId}`);
      return res.status(404).json({ message: 'Chapter not found' });
    }

    const video = chapter.videos.id(videoId);
    if (!video) {
      console.log(`Access video failed: Video not found: ${videoId}`);
      return res.status(404).json({ message: 'Video not found' });
    }

    if (course.presentationMethod === 'streaming') {
      console.log(`Video access granted for user ${userId}: ${video.title} in course ${courseId}`);
      return res.status(200).json({
        message: 'Video access granted',
        video: {
          title: video.title,
          description: video.description,
          duration: video.duration,
          time: video.time,
          streamingLink: video.streamingLink || 'https://example.com/stream/' + videoId
        }
      });
    }

    if (course.presentationMethod === 'download') {
      console.log(`Download access granted for user ${userId}: ${video.title} in course ${courseId}`);
      return res.status(200).json({
        message: 'Download access granted',
        video: {
          title: video.title,
          description: video.description,
          duration: video.duration,
          time: video.time,
          downloadLink: course.downloadLink || 'https://example.com/download/' + videoId
        }
      });
    }

    console.log(`Access video failed: Invalid presentation method for course ${courseId}`);
    return res.status(400).json({ message: 'Invalid presentation method' });
  } catch (error) {
    console.error(`Access video error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while accessing course video' });
  }
};

module.exports = { getCourses, createCourse, editCourse, deleteCourse, enrollCourse, accessCourseVideo, addComment, getComments, approveComment, getPendingComments, getCourse };