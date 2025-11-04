const Basket = require('../models/Basket');
const Course = require('../models/Course');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const User = require('../models/User');
const DiscountCode = require('../models/DiscountCode');
const Payment = require('../models/Payment');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const PAYPING_API_KEY = process.env.PAYPING_API_KEY || 'your-payping-api-key';
const PAYPING_BASE_URL = 'https://api.payping.ir/v2';
const MIN_PAYMENT_AMOUNT = 100;
const TEST_MODE = process.env.TEST_MODE === 'true';

const addToBasket = async (req, res) => {
  try {
    const { courseId, subscriptionPlanId, discountCode } = req.body;
    const userId = req.user.id;

    console.log(`Received addToBasket request for user: ${userId}, course: ${courseId || 'none'}, subscription: ${subscriptionPlanId || 'none'}, discount: ${discountCode || 'none'}`);

    if (!courseId && !subscriptionPlanId) {
      console.log('Add to basket failed: At least one of courseId or subscriptionPlanId is required');
      return res.status(400).json({ message: 'حداقل یکی از courseId یا subscriptionPlanId الزامی است' });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log(`Add to basket failed: User not found: ${userId}`);
      return res.status(404).json({ message: 'کاربر یافت نشد' });
    }

    let basket = await Basket.findOne({ user: userId });
    if (!basket) {
      basket = new Basket({ user: userId, courses: [], subscriptionPlan: null });
    }

    if (courseId) {
      const course = await Course.findById(courseId);
      if (!course) {
        console.log(`Add to basket failed: Course not found: ${courseId}`);
        return res.status(404).json({ message: 'دوره یافت نشد' });
      }

      if (course.type !== 'paid') {
        console.log(`Add to basket failed: Only paid courses can be added to basket: ${courseId}`);
        return res.status(400).json({ message: 'فقط دوره‌های پولی می‌توانند به سبد خرید اضافه شوند' });
      }

      if (basket.courses.some(item => item.course.toString() === courseId)) {
        console.log(`Add to basket failed: Course already in basket: ${courseId}`);
        return res.status(400).json({ message: 'این دوره قبلاً در سبد خرید شما وجود دارد' });
      }

      if (user.coursesEnrolled.includes(courseId)) {
        console.log(`Add to basket failed: User already enrolled in course: ${courseId}`);
        return res.status(400).json({ message: 'شما قبلاً در این دوره ثبت‌نام کرده‌اید' });
      }

      let appliedDiscount = 0;
      let discountCodeObj = null;
      if (discountCode) {
        discountCodeObj = await DiscountCode.findOne({ code: discountCode.toUpperCase() });
        if (!discountCodeObj) {
          console.log(`Add to basket failed: Discount code not found: ${discountCode}`);
          return res.status(404).json({ message: 'کد تخفیف یافت نشد' });
        }
        if (!discountCodeObj.isActive) {
          console.log(`Add to basket failed: Discount code inactive: ${discountCode}`);
          return res.status(400).json({ message: 'کد تخفیف غیرفعال است' });
        }
        if (discountCodeObj.usedCount >= discountCodeObj.maxUses) {
          console.log(`Add to basket failed: Max uses reached for discount code: ${discountCode}`);
          return res.status(400).json({ message: 'کد تخفیف به حداکثر تعداد استفاده رسیده است' });
        }
        if (discountCodeObj.expiresAt && new Date() > discountCodeObj.expiresAt) {
          console.log(`Add to basket failed: Discount code expired: ${discountCode}`);
          return res.status(400).json({ message: 'کد تخفیف منقضی شده است' });
        }
        const alreadyUsed = discountCodeObj.usedBy.some(
          entry => entry.user.toString() === userId && entry.course.toString() === courseId
        );
        if (alreadyUsed) {
          console.log(`Add to basket failed: Discount code already used by user ${userId} for course ${courseId}`);
          return res.status(400).json({ message: 'شما قبلاً از این کد تخفیف برای این دوره استفاده کرده‌اید' });
        }

        let coursePrice = course.price || 0;
        if (course.discount && course.discount > 0) {
          coursePrice -= (coursePrice * course.discount) / 100;
        }
        appliedDiscount = (coursePrice * discountCodeObj.discountPercent) / 100;
      }

      basket.courses.push({
        course: courseId,
        discountCode: discountCode ? discountCode.toUpperCase() : null,
        appliedDiscount
      });
    }

    if (subscriptionPlanId) {
      const plan = await SubscriptionPlan.findById(subscriptionPlanId);
      if (!plan) {
        console.log(`Add to basket failed: Subscription plan not found: ${subscriptionPlanId}`);
        return res.status(404).json({ message: 'طرح اشتراک یافت نشد' });
      }

      if (user.subscription === 'vip' && user.subscriptionExpiresAt && new Date() < user.subscriptionExpiresAt) {
        console.log(`Add to basket failed: User ${userId} already has an active VIP subscription`);
        return res.status(400).json({ message: 'شما قبلاً اشتراک VIP فعال دارید' });
      }

      if (basket.subscriptionPlan) {
        console.log(`Add to basket failed: Subscription plan already in basket: ${basket.subscriptionPlan}`);
        return res.status(400).json({ message: 'یک طرح اشتراک قبلاً در سبد خرید شما وجود دارد' });
      }

      basket.subscriptionPlan = subscriptionPlanId;
    }

    await basket.save();
    console.log(`Item(s) added to basket for user ${userId}`);
    res.status(200).json({ message: 'با موفقیت به سبد خرید اضافه شد', basket });
  } catch (error) {
    console.error(`Add to basket error: ${error.message}`, { error });
    res.status(500).json({ message: 'خطا در افزودن به سبد خرید' });
  }
};

