const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ */
/* Ensure directory exists                                            */
/* ------------------------------------------------------------------ */
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

/* ------------------------------------------------------------------ */
/* Generate unique course folder name                                 */
/* ------------------------------------------------------------------ */
const generateCourseFolder = (courseId) => {
  return `course_${courseId}`;
};

/* ------------------------------------------------------------------ */
/* Get absolute path for course folder                                */
/* ------------------------------------------------------------------ */
const getCourseBasePath = (courseFolder) => {
  return path.join(__dirname, '..', 'uploads', 'courses', courseFolder);
};

/* ------------------------------------------------------------------ */
/* Delete folder recursively                                          */
/* ------------------------------------------------------------------ */
const deleteFolderRecursive = (dirPath) => {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file) => {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dirPath);
  }
};

/* ------------------------------------------------------------------ */
/* Clean up everything left in the temporary upload folder            */
/* ------------------------------------------------------------------ */
const cleanupTemp = () => {
  const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
  if (!fs.existsSync(tempDir)) return;

  fs.readdirSync(tempDir).forEach((file) => {
    // only delete files that look like Multer uploads (timestamp_...)
    if (/^\d+_/.test(file)) {
      const filePath = path.join(tempDir, file);
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
  });
};

module.exports = {
  ensureDir,
  generateCourseFolder,
  getCourseBasePath,
  deleteFolderRecursive,
  cleanupTemp
};