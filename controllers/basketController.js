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


const applyDiscountCode = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user._id;

    const basket = await Basket.findOne({ user: userId })
      .populate('courses.course', 'price discount')
      .populate('subscriptionPlan', 'price');

    if (!basket || (!basket.courses.length && !basket.subscriptionPlan)) {
      return res.status(400).json({ message: 'سبد خرید خالی است' });
    }

    const discountCode = await DiscountCode.findOne({ code: code.toUpperCase() });
    if (!discountCode) return res.status(404).json({ message: 'کد تخفیف یافت نشد' });

    if (!discountCode.isActive) return res.status(400).json({ message: 'کد تخفیف غیرفعال است' });
    if (discountCode.expiresAt && new Date() > discountCode.expiresAt) return res.status(400).json({ message: 'کد تخفیف منقضی شده' });
    if (discountCode.usedCount >= discountCode.maxUses) return res.status(400).json({ message: 'کد تخفیف به حداکثر استفاده رسیده' });

    // محاسبه جمع قبل از تخفیف
    let total = 0;
    basket.courses.forEach(item => {
      let price = item.course.price || 0;
      if (item.course.discount > 0) price *= (1 - item.course.discount / 100);
      total += price;
    });
    if (basket.subscriptionPlan) total += basket.subscriptionPlan.price || 0;

    const discountAmount = Math.round((total * discountCode.discountPercent) / 100);

    basket.discountCode = code.toUpperCase();
    basket.appliedDiscountAmount = discountAmount;
    await basket.save();

    discountCode.usedCount += 1;
    discountCode.usedBy.push({ user: userId });
    await discountCode.save();

    res.json({
      message: 'کد تخفیف با موفقیت اعمال شد',
      discountAmount,
      newTotal: total - discountAmount
    });

  } catch (error) {
    console.error('Apply discount error:', error);
    res.status(500).json({ message: 'خطا در اعمال کد تخفیف' });
  }
};


const removeDiscountCode = async (req, res) => {
  try {
    const userId = req.user._id;
    const basket = await Basket.findOne({ user: userId });
    if (!basket || !basket.discountCode) {
      return res.status(400).json({ message: 'کد تخفیفی اعمال نشده' });
    }

    basket.discountCode = null;
    basket.appliedDiscountAmount = 0;
    await basket.save();

    res.json({ message: 'کد تخفیف حذف شد' });
  } catch (error) {
    res.status(500).json({ message: 'خطا در حذف کد تخفیف' });
  }
};

const addToBasket = async (req, res) => {
  try {
    const { courseId, subscriptionPlanId } = req.body;
    const userId = req.user.id; 

    console.log('addToBasket → user:', userId, 'courseId:', courseId, 'plan:', subscriptionPlanId);

    if (!courseId && !subscriptionPlanId) {
      return res.status(400).json({ message: 'دوره یا طرح اشتراک الزامی است' });
    }

    let basket = await Basket.findOne({ user: userId });
    if (!basket) {
      basket = new Basket({ user: userId, courses: [], discountCode: null, appliedDiscountAmount: 0 });
    }

    if (courseId) {
      const course = await Course.findById(courseId);
      if (!course) return res.status(404).json({ message: 'دوره یافت نشد' });
      if (course.type !== 'paid') return res.status(400).json({ message: 'فقط دوره‌های پولی قابل خرید هستند' });

      const alreadyInBasket = basket.courses.some(c => c.course.toString() === courseId);
      if (alreadyInBasket) return res.status(400).json({ message: 'دوره قبلاً در سبد است' });

      basket.courses.push({ course: courseId });
    }

    if (subscriptionPlanId) {
      if (basket.subscriptionPlan) {
        return res.status(400).json({ message: 'یک طرح اشتراک قبلاً اضافه شده' });
      }
      const plan = await SubscriptionPlan.findById(subscriptionPlanId);
      if (!plan) return res.status(404).json({ message: 'طرح اشتراک یافت نشد' });
      basket.subscriptionPlan = subscriptionPlanId;
    }

    await basket.save();
    console.log('سبد با موفقیت ذخیره شد:', basket);

    res.json({
      message: 'با موفقیت به سبد خرید اضافه شد',
      basket
    });

  } catch (err) { // ← اینجا err نوشتم نه error
    console.error('خطا در addToBasket:', err.message);
    console.error('استک کامل:', err);
    res.status(500).json({
      message: 'خطا در افزودن به سبد خرید',
      error: err.message
    });
  }
};



const getBasket = async (req, res) => {
  try {
    const userId = req.user.id;

    const basket = await Basket.findOne({ user: userId })
      .populate('courses.course', 'title description coverImage price discount')
      .populate('subscriptionPlan', 'name price duration');

    if (!basket || (!basket.courses.length && !basket.subscriptionPlan)) {
      return res.json({ courses: [], subscriptionPlan: null, total: 0 });
    }

    let total = 0;
    const courses = basket.courses.map(item => {
      const c = item.course;
      const price = c.price || 0;
      const discount = c.discount || 0;
      const final = price * (1 - discount / 100);
      total += final;

      return {
        id: c._id,
        title: c.title,
        description: c.description || 'بدون توضیحات',
        coverImage: c.coverImage ? `${process.env.BASE_URL || 'http://localhost:5000'}/uploads/${c.coverImage}` : null,
        price,
        discount,
        finalPrice: Math.round(final)
      };
    });

    if (basket.subscriptionPlan) {
      total += basket.subscriptionPlan.price || 0;
    }

    let discountAmount = basket.appliedDiscountAmount || 0;
    const finalTotal = Math.max(100, total - discountAmount);

    res.json({
      courses,
      subscriptionPlan: basket.subscriptionPlan ? {
        id: basket.subscriptionPlan._id,
        name: basket.subscriptionPlan.name,
        price: basket.subscriptionPlan.price
      } : null,
      discountCode: basket.discountCode,
      discountAmount,
      totalBeforeDiscount: total,
      totalAfterDiscount: finalTotal
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطای دریافت سبد' });
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

module.exports = { addToBasket, getBasket, removeFromBasket, checkoutBasket , applyDiscountCode , removeDiscountCode};