const getBasket = async (req, res) => {
  try {
    const userId = req.user.id;

    const basket = await Basket.findOne({ user: userId })
      .populate('courses.course', 'title price discount')
      .populate('subscriptionPlan', 'duration price');
    if (!basket) {
      console.log(`Get basket: No basket found for user ${userId}, returning empty basket`);
      return res.status(200).json({
        user: userId,
        courses: [],
        subscriptionPlan: null,
        totalPrice: 0
      });
    }

    let totalPrice = 0;
    const formattedCourses = basket.courses.map(item => {
      let coursePrice = item.course.price || 0;
      let courseDiscountAmount = 0;
      if (item.course.discount && item.course.discount > 0) {
        courseDiscountAmount = (coursePrice * item.course.discount) / 100;
        coursePrice -= courseDiscountAmount;
      }
      coursePrice -= item.appliedDiscount || 0;
      totalPrice += Math.max(0, coursePrice);
      return {
        courseId: item.course._id,
        title: item.course.title,
        originalPrice: item.course.price || 0,
        courseDiscountPercent: item.course.discount || 0,
        courseDiscountAmount,
        codeDiscountAmount: item.appliedDiscount || 0,
        finalPrice: Math.max(0, coursePrice),
        discountCode: item.discountCode
      };
    });

    let subscriptionPrice = 0;
    let formattedSubscription = null;
    if (basket.subscriptionPlan) {
      subscriptionPrice = basket.subscriptionPlan.price || 0;
      totalPrice += Math.max(0, subscriptionPrice);
      formattedSubscription = {
        subscriptionPlanId: basket.subscriptionPlan._id,
        duration: basket.subscriptionPlan.duration,
        price: subscriptionPrice
      };
    }

    console.log(`Fetched basket for user ${userId}, totalPrice: ${totalPrice}`);
    res.status(200).json({
      user: userId,
      courses: formattedCourses,
      subscriptionPlan: formattedSubscription,
      totalPrice
    });
  } catch (error) {
    console.error(`Get basket error: ${error.message}`, { error });
    res.status(500).json({ message: 'خطا در دریافت سبد خرید' });
  }
};

const removeFromBasket = async (req, res) => {
  try {
    const { courseId, subscriptionPlanId } = req.body;
    const userId = req.user.id;

    console.log(`Received removeFromBasket request for user: ${userId}, course: ${courseId || 'none'}, subscription: ${subscriptionPlanId || 'none'}`);

    if (!courseId && !subscriptionPlanId) {
      console.log('Remove from basket failed: At least one of courseId or subscriptionPlanId is required');
      return res.status(400).json({ message: 'حداقل یکی از courseId یا subscriptionPlanId الزامی است' });
    }

    const basket = await Basket.findOne({ user: userId });
    if (!basket) {
      console.log(`Remove from basket failed: No basket found for user ${userId}`);
      return res.status(404).json({ message: 'سبد خرید یافت نشد' });
    }

    let modified = false;
    if (courseId) {
      const courseIndex = basket.courses.findIndex(item => item.course.toString() === courseId);
      if (courseIndex === -1) {
        console.log(`Remove from basket failed: Course not in basket: ${courseId}`);
        return res.status(404).json({ message: 'دوره در سبد خرید یافت نشد' });
      }
      basket.courses.splice(courseIndex, 1);
      modified = true;
      console.log(`Removed course ${courseId} from basket for user ${userId}`);
    }

    if (subscriptionPlanId) {
      if (!basket.subscriptionPlan || basket.subscriptionPlan.toString() !== subscriptionPlanId) {
        console.log(`Remove from basket failed: Subscription plan not in basket: ${subscriptionPlanId}`);
        return res.status(404).json({ message: 'طرح اشتراک در سبد خرید یافت نشد' });
      }
      basket.subscriptionPlan = null;
      modified = true;
      console.log(`Removed subscription plan ${subscriptionPlanId} from basket for user ${userId}`);
    }

    if (!modified) {
      console.log('Remove from basket failed: No items modified');
      return res.status(400).json({ message: 'هیچ موردی از سبد خرید حذف نشد' });
    }

    await basket.save();
    res.status(200).json({ message: 'با موفقیت از سبد خرید حذف شد', basket });
  } catch (error) {
    console.error(`Remove from basket error: ${error.message}`, { error });
    res.status(500).json({ message: 'خطا در حذف از سبد خرید' });
  }
};

