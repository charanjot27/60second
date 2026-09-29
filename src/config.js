import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const env = process.env;
const rootDomain = (env.ROOT_DOMAIN || 'site60.in').toLowerCase();

export const config = {
  isProd: env.NODE_ENV === 'production',
  port: Number(env.PORT) || 3000,
  brand: env.BRAND_NAME || 'site60',
  rootDomain,
  botNumber: (env.BOT_WHATSAPP_NUMBER || '').replace(/\D/g, ''),
  contactEmail: env.CONTACT_EMAIL || `hello@${rootDomain}`,
  abuseEmail: env.ABUSE_EMAIL || `abuse@${rootDomain}`,
  wa: {
    phoneNumberId: env.WA_PHONE_NUMBER_ID || '',
    token: env.WA_TOKEN || '',
    appSecret: env.WA_APP_SECRET || '',
    verifyToken: env.WA_VERIFY_TOKEN || '',
    apiVersion: env.WA_API_VERSION || 'v21.0',
  },
  ai: {
    apiKey: env.ANTHROPIC_API_KEY || '',
    model: env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    fallbackModel: env.ANTHROPIC_FALLBACK_MODEL || '',
    timeoutMs: 25000,
  },
  gemini: {
    apiKey: env.GEMINI_API_KEY || '',
    model: env.GEMINI_MODEL || 'gemini-2.5-flash',
  },
  mongo: {
    url: env.MONGO_URL || 'mongodb://127.0.0.1:27017',
    db: env.MONGO_DB || 'site60',
  },
  s3: {
    endpoint: env.S3_ENDPOINT || '',
    bucket: env.S3_BUCKET || '',
    accessKeyId: env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY || '',
    region: env.S3_REGION || 'auto',
  },
  cf: {
    accountId: env.CF_ACCOUNT_ID || '',
    apiToken: env.CF_AI_TOKEN || '',
  },
  imageBase: (env.IMAGE_PUBLIC_BASE || '').replace(/\/+$/, ''),
  limits: {
    maxPhotos: 6,
    sitesPerDay: 3,
    aiCallsPerDay: 30,
    photosPerHour: 20,
    advancedPerDay: 3,
  },
};

export function siteUrl(slug) {
  return `https://${slug}.${config.rootDomain}`;
}

export function botLink(text = 'Hi') {
  return `https://wa.me/${config.botNumber}?text=${encodeURIComponent(text)}`;
}
