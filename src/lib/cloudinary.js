const { v2: cloudinary } = require('cloudinary');
const { compressMedia } = require('./media');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const FOLDER = process.env.CLOUDINARY_FOLDER || 'capivari';

function uploadBuffer(buffer, { folder = FOLDER, resourceType = 'image' } = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        // qualidade/formato otimizados automaticamente quando servir
        ...(resourceType === 'image' ? {} : {}),
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

async function uploadFile(file, opts = {}) {
  if (!file || !file.buffer) return null;
  // Comprime/converte localmente (ffmpeg) antes de subir, reduzindo o tamanho
  const processed = await compressMedia(file);
  const mime = processed.mimetype || '';
  // Cloudinary: 'video' resource_type cobre tanto vídeo quanto áudio
  const isMedia = mime.startsWith('video/') || mime.startsWith('audio/');
  const result = await uploadBuffer(processed.buffer, {
    ...opts,
    resourceType: isMedia ? 'video' : 'image',
  });
  return result.secure_url;
}

async function uploadFiles(files = []) {
  return Promise.all(files.map((f) => uploadFile(f)));
}

module.exports = { uploadBuffer, uploadFile, uploadFiles, cloudinary };
