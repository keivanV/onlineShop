const axios = require('axios');
const Course = require('../models/Course');
const User = require('../models/User');
const DiscountCode = require('../models/DiscountCode');
const Payment = require('../models/Payment');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const dotenv = require('dotenv');
//------------------------------------------------------------
dotenv.config();
//------------------------------------------------------------
// PayPing API configuration
const PAYPING_API_KEY = process.env.PAYPING_API_KEY || 'your-payping-api-key';
const PAYPING_BASE_URL = 'https://api.payping.ir/v2';
const MIN_PAYMENT_AMOUNT = 100; // Minimum payment amount in Tomans
const TEST_MODE = process.env.TEST_MODE === 'true'; // Enable test mode via environment variable

console.log("========================> " , TEST_MODE);

const createPayment = async (req, res) => {
  try {
    const { courseId, discountCode } = req.body;
    const userId = req.user.id;

    console.log(`Received createPayment request for user: ${userId}, course: ${courseId}, discount: ${discountCode || 'none'}`);

    const course = await Course.findById(courseId);
    if (!course) {
      console.log(`Create payment failed: Course not found: ${courseId}`);
      return res.status(404).json({ message: 'دوره یافت نشد' });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log(`Create payment failed: User not found: ${userId}`);
      return res.status(404).json({ message: 'کاربر یافت نشد' });
    }

    if (course.students.includes(userId)) {
      console.log(`Create payment failed: User ${userId} already enrolled in course ${courseId}`);
      return res.status(400).json({ message: 'شما قبلاً در این دوره ثبت‌نام کرده‌اید' });
    }

    if (course.type !== 'paid') {
      console.log(`Create payment failed: Payment only required for paid courses: ${courseId}`);
      return res.status(400).json({ message: 'پرداخت فقط برای دوره‌های پولی لازم است' });
    }

    let finalPrice = course.price || 0;
    let courseDiscountAmount = 0;
    let codeDiscountAmount = 0;

    if (course.discount && course.discount > 0) {
      courseDiscountAmount = (finalPrice * course.discount) / 100;
      finalPrice -= courseDiscountAmount;
    }

    if (discountCode) {
      const discount = await DiscountCode.findOne({ code: discountCode.toUpperCase() });
      if (!discount) {
        console.log(`Create payment failed: Discount code not found: ${discountCode}`);
        return res.status(404).json({ message: 'کد تخفیف یافت نشد' });
      }
      if (!discount.isActive) {
        console.log(`Create payment failed: Discount code inactive: ${discountCode}`);
        return res.status(400).json({ message: 'کد تخفیف غیرفعال است' });
      }
      if (discount.usedCount >= discount.maxUses) {
        console.log(`Create payment failed: Max uses reached for discount code: ${discountCode}`);
        return res.status(400).json({ message: 'کد تخفیف به حداکثر تعداد استفاده رسیده است' });
      }
      if (discount.expiresAt && new Date() > discount.expiresAt) {
        console.log(`Create payment failed: Discount code expired: ${discountCode}`);
        return res.status(400).json({ message: 'کد تخفیف منقضی شده است' });
      }
      const alreadyUsed = discount.usedBy.some(
        entry => entry.user.toString() === userId && entry.course.toString() === courseId
      );
      if (alreadyUsed) {
        console.log(`Create payment failed: Discount code already used by user ${userId} for course ${courseId}`);
        return res.status(400).json({ message: 'شما قبلاً از این کد تخفیف برای این دوره استفاده کرده‌اید' });
      }

      codeDiscountAmount = (finalPrice * discount.discountPercent) / 100;
      finalPrice -= codeDiscountAmount;
    }

    finalPrice = Math.max(MIN_PAYMENT_AMOUNT, finalPrice);

    const payment = new Payment({
      user: userId,
      courses: [{ course: courseId, discountCode: discountCode ? discountCode.toUpperCase() : null, appliedDiscount: codeDiscountAmount }],
      amount: finalPrice,
      authority: `pending-${Date.now()}`,
      status: 'pending'
    });
    await payment.save();

    if (TEST_MODE) {
      payment.authority = `test-${Date.now()}`;
      await payment.save();
      console.log(`Test mode: Payment created for user ${userId}, course ${courseId}, authority: ${payment.authority}`);
      return res.status(200).json({
        message: 'پرداخت با موفقیت ایجاد شد (حالت تست)',
        paymentUrl: `http://localhost:3000/payment/callback?paymentId=${payment._id}`,
        authority: payment.authority,
        paymentId: payment._id,
        originalPrice: course.price || 0,
        courseDiscountPercent: course.discount || 0,
        courseDiscountAmount,
        codeDiscountPercent: discountCode ? (await DiscountCode.findOne({ code: discountCode.toUpperCase() }))?.discountPercent || 0 : 0,
        codeDiscountAmount,
        finalPrice,
        paymentRequired: true
      });
    }

    const paymentData = {
      amount: finalPrice * 10,
      description: `Payment for course: ${course.title}`,
      returnUrl: `${process.env.FRONTEND_URL}/payment/callback?paymentId=${payment._id}`,
      clientRefId: payment._id.toString(),
      payerName: `${user.name} ${user.family}`,
      payerIdentity: user.phone
    };

    const response = await axios.post(`${PAYPING_BASE_URL}/pay`, paymentData, {
      headers: {
        'Authorization': `Bearer ${PAYPING_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data && response.data.code) {
      payment.authority = response.data.code;
      await payment.save();
      console.log(`Payment created for user ${userId}, course ${courseId}, authority: ${response.data.code}`);
      res.status(200).json({
        message: 'پرداخت با موفقیت ایجاد شد',
        paymentUrl: `https://pay.payping.ir/${response.data.code}`,
        authority: response.data.code,
        paymentId: payment._id,
        originalPrice: course.price || 0,
        courseDiscountPercent: course.discount || 0,
        courseDiscountAmount,
        codeDiscountPercent: discountCode ? (await DiscountCode.findOne({ code: discountCode.toUpperCase() }))?.discountPercent || 0 : 0,
        codeDiscountAmount,
        finalPrice,
        paymentRequired: true
      });
    } else {
      payment.status = 'failed';
      await payment.save();
      console.log(`Payment creation failed: ${JSON.stringify(response.data)}`);
      res.status(500).json({ message: 'ایجاد پرداخت ناموفق بود' });
    }
  } catch (error) {
    console.error(`Create payment error: ${error.message}`, { error });
    res.status(500).json({ message: 'خطا در ایجاد پرداخت' });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { paymentId, refId, status } = req.query;
    console.log(`Received verifyPayment request for paymentId: ${paymentId}, refId: ${refId}, status: ${status}`);

    const payment = await Payment.findById(paymentId).populate('user').populate('courses.course').populate('subscriptionPlan');
    if (!payment) {
      console.log(`Verify payment failed: Payment not found: ${paymentId}`);
      return res.status(404).json({ message: 'پرداخت یافت نشد' });
    }

    if (payment.status !== 'pending') {
      console.log(`Verify payment failed: Payment already processed: ${paymentId}, status: ${payment.status}`);
      return res.status(400).json({ message: 'پرداخت قبلاً پردازش شده است' });
    }

    if (status !== 'OK' && !TEST_MODE) {
      payment.status = 'failed';
      await payment.save();
      console.log(`Payment failed with status: ${status} for paymentId: ${paymentId}`);
      return res.status(400).json({ message: 'پرداخت ناموفق بود' });
    }

    if (TEST_MODE) {
      payment.status = 'completed';
      payment.refId = refId || `test-ref-${Date.now()}`;
      await payment.save();

      const user = payment.user;
      const responseData = {};

      if (payment.courses && payment.courses.length > 0) {
        for (const courseItem of payment.courses) {
          const course = courseItem.course;
          if (!course.students.includes(user._id)) {
            course.students.push(user._id);
            await course.save();
            user.coursesEnrolled.push(course._id);
          }
          if (courseItem.discountCode) {
            const discount = await DiscountCode.findOne({ code: courseItem.discountCode });
            if (discount) {
              discount.usedBy.push({ user: user._id, course: course._id });
              discount.usedCount += 1;
              await discount.save();
            }
          }
        }
        responseData.courses = payment.courses.map(item => item.course._id);
      }

      if (payment.subscriptionPlan) {
        const plan = payment.subscriptionPlan;
        const durationMonths = { '1month': 1, '3month': 3, '6month': 6 }[plan.duration];
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

        user.subscription = 'vip';
        user.subscriptionExpiresAt = expiresAt;
        responseData.subscriptionPlanId = plan._id;
        responseData.subscriptionExpiresAt = expiresAt;
      }

      await user.save();
      console.log(`Test mode: Payment verified: User ${user._id}, courses: ${responseData.courses || 'none'}, subscription: ${responseData.subscriptionPlanId || 'none'}, refId: ${payment.refId}`);
      return res.status(200).json({
        message: 'پرداخت تأیید شد (حالت تست)',
        refId: payment.refId,
        ...responseData
      });
    }

    const response = await axios.post(`${PAYPING_BASE_URL}/pay/verify`, {
      refId,
      amount: payment.amount * 10
    }, {
      headers: {
        'Authorization': `Bearer ${PAYPING_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data && response.data.status === 'OK') {
      payment.status = 'completed';
      payment.refId = refId;
      await payment.save();

      const user = payment.user;
      const responseData = {};

      if (payment.courses && payment.courses.length > 0) {
        for (const courseItem of payment.courses) {
          const course = courseItem.course;
          if (!course.students.includes(user._id)) {
            course.students.push(user._id);
            await course.save();
            user.coursesEnrolled.push(course._id);
          }
          if (courseItem.discountCode) {
            const discount = await DiscountCode.findOne({ code: courseItem.discountCode });
            if (discount) {
              discount.usedBy.push({ user: user._id, course: course._id });
              discount.usedCount += 1;
              await discount.save();
            }
          }
        }
        responseData.courses = payment.courses.map(item => item.course._id);
      }

      if (payment.subscriptionPlan) {
        const plan = payment.subscriptionPlan;
        const durationMonths = { '1month': 1, '3month': 3, '6month': 6 }[plan.duration];
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

        user.subscription = 'vip';
        user.subscriptionExpiresAt = expiresAt;
        responseData.subscriptionPlanId = plan._id;
        responseData.subscriptionExpiresAt = expiresAt;
      }

      await user.save();
      console.log(`Payment verified: User ${user._id}, courses: ${responseData.courses || 'none'}, subscription: ${responseData.subscriptionPlanId || 'none'}, refId: ${refId}`);
      return res.status(200).json({
        message: 'پرداخت با موفقیت تأیید شد',
        refId,
        ...responseData
      });
    } else {
      payment.status = 'failed';
      await payment.save();
      console.log(`Payment verification failed: ${JSON.stringify(response.data)}`);
      return res.status(400).json({ message: 'تأیید پرداخت ناموفق بود' });
    }
  } catch (error) {
    console.error(`Verify payment error: ${error.message}`, { error });
    res.status(500).json({ message: 'خطا در تأیید پرداخت' });
  }
};

module.exports = { createPayment, verifyPayment };