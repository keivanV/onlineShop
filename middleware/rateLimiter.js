const rateLimitStore = new Map(); // In-memory store for rate limiting

const otpRateLimiter = (req, res, next) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ message: 'Phone number is required' });

  const now = Date.now();
  const lastRequest = rateLimitStore.get(phone);

  if (lastRequest && now - lastRequest < 60 * 1000) { // 1 minute in milliseconds
    return res.status(429).json({ message: 'Please wait 1 minute before requesting another OTP' });
  }

  rateLimitStore.set(phone, now);
  next();
};

module.exports = { otpRateLimiter };