import crypto from 'node:crypto';
import sharp from 'sharp';
import { S3Client, PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { config } from './config.js';
import { hashPhone } from './log.js';

const s3 = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint || undefined,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
});

const SIZES = { lg: 1200, sm: 480 };

async function upload(key, body, contentType = 'image/webp') {
  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
  return `${config.imageBase}/${key}`;
}

export async function processAndUpload(buffer, ownerPhone) {
  const base = `p/${hashPhone(ownerPhone)}/${crypto.randomBytes(8).toString('hex')}`;
  const source = sharp(buffer, { limitInputPixels: 50_000_000 }).rotate();

  const [lg, sm] = await Promise.all(
    Object.values(SIZES).map((width) =>
      source
        .clone()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer({ resolveWithObject: true })
    )
  );

  const [lgUrl, smUrl] = await Promise.all([
    upload(`${base}-lg.webp`, lg.data),
    upload(`${base}-sm.webp`, sm.data),
  ]);

  return { key: base, lg: lgUrl, sm: smUrl, w: lg.info.width, h: lg.info.height };
}

const VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov', 'video/webm': 'webm' };

export async function uploadVideo(buffer, mimeType, ownerPhone) {
  const type = String(mimeType || '').split(';')[0].trim().toLowerCase();
  const ext = VIDEO_TYPES[type];
  if (!ext) throw new Error(`Unsupported video type ${type}`);
  const key = `v/${hashPhone(ownerPhone)}/${crypto.randomBytes(8).toString('hex')}.${ext}`;
  const url = await upload(key, buffer, type);
  return { key, url, type, size: buffer.length };
}

export async function deleteVideos(videos = []) {
  const keys = videos.filter((v) => v?.key).map((v) => v.key);
  if (keys.length) await removeKeys(keys);
}

export async function deletePhotos(photos = []) {
  const keys = photos
    .filter((p) => p?.key)
    .flatMap((p) => [`${p.key}-lg.webp`, `${p.key}-sm.webp`]);
  if (keys.length) await removeKeys(keys);
}

async function removeKeys(keys) {
  await s3.send(
    new DeleteObjectsCommand({
      Bucket: config.s3.bucket,
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    })
  );
}