const checkoutBasket = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`Received checkoutBasket request for user: ${userId}`);

    const user = await User.findById(userId);
    if (!user) {
      console.log(`Checkout basket failed: User not found: ${userId}`);
      return res.status(404).json({ message: 'کاربر یافت نشد' });
    }

    const basket = await Basket.findOne({ user: userId })
      .populate('courses.course', 'title price discount type students')
      .populate('subscriptionPlan', 'duration price');
    if (!basket || (!basket.courses.length && !basket.subscriptionPlan)) {
      console.log(`Checkout basket failed: Basket is empty for user ${userId}`);
      return res.status(400).json({ message: 'سبد خرید خالی است' });
    }

    let totalPrice = 0;
    const coursesToEnroll = [];

    for (const item of basket.courses) {
      const course = item.course;
      if (course.type !== 'paid') {
        console.log(`Checkout basket failed: Only paid courses can be checked out: ${course._id}`);
        return res.status(400).json({ message: `دوره ${course.title} پولی نیست و نمی‌تواند پرداخت شود` });
      }
      if (course.students.includes(userId)) {
        console.log(`Checkout basket failed: User already enrolled in course: ${course._id}`);
        return res.status(400).json({ message: `شما قبلاً در دوره ${course.title} ثبت‌نام کرده‌اید` });
      }
      let coursePrice = course.price || 0;
      if (course.discount && course.discount > 0) {
        coursePrice -= (coursePrice * course.discount) / 100;
      }
      coursePrice -= item.appliedDiscount || 0;
      totalPrice += Math.max(0, coursePrice);
      coursesToEnroll.push({
        course: course._id,
        discountCode: item.discountCode,
        appliedDiscount: item.appliedDiscount
      });
    }

    if (basket.subscriptionPlan) {
      const plan = basket.subscriptionPlan;
      if (user.subscription === 'vip' && user.subscriptionExpiresAt && new Date() < user.subscriptionExpiresAt) {
        console.log(`Checkout basket failed: User ${userId} already has an active VIP subscription`);
        return res.status(400).json({ message: 'شما قبلاً اشتراک VIP فعال دارید' });
      }
      totalPrice += Math.max(0, plan.price || 0);
    }

    totalPrice = Math.max(MIN_PAYMENT_AMOUNT, totalPrice);

    const payment = new Payment({
      user: userId,
      courses: coursesToEnroll,
      subscriptionPlan: basket.subscriptionPlan ? basket.subscriptionPlan._id : null,
      amount: totalPrice,
      authority: `pending-${Date.now()}`,
      status: 'pending'
    });
    await payment.save();

    if (TEST_MODE) {
      payment.authority = `test-${Date.now()}`;
      await payment.save();
      await Basket.findOneAndDelete({ user: userId }); // Clear the basket
      console.log(`Test mode: Checkout payment created for user ${userId}, paymentId: ${payment._id}, authority: ${payment.authority}`);
      return res.status(200).json({
        message: 'پرداخت با موفقیت ایجاد شد (حالت تست)',
        paymentUrl: `http://localhost:3000/payment/callback?paymentId=${payment._id}`,
        authority: payment.authority,
        paymentId: payment._id,
        totalPrice,
        paymentRequired: true
      });
    }

    const paymentData = {
      amount: totalPrice * 10,
      description: `Payment for ${basket.courses.length} course(s) and ${basket.subscriptionPlan ? 'VIP subscription' : 'no subscription'}`,
      returnUrl: `${process.env.FRONTEND_URL}/payment/callback?paymentId=${payment._id}`,
      clientRefId: payment._id.toString(),
      payerName: `${user.name} `,
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
      await Basket.findOneAndDelete({ user: userId }); // Clear the basket
      console.log(`Checkout payment created for user ${userId}, paymentId: ${payment._id}, authority: ${response.data.code}`);
      res.status(200).json({
        message: 'پرداخت با موفقیت ایجاد شد',
        paymentUrl: `https://pay.payping.ir/${response.data.code}`,
        authority: response.data.code,
        paymentId: payment._id,
        totalPrice,
        paymentRequired: true
      });
    } else {
      payment.status = 'failed';
      await payment.save();
      console.log(`Checkout payment creation failed: ${JSON.stringify(response.data)}`);
      res.status(500).json({ message: 'ایجاد پرداخت ناموفق بود' });
    }
  } catch (error) {
    console.error(`Checkout basket error: ${error.message}`, { error });
    res.status(500).json({ message: 'خطا در پردازش پرداخت سبد خرید' });
  }
};

module.exports = { addToBasket, getBasket, removeFromBasket, checkoutBasket };