// utils/fileSystem.js
const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ */
/* Ensure a directory exists (recursive)                              */
/* ------------------------------------------------------------------ */
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

/* ------------------------------------------------------------------ */
/* Save an uploaded file and return relative path                     */
/* ------------------------------------------------------------------ */
const saveFile = (file, destFolder) => {
  if (!file) return null;
  ensureDir(destFolder);
  const fileName = `${Date.now()}_${file.originalname}`;
  const filePath = path.join(destFolder, fileName);
  fs.renameSync(file.path, filePath);
  return path.relative(path.join(__dirname, '..', 'uploads'), filePath).replace(/\\/g, '/');
};

/* ------------------------------------------------------------------ */
/* Clean temporary upload folder (old Multer files)                  */
/* ------------------------------------------------------------------ */
const cleanupTemp = () => {
  const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
  if (!fs.existsSync(tempDir)) return;

  fs.readdirSync(tempDir).forEach((file) => {
    if (/^\d+_/.test(file)) {
      const filePath = path.join(tempDir, file);
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
  });
};

module.exports = { ensureDir, saveFile, cleanupTemp };