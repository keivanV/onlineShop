const jwt = require('jsonwebtoken');
//---------------------------------
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = decoded;
    next();
  });
};
//--------------------------------
const verifyAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
};
//--------------------------------
const verifyUser = (req, res, next) => {
  if (req.user.role === 'admin') return next(); // Admins can access user routes
  if (!['student', 'teacher'].includes(req.user.role)) return res.status(403).json({ message: 'User access required' });
  next();
};

module.exports = { verifyToken, verifyAdmin, verifyUser };