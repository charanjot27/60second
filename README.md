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
                                                  ├─▶ Claude Opus: art direction, page design, chat edits (generate.js)
                                                  ├─▶ image models: AI pictures for Advanced sites (images.js)
                                                  ├─▶ sharp → R2: photos as WebP (storage.js)
                                                  └─▶ MongoDB: sessions + sites
Visitor ──▶ *.site60.in (Cloudflare wildcard) ──▶ same server renders the site (site.js, render.js)
```

Nothing is built or deployed per customer. A site is one database row rendered on request
and cached for 60 seconds, so publishing is a single insert and is instant.

## Conversation

| Step | Bot asks | Owner sends |
|---|---|---|
| 1 | Language: English, हिंदी or ਪੰਜਾਬੀ | a tap |
| 2 | Type it or send a voice note | a tap |
| 3 | Business name, location, services (typed one by one, or in one voice note) | text or a voice note |
| 4 | "Here's what I understood" with Proceed: nothing expensive runs until the owner confirms | a tap, or a typed correction |
| 5 | Up to 6 photos or 2 videos, then Done (or No photos for AI pictures) | photos, videos |
| 6 | Suggested address: Use this / Pick another | a tap, or a typed name |
| ✅ | The live link and how many seconds it took | |

Every business is matched to a business class (healthcare, dental, real estate, bakery, restaurant, beauty,
fitness, education, fashion, jewellery, automotive, home services, professional, travel, events, retail,
tech, garden, or the closest one). The class sets the favicon icon, which themes are allowed, what each
section's picture shows, what content customers expect, and the main action ("Book a Property Visit",
"Reserve a Table", "Request a Quote"): the WhatsApp message, the sticky bar and the enquiry form fields
(date, time, number of people, what they need) all follow it.

Every site gets the full design; there is no Basic or Advanced question. A simpler layout is used only
when the designer AI fails or the daily limit is reached.

Owner photos are inspected first with vision (role, subject, visible text, focal point, quality). Logos,
documents, screenshots, references and unclear photos are left out; the best fitting photos lead the
hero and about sections, crops follow each photo's focal point, and alt text describes what is shown.

Every site gets a random design seed (style archetype, colour mood, type direction, hero layout,
motion personality) that avoids the seeds of recent sites. Hard rules are checked in code and the art
direction is redone when it breaks one: banned display fonts (Inter, Poppins, Montserrat, Roboto, Open Sans,
Lato, Raleway), text and button contrast below 4.5:1, plain grey neutrals, tech indigo, pure black on
white, missing Gurmukhi or Devanagari fonts for Punjabi or Hindi pages, and a design that repeats a recent
one in several ways at once (one shared font or colour alone is fine). Each finished site stores a design
record (palette, fonts, layout, picture sources, audit findings, revisions and outcome) that later sites
learn general lessons from. Once a day, after at least 3 new websites, a small model reads the anonymous
records (outcome, praise or complaints, change requests, audit findings) and writes up to 12 versioned
design lessons; every new art direction receives the lessons for its business class, so each owner starts
from a better first version. Admins send `lessons` on WhatsApp to read them. This is feedback-driven
improvement, not model training.

A site is made in stages. Opus writes a business brief (offer, audience, problem, main action, evidence,
facts, assumptions and missing information) and an art direction for that one business, with four
structured picture records that become ordered production prompts. Stock and AI candidates are reviewed
against each record's acceptance criteria; a rejected AI picture is redrawn once with a targeted
correction. Opus builds the page meanwhile, a static audit checks it (invented prices, ratings, years
or counts, one h1, required sections, button and link labels, alt text, image sizes, focus styles,
leftover placeholders) and the page is repaired once when it fails. The audit is static: it does not
render the page in a browser.

After launch the owner changes anything by typing it in plain words, for example
"make the colours dark green" or "add home loans to our services". Opus edits the page,
the facts or the pictures, and the previous version is kept for `undo`.

Every site starts as a 24-hour free trial when billing is configured; admin numbers never get a trial.
Payment is one WhatsApp button: `pay` sends a "Pay securely" button that opens Stripe Checkout directly
($9 every 2 weeks by default, with card, Apple Pay or Google Pay). Autopay is the default; a "pay just once"
link is offered next to it. `manage payment` opens Stripe's billing page to change the card or see receipts.
Every payment is re-checked with Stripe (status, amount, currency, plan) before it counts, each payment id
is counted once, and webhooks are signature-checked. Autopay owners get a reminder a day before each
charge and a message with a card-update link if a charge fails; pay-once owners are reminded two days
before their time ends. Unpaid trials, ended periods and cancelled plans go offline at render time and
in a 5-minute background sweep.

Right after an owner's first payment the bot offers fitting domain names as a WhatsApp list, checked live
against the registries (RDAP, no account needed). By default (`DOMAIN_MODE=self`) the owner taps a name, buys
it in their own name from Porkbun, GoDaddy or Namecheap through prefilled links, taps "I bought it" and the
bot connects it and confirms when it is live. With `DOMAIN_MODE=resell` and Porkbun keys, one tap opens our
checkout and the bot buys the name from prepaid Porkbun credit. Owners on a paid plan can also send `domain`
at any time. The bot suggests names that fit the
business, checks them live on Porkbun and shows only free ones with a yearly price (Porkbun price plus
`DOMAIN_MARGIN`). After payment it registers the name, points its DNS at the site and connects it.
If the name is taken or its price changed before purchase, the payment is refunded automatically.
Domains are reminded 30, 7 and 1 days before they expire; an expired domain falls back to the free address.
For domains owners bought themselves, the expiry date and registrar are read from RDAP every week (daily
in the last month); owners get the same 30, 7 and 1 day reminders naming their registrar, a thank-you when
it is renewed, and the site moves back to the free address if it lapses.

| Command | What it does |
|---|---|
| any sentence or voice note | Applies that change to the site (voice notes are read back for confirmation first) |
| `pay` | Sends a "Pay securely" button (autopay) and a pay-once link; paying early adds time |
| `manage payment` | Opens Stripe's billing page: change card, receipts, next payment |
| `domain` | Finds and buys a domain, or renews the current one |
| `new website` | Starts a new business website on the same number (admins anytime, others once their sites are paid) |
| `my websites`, `switch name` | Lists the number's websites and picks which one later messages change |
| `check mybusiness.com` | Checks and prices one domain |
| `transfer domain` | Asks the team for the domain's transfer code so the owner can move it anywhere |
| `cancel plan` | Stops autopay and takes the site offline at once |
| `connect domain mybusiness.com` | Adds the owner's own domain and sends the DNS records for GoDaddy and others |
| `leads` | Shows the latest enquiries from the website form |
| `email you@example.com` | Also sends enquiry alerts by email |
| `new design` | A completely new design and pictures |
| `undo` | Restores the version before the last change (up to 5 back) |

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
├── generate.js    Art direction, page generation, chat edits, HTML and CSS sanitizing
├── advanced.js    Page shell for Advanced sites
├── enhance.js     Interaction script for Advanced sites (reveals, tilt, parallax, tabs...)
├── images.js      AI picture generation
├── photos.js      Stock photo search and the AI photo editor that picks the best picture
├── claude.js      Anthropic client
├── gemini.js      Gemini client (fallback designer)
├── i18n.js        Onboarding text in English, Hindi and Punjabi
├── voice.js       Voice-note transcription (Cloudflare Whisper, Gemini backup)
├── billing.js     Trials, payments, webhooks, cancellations, expiry sweeps
├── plans.js       Plans and prices
├── stripe.js      Stripe API client and webhook signatures
├── razorpay.js    Razorpay API client and signature checks
├── porkbun.js     Porkbun API client
├── domainshop.js  Domain ideas, quotes, purchase, DNS and renewals
├── assets.js      Owner photo inspection and placement
├── memory.js      Design records: avoids repeated combinations, feedback from owners
├── lessons.js     Daily design lessons distilled from owner feedback
├── assistant.js   Small-model router for chat, questions and photo review
├── designrules.js Design seeds and the hard design rules
├── industry.js    Business classes: favicon icon, themes, section pictures and content per class
├── leads.js       Enquiry form and Call-tap alerts to the owner
├── notify.js      WhatsApp (text or template) and email alerts
├── domains.js     Owners' own domains through the Render API
├── extras.js      Enquiry form and videos added to every site
├── admin.js       Admin dashboard and CSV export
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
| `ANTHROPIC_API_KEY`, `ANTHROPIC_DESIGN_MODEL` | Opus for website design, page edits and picture briefs only |
| `ANTHROPIC_CHAT_MODEL` | Backup small model (Haiku by default, empty to turn off) for chat, reading answers, photo checks and lessons; Gemini goes first when `GEMINI_API_KEY` is set |
| `ANTHROPIC_DESIGN_MODEL` | Designer model, default `claude-opus-5-5` |
| `MONGO_URL`, `MONGO_DB` | Database |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Photo uploads |
| `IMAGE_PUBLIC_BASE` | Photo URLs on sites |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Google Gemini: fallback copywriter and designer |
| `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL` | Optional, best-quality AI pictures |
| `GEMINI_IMAGE_MODEL` | Gemini picture model, used when the Gemini key allows it |
| `CF_ACCOUNT_ID`, `CF_AI_TOKEN`, `CF_IMAGE_MODEL` | Optional Cloudflare Workers AI pictures |
| `PEXELS_API_KEY`, `UNSPLASH_ACCESS_KEY`, `PIXABAY_API_KEY` | Real stock photos; Claude picks the best stock or AI picture for each spot |
| `ADMIN_NUMBERS` | Numbers that skip limits and trials, and may send `model check` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payments by card, Apple Pay and Google Pay; webhook at `https://ROOT_DOMAIN/stripe/webhook` |
| `PRICE_CURRENCY`, `PRICE_MONTHLY`, `PRICE_BIWEEKLY` | Plan prices ($9 every 2 weeks by default; monthly is hidden at 0). With one plan the pay button goes straight to Stripe |
| `PAYMENTS=razorpay`, `RAZORPAY_*` | Razorpay instead of Stripe (UPI); webhook at `https://ROOT_DOMAIN/razorpay/webhook` |
| `DOMAIN_MODE` | `self` (default: owners buy their own domain, the bot connects it) or `resell` (the bot buys it with Porkbun credit) |
| `PORKBUN_API_KEY`, `PORKBUN_SECRET_KEY` | Resell mode, and prices next to suggested names |
| `DOMAIN_MARGIN`, `USD_RATE`, `DOMAIN_MAX_USD` | Domain pricing |
| `TRIAL_HOURS`, `PRICE_LABEL` | Free trial length and the price shown in chat |
| `TRIALS=on` | Trials without payment (demo mode). Admins send `activate <site>`, `extend <site> <hours>`, `pause <site>` or `status <site>` on WhatsApp |
| `RENDER_API_KEY` | Connecting owners' own domains |
| `WA_LEAD_TEMPLATE`, `WA_ALERT_TEMPLATE` | Approved templates for alerts after the 24-hour window |
| `RESEND_API_KEY`, `ALERT_EMAIL_FROM` | Email copies of enquiry alerts |
| `ADMIN_PASSWORD` | Admin dashboard at `/admin` |
| `LIMIT_*` | Per-number daily limits |
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
- Per-number limits: 3 sites per day, 3 Advanced designs per day, 15 chat edits per day, 30 AI calls per day, 20 photos per hour.
- AI-generated pages never contain scripts: HTML is allowlist-sanitized, CSS is stripped of imports and URLs, and interactivity comes from one hashed script.
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
