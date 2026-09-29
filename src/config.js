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
    model: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
    fallbackModel: env.ANTHROPIC_FALLBACK_MODEL || '',
    designModel: env.ANTHROPIC_DESIGN_MODEL || 'claude-opus-5-5',
    timeoutMs: 60000,
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
  images: {
    openaiKey: env.OPENAI_API_KEY || '',
    openaiModel: env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    geminiModel: env.GEMINI_IMAGE_MODEL || '',
    cfModel: env.CF_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell',
  },
  imageBase: (env.IMAGE_PUBLIC_BASE || '').replace(/\/+$/, ''),
  adminNumbers: (env.ADMIN_NUMBERS || '')
    .split(',')
    .map((n) => n.replace(/\D/g, ''))
    .filter(Boolean),
  limits: {
    maxPhotos: 6,
    sitesPerDay: Number(env.LIMIT_SITES_PER_DAY) || 3,
    aiCallsPerDay: Number(env.LIMIT_AI_CALLS_PER_DAY) || 30,
    photosPerHour: Number(env.LIMIT_PHOTOS_PER_HOUR) || 20,
    advancedPerDay: Number(env.LIMIT_ADVANCED_PER_DAY) || 3,
    editsPerDay: Number(env.LIMIT_EDITS_PER_DAY) || 15,
  },
};

export function siteUrl(slug) {
  return `https://${slug}.${config.rootDomain}`;
}

export function botLink(text = 'Hi') {
  return `https://wa.me/${config.botNumber}?text=${encodeURIComponent(text)}`;
}
