# site60

A business website in 60 seconds, built entirely inside a WhatsApp chat.

A small business owner messages the bot, answers three prompts, and gets a live,
mobile-first website at `theirname.site60.in`. The page has their photos, what they sell,
and one-tap WhatsApp and Call buttons.

## How it works

```
Owner ──WhatsApp──▶ Meta Cloud API ──webhook──▶ Node/Express (this repo)
                                                  │  state machine (bot.js)
                                                  ├─▶ Anthropic API: writes the copy (ai.js)
                                                  ├─▶ sharp → R2: photos as WebP (storage.js)
                                                  └─▶ MongoDB: sessions + sites
Visitor ──▶ *.site60.in (Cloudflare wildcard) ──▶ same server renders the site (site.js, render.js)
```

Nothing is built or deployed per customer. A site is one database row rendered on request
and cached for 60 seconds, so publishing is a single insert and is instant.

## Conversation

| Step | Bot asks | Owner sends |
|---|---|---|
| 1 | Name, what you sell, city, in one message | "Sweet Crumbs, birthday cakes, home bakery in Ludhiana" |
| 2 | Up to 6 photos, then Done (or Skip) | photos |
| 3 | Suggested address: Use this / Pick another | a tap, or a typed name |
| ✅ | The live link and how many seconds it took | |

After launch any message opens the menu: **Edit details**, **Change photos**, **Get my link**.

| Command | What it does |
|---|---|
| `restart`, `reset`, `start over` | Back to the start (or to the menu if a site exists) |
| `delete my site` | Deletes the site, its photos and the chat session after confirmation |
| `number 9876543210` | Shows a different number on the site |
| a shared location pin | Adds the address and a Google Maps link |

## Project layout

```
src/
├── index.js       Express app, webhook routes, graceful shutdown
├── config.js      Environment variables
├── whatsapp.js    Cloud API client: verify, parse, send, download media
├── bot.js         Conversation state machine
├── ai.js          Turns one message into website copy
├── moderation.js  Blocked business terms and brand look-alike slugs
├── storage.js     sharp resize + upload to R2
├── slug.js        Slug creation, validation, availability
├── limits.js      Per-number rate limits and funnel events
├── queue.js       Per-sender in-order message queue
├── db.js          MongoDB connection, collections, indexes
├── site.js        Host-name routing, HTML cache, security headers
├── render.js      Site, landing, privacy, terms and 404 pages
└── log.js         Structured JSON logs
test/
└── unit.test.js
```

## Setup

1. **Domain and DNS.** Put your domain on Cloudflare. Add proxied DNS records for `@` and `*`
   pointing at your server. Universal SSL covers the apex and the first-level wildcard, so every
   `name.site60.in` gets HTTPS automatically.
2. **Images.** Create a Cloudflare R2 bucket, connect a public custom domain such as
   `img.site60.in`, and create an API token with object read and write on that bucket.
3. **Database.** Create a MongoDB Atlas cluster (the free tier is enough), a database user,
   and allow your server's IP address.
4. **WhatsApp.** At developers.facebook.com create a Business app and add the WhatsApp product.
   Register the bot's phone number, create a System User with the `whatsapp_business_messaging`
   permission, and generate a permanent token.
5. **Anthropic.** Create an API key in the Anthropic Console.
6. **Deploy.** `cp .env.example .env`, fill it in, then `npm install` and `npm start`.
   On Railway or Render set the variables in the dashboard and add both `site60.in` and
   `*.site60.in` as custom domains.
7. **Webhook.** In the WhatsApp settings set the callback URL to `https://site60.in/webhook`,
   the verify token to `WA_VERIFY_TOKEN`, and subscribe to the `messages` field.

### Environment variables

| Variable | Used for |
|---|---|
| `ROOT_DOMAIN`, `BRAND_NAME` | Routing, links, page text |
| `BOT_WHATSAPP_NUMBER` | Landing page and "Make yours" links |
| `CONTACT_EMAIL`, `ABUSE_EMAIL` | Privacy page, report links |
| `WA_PHONE_NUMBER_ID`, `WA_TOKEN` | Sending messages, downloading photos |
| `WA_APP_SECRET` | Webhook signature check |
| `WA_VERIFY_TOKEN` | Webhook registration |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_FALLBACK_MODEL` | Copywriting |
| `MONGO_URL`, `MONGO_DB` | Database |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Photo uploads |
| `IMAGE_PUBLIC_BASE` | Photo URLs on sites |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Free Google Gemini key: writes site copy and designs Advanced sites |
| `CF_ACCOUNT_ID`, `CF_AI_TOKEN` | Optional Cloudflare Workers AI for AI-generated pictures |
| `NODE_ENV`, `PORT` | Server |

## Local development

```
npm install
NODE_ENV=development npm run dev
```

Expose port 3000 with `cloudflared tunnel` or ngrok and point a test webhook at the tunnel URL.
View any site at `http://localhost:3000/?site=<slug>`. Run the tests with `npm test`.

## Security

- Webhooks are verified with HMAC-SHA256 (`X-Hub-Signature-256`) and only accepted on the root domain.
- Duplicate deliveries are dropped by message id for 24 hours.
- Every user value is escaped; pages ship a strict Content-Security-Policy.
- Disallowed businesses are refused by the AI check and a keyword blocklist.
- Reserved words and bank or brand look-alike addresses are blocked.
- Photos are re-encoded with EXIF and GPS data removed; storage keys use a hash of the phone number.
- Per-number limits: 3 sites per day, 30 AI calls per day, 20 photos per hour.
- Setting a site's `status` to `suspended` in the database takes it offline with a neutral page.

## Custom domains

Use Cloudflare for SaaS (Custom Hostnames). The customer points a CNAME at your domain;
register the hostname with Cloudflare's API and set `customDomain` on the site row.
`site.js` already routes unknown hosts by `customDomain`. Requests for a custom domain made
during setup are saved as `requestedDomain`.

## Scaling

The per-sender queue, photo acknowledgement timer and page cache live in memory, which is
right for one instance. Before running several instances, move the queue and timer to Redis
(BullMQ) and the cache to Redis or Cloudflare cache rules.
