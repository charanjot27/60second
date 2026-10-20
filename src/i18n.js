export const LANGS = ['en', 'hi', 'pa'];

const STRINGS = {
  en: {
    mode: 'How would you like to tell me about your business?',
    mode_text: 'Type it ✍️',
    mode_voice: 'Voice note 🎤',
    ask_voice:
      '🎤 Send me one voice note and tell me:\n\n• your *business name*\n• your *location* (city and area)\n• the *services or products* you offer',
    ask_name: '🏷 What is your *business name*?',
    ask_location: '📍 Where is your business? Tell me the *city and area*.',
    ask_services: '🛠 Which *services or products* do you offer? Separate them with commas.',
    listening: '🎧 Listening to your voice note...',
    voice_failed: "I couldn't understand that voice note. Please send it again, or tap *Type it* below.",
    voice_only: 'Please send a *voice note*, or tap *Type it* below.',
    too_short: 'Please write a little more.',
    confirm:
      "Here's what I understood:\n\n🏷 *Name:* {name}\n📍 *Location:* {location}\n🛠 *Services:* {services}\n\nIs this correct? If something is wrong, just type the correction.",
    proceed: 'Proceed ✅',
    redo_voice: 'Record again 🎤',
    redo_text: 'Start over ✏️',
    photos:
      '📸 Send up to {photos} photos or {videos} short videos of your work, products or shop, then tap Done.\n\nNo photos? Tap *No photos* and I will create realistic pictures for you.',
    done: 'Done ✅',
    no_photos: 'No photos',
    none: 'not given',
    form_title: 'Send an enquiry',
    form_name: 'Your name',
    form_phone: 'Phone number',
    form_message: 'Message',
    form_send: 'Send',
    form_date: 'Preferred date',
    form_time: 'Preferred time',
    form_guests: 'Number of people',
    form_need: 'What are you looking for?',
    videos_title: 'Videos',
    thanks: 'Thank you! {name} will contact you soon.',
    back: 'Back to the website',
  },
  hi: {
    mode: 'आप अपने व्यवसाय के बारे में कैसे बताना चाहेंगे?',
    mode_text: 'लिखकर ✍️',
    mode_voice: 'वॉइस नोट 🎤',
    ask_voice:
      '🎤 मुझे एक वॉइस नोट भेजें और बताएं:\n\n• आपके *व्यवसाय का नाम*\n• आपकी *लोकेशन* (शहर और इलाका)\n• आप कौन-सी *सेवाएं या प्रोडक्ट* देते हैं',
    ask_name: '🏷 आपके *व्यवसाय का नाम* क्या है?',
    ask_location: '📍 आपका व्यवसाय कहाँ है? *शहर और इलाका* बताएं।',
    ask_services: '🛠 आप कौन-सी *सेवाएं या प्रोडक्ट* देते हैं? कॉमा लगाकर लिखें।',
    listening: '🎧 आपका वॉइस नोट सुन रहा हूँ...',
    voice_failed: 'वॉइस नोट समझ नहीं आया। कृपया दोबारा भेजें, या नीचे *लिखकर* दबाएं।',
    voice_only: 'कृपया एक *वॉइस नोट* भेजें, या नीचे *लिखकर* दबाएं।',
    too_short: 'कृपया थोड़ा और लिखें।',
    confirm:
      'मैंने यह समझा:\n\n🏷 *नाम:* {name}\n📍 *लोकेशन:* {location}\n🛠 *सेवाएं:* {services}\n\nक्या यह सही है? कुछ गलत हो तो सही जानकारी लिख दें।',
    proceed: 'आगे बढ़ें ✅',
    redo_voice: 'दोबारा बोलें 🎤',
    redo_text: 'फिर से शुरू ✏️',
    photos:
      '📸 अपने काम, प्रोडक्ट या दुकान की {photos} तक फ़ोटो या {videos} छोटे वीडियो भेजें, फिर *हो गया* दबाएं।\n\nफ़ोटो नहीं हैं? *फ़ोटो नहीं* दबाएं, मैं आपके लिए असली जैसी तस्वीरें बना दूँगा।',
    done: 'हो गया ✅',
    no_photos: 'फ़ोटो नहीं',
    none: 'नहीं बताया',
    form_title: 'पूछताछ भेजें',
    form_name: 'आपका नाम',
    form_phone: 'फ़ोन नंबर',
    form_message: 'संदेश',
    form_send: 'भेजें',
    form_date: 'पसंदीदा तारीख',
    form_time: 'पसंदीदा समय',
    form_guests: 'कितने लोग',
    form_need: 'आपको क्या चाहिए?',
    videos_title: 'वीडियो',
    thanks: 'धन्यवाद! {name} जल्द ही आपसे संपर्क करेंगे।',
    back: 'वेबसाइट पर वापस जाएं',
  },
  pa: {
    mode: 'ਤੁਸੀਂ ਆਪਣੇ ਕਾਰੋਬਾਰ ਬਾਰੇ ਕਿਵੇਂ ਦੱਸਣਾ ਚਾਹੋਗੇ?',
    mode_text: 'ਲਿਖ ਕੇ ✍️',
    mode_voice: 'ਵੌਇਸ ਨੋਟ 🎤',
    ask_voice:
      '🎤 ਮੈਨੂੰ ਇੱਕ ਵੌਇਸ ਨੋਟ ਭੇਜੋ ਅਤੇ ਦੱਸੋ:\n\n• ਤੁਹਾਡੇ *ਕਾਰੋਬਾਰ ਦਾ ਨਾਮ*\n• ਤੁਹਾਡੀ *ਲੋਕੇਸ਼ਨ* (ਸ਼ਹਿਰ ਅਤੇ ਇਲਾਕਾ)\n• ਤੁਸੀਂ ਕਿਹੜੀਆਂ *ਸੇਵਾਵਾਂ ਜਾਂ ਪ੍ਰੋਡਕਟ* ਦਿੰਦੇ ਹੋ',
    ask_name: '🏷 ਤੁਹਾਡੇ *ਕਾਰੋਬਾਰ ਦਾ ਨਾਮ* ਕੀ ਹੈ?',
    ask_location: '📍 ਤੁਹਾਡਾ ਕਾਰੋਬਾਰ ਕਿੱਥੇ ਹੈ? *ਸ਼ਹਿਰ ਅਤੇ ਇਲਾਕਾ* ਦੱਸੋ।',
    ask_services: '🛠 ਤੁਸੀਂ ਕਿਹੜੀਆਂ *ਸੇਵਾਵਾਂ ਜਾਂ ਪ੍ਰੋਡਕਟ* ਦਿੰਦੇ ਹੋ? ਕਾਮੇ ਲਗਾ ਕੇ ਲਿਖੋ।',
    listening: '🎧 ਤੁਹਾਡਾ ਵੌਇਸ ਨੋਟ ਸੁਣ ਰਿਹਾ ਹਾਂ...',
    voice_failed: 'ਵੌਇਸ ਨੋਟ ਸਮਝ ਨਹੀਂ ਆਇਆ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਭੇਜੋ, ਜਾਂ ਹੇਠਾਂ *ਲਿਖ ਕੇ* ਦਬਾਓ।',
    voice_only: 'ਕਿਰਪਾ ਕਰਕੇ ਇੱਕ *ਵੌਇਸ ਨੋਟ* ਭੇਜੋ, ਜਾਂ ਹੇਠਾਂ *ਲਿਖ ਕੇ* ਦਬਾਓ।',
    too_short: 'ਕਿਰਪਾ ਕਰਕੇ ਥੋੜ੍ਹਾ ਹੋਰ ਲਿਖੋ।',
    confirm:
      'ਮੈਂ ਇਹ ਸਮਝਿਆ:\n\n🏷 *ਨਾਮ:* {name}\n📍 *ਲੋਕੇਸ਼ਨ:* {location}\n🛠 *ਸੇਵਾਵਾਂ:* {services}\n\nਕੀ ਇਹ ਸਹੀ ਹੈ? ਕੁਝ ਗਲਤ ਹੋਵੇ ਤਾਂ ਸਹੀ ਜਾਣਕਾਰੀ ਲਿਖ ਦਿਓ।',
    proceed: 'ਅੱਗੇ ਵਧੋ ✅',
    redo_voice: 'ਦੁਬਾਰਾ ਬੋਲੋ 🎤',
    redo_text: 'ਮੁੜ ਸ਼ੁਰੂ ✏️',
    photos:
      '📸 ਆਪਣੇ ਕੰਮ, ਪ੍ਰੋਡਕਟ ਜਾਂ ਦੁਕਾਨ ਦੀਆਂ {photos} ਤੱਕ ਫ਼ੋਟੋਆਂ ਜਾਂ {videos} ਛੋਟੇ ਵੀਡੀਓ ਭੇਜੋ, ਫਿਰ *ਹੋ ਗਿਆ* ਦਬਾਓ।\n\nਫ਼ੋਟੋਆਂ ਨਹੀਂ ਹਨ? *ਫ਼ੋਟੋਆਂ ਨਹੀਂ* ਦਬਾਓ, ਮੈਂ ਤੁਹਾਡੇ ਲਈ ਅਸਲੀ ਵਰਗੀਆਂ ਤਸਵੀਰਾਂ ਬਣਾ ਦਿਆਂਗਾ।',
    done: 'ਹੋ ਗਿਆ ✅',
    no_photos: 'ਫ਼ੋਟੋਆਂ ਨਹੀਂ',
    none: 'ਨਹੀਂ ਦੱਸਿਆ',
    form_title: 'ਪੁੱਛਗਿੱਛ ਭੇਜੋ',
    form_name: 'ਤੁਹਾਡਾ ਨਾਮ',
    form_phone: 'ਫ਼ੋਨ ਨੰਬਰ',
    form_message: 'ਸੁਨੇਹਾ',
    form_send: 'ਭੇਜੋ',
    form_date: 'ਪਸੰਦੀਦਾ ਤਾਰੀਖ',
    form_time: 'ਪਸੰਦੀਦਾ ਸਮਾਂ',
    form_guests: 'ਕਿੰਨੇ ਲੋਕ',
    form_need: 'ਤੁਹਾਨੂੰ ਕੀ ਚਾਹੀਦਾ ਹੈ?',
    videos_title: 'ਵੀਡੀਓ',
    thanks: 'ਧੰਨਵਾਦ! {name} ਜਲਦੀ ਹੀ ਤੁਹਾਡੇ ਨਾਲ ਸੰਪਰਕ ਕਰਨਗੇ।',
    back: 'ਵੈੱਬਸਾਈਟ ਤੇ ਵਾਪਸ ਜਾਓ',
  },
};

export const WELCOME =
  'Hi {name} 👋 I will build a website for your business, right here on WhatsApp.\n\n' +
  'First, choose your language.\nपहले अपनी भाषा चुनें।\nਪਹਿਲਾਂ ਆਪਣੀ ਭਾਸ਼ਾ ਚੁਣੋ।';

export const LANG_BUTTONS = [
  { id: 'lang_en', title: 'English' },
  { id: 'lang_hi', title: 'हिंदी' },
  { id: 'lang_pa', title: 'ਪੰਜਾਬੀ' },
];

export function t(lang, key, vars = {}) {
  const table = STRINGS[lang] || STRINGS.en;
  const text = table[key] ?? STRINGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export function stringKeys(lang) {
  return Object.keys(STRINGS[lang] || {});
}
