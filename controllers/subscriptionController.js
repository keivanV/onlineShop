const axios = require('axios');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const User = require('../models/User');
const Payment = require('../models/Payment');
const dotenv = require('dotenv');
//------------------------------------------------------------
dotenv.config();
//------------------------------------------------------------
// PayPing API configuration
const PAYPING_API_KEY = process.env.PAYPING_API_KEY || 'your-payping-api-key';
const PAYPING_BASE_URL = 'https://api.payping.ir/v2';
const MIN_PAYMENT_AMOUNT = 100; // Minimum payment amount in Tomans
const TEST_MODE = process.env.TEST_MODE === 'true'; // Enable test mode via environment variable

const createSubscriptionPlan = async (req, res) => {
  try {
    const { duration, price } = req.body;

    if (!['1month', '3month', '6month'].includes(duration)) {
      console.log(`Create subscription plan failed: Invalid duration: ${duration}`);
      return res.status(400).json({ message: 'Invalid duration. Must be 1month, 3month, or 6month' });
    }
    if (price < 0) {
      console.log(`Create subscription plan failed: Invalid price: ${price}`);
      return res.status(400).json({ message: 'Price must be non-negative' });
    }

    const existingPlan = await SubscriptionPlan.findOne({ duration });
    if (existingPlan) {
      console.log(`Create subscription plan failed: Plan for ${duration} already exists`);
      return res.status(400).json({ message: `Subscription plan for ${duration} already exists` });
    }

    const plan = new SubscriptionPlan({ duration, price });
    await plan.save();
    console.log(`Subscription plan created: ${duration} with price ${price}`);
    res.status(201).json(plan);
  } catch (error) {
    console.error(`Create subscription plan error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while creating subscription plan' });
  }
};

const updateSubscriptionPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { price } = req.body;

    if (price < 0) {
      console.log(`Update subscription plan failed: Invalid price: ${price}`);
      return res.status(400).json({ message: 'Price must be non-negative' });
    }

    const plan = await SubscriptionPlan.findByIdAndUpdate(
      id,
      { price, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!plan) {
      console.log(`Update subscription plan failed: Plan not found: ${id}`);
      return res.status(404).json({ message: 'Subscription plan not found' });
    }

    console.log(`Subscription plan updated: ${plan.duration} to price ${price}`);
    res.status(200).json(plan);
  } catch (error) {
    console.error(`Update subscription plan error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while updating subscription plan' });
  }
};

const getSubscriptionPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find();
    console.log(`Fetched ${plans.length} subscription plans`);
    res.status(200).json(plans);
  } catch (error) {
    console.error(`Get subscription plans error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while fetching subscription plans' });
  }
};

const purchaseSubscription = async (req, res) => {
  try {
    const { subscriptionPlanId } = req.body;
    const userId = req.user.id; 

    console.log(`Received purchaseSubscription request for user: ${userId}, plan: ${subscriptionPlanId}`);

    const plan = await SubscriptionPlan.findById(subscriptionPlanId);
    if (!plan) {
      console.log(`Purchase subscription failed: Plan not found: ${subscriptionPlanId}`);
      return res.status(404).json({ message: 'Subscription plan not found' });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log(`Purchase subscription failed: User not found: ${userId}`);
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.subscription === 'vip' && user.subscriptionExpiresAt && new Date() < user.subscriptionExpiresAt) {
      console.log(`Purchase subscription failed: User ${userId} already has an active VIP subscription`);
      return res.status(400).json({ message: 'You already have an active VIP subscription' });
    }

    const finalPrice = Math.max(MIN_PAYMENT_AMOUNT, plan.price);

    const payment = new Payment({
      user: userId,
      subscriptionPlan: subscriptionPlanId,
      amount: finalPrice,
      authority: `pending-${Date.now()}`,
      status: 'pending'
    });
    await payment.save();

    // Simulate PayPing payment in test mode
    if (TEST_MODE) {
      payment.authority = `test-${Date.now()}`;
      await payment.save();
      console.log(`Test mode: Payment created for user ${userId}, subscription plan ${subscriptionPlanId}, authority: ${payment.authority}`);
      return res.status(200).json({
        message: 'Payment created successfully (test mode)',
        paymentUrl: `http://localhost:3000/payment/callback?paymentId=${payment._id}`,
        authority: payment.authority,
        paymentId: payment._id,
        finalPrice,
        paymentRequired: true
      });
    }

    const paymentData = {
      amount: finalPrice * 10, 
      description: `Payment for ${plan.duration} VIP subscription`,
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
      console.log(`Payment created for user ${userId}, subscription plan ${subscriptionPlanId}, authority: ${response.data.code}`);
      res.status(200).json({
        message: 'Payment created successfully',
        paymentUrl: `https://pay.payping.ir/${response.data.code}`,
        authority: response.data.code,
        paymentId: payment._id,
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
    console.error(`Purchase subscription error: ${error.message}`, { error });
    res.status(500).json({ message: 'Server error while purchasing subscription' });
  }
};

module.exports = { createSubscriptionPlan, updateSubscriptionPlan, getSubscriptionPlans, purchaseSubscription };