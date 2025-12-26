// middleware/authOptional.js
const jwt = require('jsonwebtoken');


const authOptional = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = { _id: decoded.id };
  } catch (err) {
    req.user = null;
  }

  next();
};

module.exports = { authOptional };