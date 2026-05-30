const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

function tmpFile(ext) {
  return path.join(os.tmpdir(), `cap_${crypto.randomBytes(8).toString('hex')}${ext}`);
}

/**
 * Comprime/converte imagem ou vídeo ANTES de subir pro Cloudinary,
 * para reduzir de muitos MB para poucos. Best-effort: em qualquer
 * falha (ou se não reduzir), devolve o arquivo original.
 * Áudio e GIF passam direto.
 */
async function compressMedia(file) {
  if (!file || !file.buffer) return file;
  const mime = file.mimetype || '';
  const isImage = mime.startsWith('image/') && mime !== 'image/gif';
  const isVideo = mime.startsWith('video/');
  if (!isImage && !isVideo) return file;

  const inExt = path.extname(file.originalname || '') || (isVideo ? '.mp4' : '.jpg');
  const outExt = isVideo ? '.mp4' : '.jpg';
  const inPath = tmpFile(inExt);
  const outPath = tmpFile(outExt);

  try {
    await fs.writeFile(inPath, file.buffer);

    await new Promise((resolve, reject) => {
      const cmd = ffmpeg(inPath);
      if (isVideo) {
        cmd.outputOptions([
          '-vcodec', 'libx264',
          '-crf', '28',
          '-preset', 'veryfast',
          '-movflags', '+faststart',
          '-pix_fmt', 'yuv420p',
          '-vf', 'scale=min(1280\\,iw):-2',
          '-acodec', 'aac',
          '-b:a', '128k',
        ]);
      } else {
        cmd.outputOptions([
          '-vf', 'scale=min(1600\\,iw):-2',
          '-q:v', '4',
        ]);
      }
      cmd.on('end', resolve).on('error', reject).save(outPath);
    });

    const out = await fs.readFile(outPath);
    if (out.length >= file.buffer.length) return file; // não reduziu → mantém original
    return {
      buffer: out,
      mimetype: isVideo ? 'video/mp4' : 'image/jpeg',
      originalname: (file.originalname || 'media').replace(/\.[^.]+$/, '') + outExt,
    };
  } catch {
    return file; // fallback seguro
  } finally {
    fs.unlink(inPath).catch(() => {});
    fs.unlink(outPath).catch(() => {});
  }
}

module.exports = { compressMedia };
