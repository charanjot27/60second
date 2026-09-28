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

async function upload(key, body) {
  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: body,
      ContentType: 'image/webp',
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

export async function deletePhotos(photos = []) {
  const keys = photos
    .filter((p) => p?.key)
    .flatMap((p) => [`${p.key}-lg.webp`, `${p.key}-sm.webp`]);
  if (!keys.length) return;
  await s3.send(
    new DeleteObjectsCommand({
      Bucket: config.s3.bucket,
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    })
  );
}
