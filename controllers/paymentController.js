const axios = require('axios');
const Course = require('../models/Course');
const User = require('../models/User');
const DiscountCode = require('../models/DiscountCode');
const Payment = require('../models/Payment');
const SubscriptionPlan = require('../models/SubscriptionPlan');
//------------------------------------------------------------
// PayPing API configuration
const PAYPING_API_KEY = process.env.PAYPING_API_KEY || 'your-payping-api-key';
const PAYPING_BASE_URL = 'https://api.payping.ir/v2';

const createPayment = async (req, res) => {
  try {
    const { courseId, discountCode } = req.body;
    const userId = req.user.id; 

    console.log(`Received createPayment request for user: ${userId}, course: ${courseId}, discount: ${discountCode || 'none'}`);

    const course = await Course.findById(courseId);
    if (!course) {
      console.log(`Create payment failed: Course not found: ${courseId}`);
      return res.status(404).json({ message: 'Course not found' });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log(`Create payment failed: User not found: ${userId}`);
      return res.status(404).json({ message: 'User not found' });
    }

    if (course.students.includes(userId)) {
      console.log(`Create payment failed: User ${userId} already enrolled in course ${courseId}`);
      return res.status(400).json({ message: 'You are already enrolled in this course' });
    }

    if (course.type !== 'paid') {
      console.log(`Create payment failed: Payment only required for paid courses: ${courseId}`);
      return res.status(400).json({ message: 'Payment is only required for paid courses' });
    }

    let finalPrice = course.price || 0;
    let courseDiscountAmount = 0;
    let codeDiscountAmount = 0;

    // Apply course discount
    if (course.discount && course.discount > 0) {
      courseDiscountAmount = (finalPrice * course.discount) / 100;
      finalPrice -= courseDiscountAmount;
    }

    // Apply discount code
    if (discountCode) {
      const discount = await DiscountCode.findOne({ code: discountCode.toUpperCase() });
      if (!discount) {
        console.log(`Create payment failed: Discount code not found: ${discountCode}`);
        return res.status(404).json({ message: 'Discount code not found' });
      }
      if (!discount.isActive) {
        console.log(`Create payment failed: Discount code inactive: ${discountCode}`);
        return res.status(400).json({ message: 'Discount code is inactive' });
      }
      if (discount.usedCount >= discount.maxUses) {
        console.log(`Create payment failed: Max uses reached for discount code: ${discountCode}`);
        return res.status(400).json({ message: 'Discount code has reached maximum uses' });
      }
      if (discount.expiresAt && new Date() > discount.expiresAt) {
        console.log(`Create payment failed: Discount code expired: ${discountCode}`);
        return res.status(400).json({ message: 'Discount code has expired' });
      }
      const alreadyUsed = discount.usedBy.some(
        entry => entry.user.toString() === userId.toString() && entry.course.toString() === courseId
      );
      if (alreadyUsed) {
        console.log(`Create payment failed: Discount code already used by user ${userId} for course ${courseId}`);
        return res.status(400).json({ message: 'You have already used this discount code for this course' });
      }

      codeDiscountAmount = (finalPrice * discount.discountPercent) / 100;
      finalPrice -= codeDiscountAmount;
    }

    finalPrice = Math.max(0, finalPrice);

    // If final price is 0, enroll directly
    if (finalPrice === 0) {
      course.students.push(userId);
      await course.save();
      user.coursesEnrolled.push(courseId);
      await user.save();
      if (discountCode) {
        const discount = await DiscountCode.findOne({ code: discountCode.toUpperCase() });
        discount.usedBy.push({ user: userId, course: courseId });
        discount.usedCount += 1;
        await discount.save();
      }
      console.log(`User ${userId} enrolled in course ${courseId} without payment (final price: 0)`);
      return res.status(200).json({
        message: 'Enrolled successfully without payment',
        courseId,
        originalPrice: course.price || 0,
        courseDiscountPercent: course.discount || 0,
        courseDiscountAmount,
        codeDiscountPercent: discountCode ? (await DiscountCode.findOne({ code: discountCode.toUpperCase() }))?.discountPercent || 0 : 0,
        codeDiscountAmount,
        finalPrice,
        paymentRequired: false
      });
    }

    // Create payment record
    const payment = new Payment({
      user: userId,
      course: courseId,
      amount: finalPrice,
      authority: `pending-${Date.now()}`,
      status: 'pending'
    });
    await payment.save();

    // Create PayPing payment
    const paymentData = {
      amount: finalPrice * 10, // Convert Tomans to Rials
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
        message: 'Payment created successfully',
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
      res.status(500).json({ message: 'Failed to create payment' });
    }
  } catch (error) {
    console.error(`Create payment error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while creating payment' });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { paymentId, refId, status } = req.query;
    console.log(`Received verifyPayment request for paymentId: ${paymentId}, refId: ${refId}, status: ${status}`);

    const payment = await Payment.findById(paymentId).populate('user').populate('course').populate('subscriptionPlan');
    if (!payment) {
      console.log(`Verify payment failed: Payment not found: ${paymentId}`);
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (payment.status !== 'pending') {
      console.log(`Verify payment failed: Payment already processed: ${paymentId}, status: ${payment.status}`);
      return res.status(400).json({ message: 'Payment already processed' });
    }

    if (status !== 'OK') {
      payment.status = 'failed';
      await payment.save();
      console.log(`Payment failed with status: ${status} for paymentId: ${paymentId}`);
      return res.status(400).json({ message: 'Payment failed' });
    }

    // Verify payment with PayPing
    const response = await axios.post(`${PAYPING_BASE_URL}/pay/verify`, {
      refId,
      amount: payment.amount * 10 // Convert Tomans to Rials
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
     // if user want buy Course 
      if (payment.course) {
        const course = payment.course;
        course.students.push(user._id);
        await course.save();
        user.coursesEnrolled.push(course._id);
        await user.save();
        console.log(`Payment verified: User ${user._id} enrolled in course ${course._id}, refId: ${refId}`);
        return res.status(200).json({
          message: 'Payment verified and enrolled in course',
          refId,
          courseId: course._id
        });
      }

      // if user want buy VIP 
      if (payment.subscriptionPlan) {
        const plan = payment.subscriptionPlan;
        const durationMonths = { '1month': 1, '3month': 3, '6month': 6 }[plan.duration];
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

        user.subscription = 'vip';
        user.subscriptionExpiresAt = expiresAt;
        await user.save();
        console.log(`Payment verified: User ${user._id} activated VIP subscription for ${plan.duration}, refId: ${refId}`);
        return res.status(200).json({
          message: 'Payment verified and VIP subscription activated',
          refId,
          subscriptionPlanId: plan._id,
          subscriptionExpiresAt: expiresAt
        });
      }

      console.log(`Verify payment failed: Invalid payment type for paymentId: ${paymentId}`);
      return res.status(400).json({ message: 'Invalid payment type' });
    } else {
      payment.status = 'failed';
      await payment.save();
      console.log(`Payment verification failed: ${JSON.stringify(response.data)}`);
      return res.status(400).json({ message: 'Payment verification failed' });
    }
  } catch (error) {
    console.error(`Verify payment error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while verifying payment' });
  }
};

module.exports = { createPayment, verifyPayment };
