// middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const audioDir = path.join(__dirname, '..', 'uploads', 'podcasts', 'audio');
const coverDir = path.join(__dirname, '..', 'uploads', 'podcasts', 'cover');

[audioDir, coverDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'audio') {
      cb(null, audioDir);
    } else if (file.fieldname === 'coverImage') {
      cb(null, coverDir);
    } else {
      cb(new Error('Invalid field name'));
    }
  },
  filename: (req, file, cb) => {
    const prefix = file.fieldname === 'audio' ? 'podcast' : 'cover';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${prefix}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'audio' && file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else if (file.fieldname === 'coverImage' && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type for ${file.fieldname}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
}).fields([
  { name: 'audio', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 }
]);

module.exports = upload;