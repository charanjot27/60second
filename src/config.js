import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const env = process.env;
const cents = (value, fallback) => Math.round((value === undefined || value === '' ? fallback : Number(value) || 0) * 100);
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
    leadTemplate: env.WA_LEAD_TEMPLATE || '',
    alertTemplate: env.WA_ALERT_TEMPLATE || '',
    templateLang: env.WA_TEMPLATE_LANG || 'en',
  },
  ai: {
    apiKey: env.ANTHROPIC_API_KEY || '',
    chatModel: env.ANTHROPIC_CHAT_MODEL ?? 'claude-haiku-5-5',
    designModel: env.ANTHROPIC_DESIGN_MODEL || 'claude-opus-5-5',
    designEffort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(env.DESIGN_EFFORT) ? env.DESIGN_EFFORT : 'high',
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
    whisperModel: env.CF_WHISPER_MODEL || '@cf/openai/whisper-large-v3-turbo',
  },
  billing: {
    provider: (env.PAYMENTS || '').toLowerCase(),
    stripeSecret: env.STRIPE_SECRET_KEY || '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    trialHours: Number(env.TRIAL_HOURS) || 24,
    trialsWithoutPayment: /^(on|true|yes|1)$/i.test(env.TRIALS || ''),
    priceLabel: env.PRICE_LABEL || '',
    currency: (env.PRICE_CURRENCY || 'USD').toUpperCase(),
    monthly: cents(env.PRICE_MONTHLY, 9),
    biweekly: cents(env.PRICE_BIWEEKLY, 5),
    domainMargin: cents(env.DOMAIN_MARGIN, 5),
    usdRate: Number(env.USD_RATE) || 1,
    domainMaxUsd: Number(env.DOMAIN_MAX_USD) || 25,
  },
  razorpay: {
    keyId: env.RAZORPAY_KEY_ID || '',
    keySecret: env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '',
    plans: { monthly: env.RAZORPAY_PLAN_ID || '', biweekly: env.RAZORPAY_PLAN_BIWEEKLY_ID || '' },
  },
  porkbun: {
    apiKey: env.PORKBUN_API_KEY || '',
    secretKey: env.PORKBUN_SECRET_KEY || '',
  },
  render: {
    apiKey: env.RENDER_API_KEY || '',
    serviceId: env.RENDER_SERVICE_ID || '',
    hostname: env.RENDER_EXTERNAL_HOSTNAME || '',
    apexIp: env.RENDER_APEX_IP || '216.24.57.1',
  },
  email: {
    resendKey: env.RESEND_API_KEY || '',
    from: env.ALERT_EMAIL_FROM || '',
  },
  adminPassword: env.ADMIN_PASSWORD || '',
  linkSecret: env.LINK_SECRET || env.WA_APP_SECRET || 'site60-links',
  images: {
    openaiKey: env.OPENAI_API_KEY || '',
    openaiModel: env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    geminiModel: env.GEMINI_IMAGE_MODEL || '',
    cfModels: (env.CF_IMAGE_MODELS || env.CF_IMAGE_MODEL || '@cf/leonardo/lucid-origin,@cf/black-forest-labs/flux-1-schnell')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    pexelsKey: env.PEXELS_API_KEY || '',
    pixabayKey: env.PIXABAY_API_KEY || '',
    unsplashKey: env.UNSPLASH_ACCESS_KEY || '',
    appName: env.UNSPLASH_APP_NAME || env.BRAND_NAME || 'site60',
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
    voicePerDay: Number(env.LIMIT_VOICE_PER_DAY) || 20,
    maxVideos: 2,
  },
};

export function siteUrl(slug) {
  return `https://${slug}.${config.rootDomain}`;
}

export function botLink(text = 'Hi') {
  return `https://wa.me/${config.botNumber}?text=${encodeURIComponent(text)}`;
}
