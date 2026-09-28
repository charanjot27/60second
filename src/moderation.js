const BLOCKED_TERMS = [
  'cocaine', 'heroin', 'mdma', 'lsd', 'ganja', 'charas', 'marijuana', 'weed', 'cannabis', 'afeem', 'opium', 'chitta',
  'escort', 'escorts', 'call girl', 'call girls', 'porn', 'adult services', 'sex services',
  'betting', 'satta', 'matka', 'casino', 'gambling', 'lottery', 'teen patti',
  'gun', 'guns', 'pistol', 'revolver', 'firearm', 'firearms', 'ammunition', 'katta', 'explosives',
  'double your money', 'guaranteed returns', 'forex signals', 'crypto investment', 'investment scheme',
  'loan without documents', 'instant loan app', 'kyc update', 'fake documents', 'fake degree', 'fake certificate',
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const pattern = new RegExp(
  `(^|[^a-z0-9])(${BLOCKED_TERMS.map((t) => escapeRe(t).replace(/ /g, '\\s+')).join('|')})([^a-z0-9]|$)`,
  'i'
);

export function isDisallowedText(...texts) {
  return texts.some((t) => typeof t === 'string' && pattern.test(t));
}

const BRANDS = [
  'hdfc', 'icici', 'kotak', 'yesbank', 'paytm', 'phonepe', 'gpay', 'googlepay', 'razorpay', 'mobikwik',
  'paypal', 'amazon', 'flipkart', 'myntra', 'meesho', 'swiggy', 'zomato', 'airtel', 'vodafone', 'google',
  'facebook', 'instagram', 'whatsapp', 'microsoft', 'netflix', 'irctc', 'uidai', 'aadhaar', 'aadhar',
  'incometax', 'epfo',
];

const SHORT_NAMES = [
  'sbi', 'pnb', 'rbi', 'npci', 'upi', 'bhim', 'jio', 'bsnl', 'lic', 'meta', 'apple', 'axis', 'canara', 'gov', 'govt',
];

function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function isBrandLike(slug) {
  const joined = slug.replace(/-/g, '');
  const parts = slug.split('-');
  if (parts.some((p) => SHORT_NAMES.includes(p))) return true;
  return BRANDS.some(
    (brand) =>
      joined.includes(brand) ||
      (brand.length >= 5 && parts.some((p) => withinOneEdit(p, brand)))
  );
}
