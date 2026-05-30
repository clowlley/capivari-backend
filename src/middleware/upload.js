const multer = require('multer');
const path = require('path');

const ALLOWED_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif',
  '.mp4', '.mov', '.webm',
  '.mp3', '.wav', '.m4a', '.ogg', '.aac',
]);

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
  'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/aac',
]);

const MAX_FILE_SIZE = 80 * 1024 * 1024; // 80MB (vídeos são comprimidos após o upload)

// Memory storage: arquivos chegam como buffer e são enviados para Cloudinary
const storage = multer.memoryStorage();

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return cb(new Error(`Extensão não permitida: ${ext}`));
  }
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error(`Tipo MIME não permitido: ${file.mimetype}`));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 100,
  },
});

module.exports = upload;
