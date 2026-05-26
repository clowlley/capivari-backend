const { v2: cloudinary } = require('cloudinary');

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
  const isVideo = (file.mimetype || '').startsWith('video/');
  const result = await uploadBuffer(file.buffer, {
    ...opts,
    resourceType: isVideo ? 'video' : 'image',
  });
  return result.secure_url;
}

async function uploadFiles(files = []) {
  return Promise.all(files.map((f) => uploadFile(f)));
}

module.exports = { uploadBuffer, uploadFile, uploadFiles, cloudinary };
