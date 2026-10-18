const ICONS = {
  cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  tooth: '<path d="M7 3C4.5 3 3 5 3 7.5c0 3 1.5 4.5 2 7 .5 3 1 6.5 2.5 6.5S9 18 10 16c.5-1 1.5-1 2-1s1.5 0 2 1c1 2 1.5 5 3 5s2-3.5 2.5-6.5c.5-2.5 2-4 2-7C21.5 5 20 3 17.5 3c-2 0-3.5 1-5.5 1S9 3 7 3z"/>',
  house: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  cake: '<path d="M4 21h16"/><path d="M5 21v-8h14v8"/><path d="M5 15c2 1.5 3.5 1.5 5 0s3.5-1.5 5 0 3 1.5 4 0"/><path d="M12 13V9"/><path d="M12 6.5c.8-.8.8-1.7 0-2.5-.8.8-.8 1.7 0 2.5z"/>',
  dish: '<path d="M7 3v8a2 2 0 0 0 2 2v8"/><path d="M11 3v8a2 2 0 0 1-2 2"/><path d="M9 3v6"/><path d="M17 21V3c-2 1.5-3 4-3 7s1 4 3 4"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.1 8.1 20 20"/><path d="M8.1 15.9 20 4"/>',
  dumbbell: '<path d="M6 7v10"/><path d="M18 7v10"/><path d="M3 9.5v5"/><path d="M21 9.5v5"/><path d="M6 12h12"/>',
  book: '<path d="M3 5.5C5 4 8 4 12 6c4-2 7-2 9-.5V19c-2-1.5-5-1.5-9 .5-4-2-7-2-9-.5z"/><path d="M12 6v13.5"/>',
  hanger: '<path d="M12 7a2 2 0 1 1 2-2"/><path d="M12 7v1.5L3 15.5c-.8.6-.4 1.5.6 1.5h16.8c1 0 1.4-.9.6-1.5L12 8.5"/>',
  gem: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20"/><path d="M12 21 8 9l4-6 4 6z"/>',
  car: '<path d="M5 17h14"/><path d="M3 17v-4l2-5h14l2 5v4"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/><path d="M3 13h18"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  scales: '<path d="M12 3v18"/><path d="M5 21h14"/><path d="M4 7h16"/><path d="M7 7l-3 6a3 3 0 0 0 6 0z"/><path d="M17 7l-3 6a3 3 0 0 0 6 0z"/>',
  pin: '<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  code: '<path d="M8 7l-5 5 5 5"/><path d="M16 7l5 5-5 5"/><path d="M14 4l-4 16"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19 13 11"/>',
  store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 11v10h14V11"/><path d="M10 21v-5h4v5"/>',
};

const ALL = null;

export const INDUSTRIES = [
  {
    id: 'healthcare',
    name: 'Healthcare: doctors, clinics, hospitals, diagnostics, pharmacies',
    icon: 'cross',
    keywords: ['doctor', 'clinic', 'hospital', 'medical', 'medico', 'physician', 'physio', 'physiotherapy', 'pharmacy', 'chemist', 'diagnostic', 'pathology', 'lab', 'nursing', 'paediatric', 'pediatric', 'gynae', 'ortho', 'cardio', 'skin clinic', 'dermatologist', 'dermatology', 'homeopathy', 'homeopathic', 'ayurveda', 'ayurvedic', 'health', 'patient', 'surgeon', 'mbbs', 'eye care', 'optical', 'optician'],
    feel: 'trust, calm, competence and care',
    archetypes: ['Swiss International', 'Quiet luxury', 'Japandi minimal', 'Futuristic clean', 'Gallery whitespace', 'Editorial magazine'],
    moods: ['mint and graphite', 'ink blue and bone cream', 'sage and blush', 'warm stone monochrome with one vivid accent', 'midnight navy and copper', 'deep forest green and brass'],
    types: ['old-style humanist serif display', 'rounded friendly sans display', 'wide extended sans display', 'expressive soft serif display'],
    motions: ['calm', 'snappy', 'luxe'],
    imagery: [
      'a calm, bright, spotless consultation room or clinic reception',
      "a doctor's hands with a stethoscope during a caring consultation, faces not shown",
      'modern medical equipment or a treatment room matching the listed services',
      'a close detail of clean medical instruments or a stethoscope',
    ],
    queries: ['modern clinic interior', 'doctor stethoscope hands', 'medical consultation room', 'stethoscope close up'],
    content:
      'the specialities and treatments offered, how a visit works (message on WhatsApp, consultation, follow-up), what patients can expect, and a reassuring FAQ answered only from the facts. Never claim cures, success rates, qualifications or timings that were not given.',
    avoid: 'dark moody themes, neon, playful pop styling, aggressive motion, anything that feels unsafe or unclean',
  },
  {
    id: 'dental',
    name: 'Dental clinics',
    icon: 'tooth',
    keywords: ['dental', 'dentist', 'teeth', 'tooth', 'orthodontist', 'orthodontics', 'smile', 'root canal', 'braces', 'implant'],
    feel: 'trust, comfort, freshness and a confident smile',
    archetypes: ['Swiss International', 'Japandi minimal', 'Futuristic clean', 'Quiet luxury', 'Gallery whitespace'],
    moods: ['mint and graphite', 'ink blue and bone cream', 'sage and blush', 'coral and sand'],
    types: ['rounded friendly sans display', 'wide extended sans display', 'expressive soft serif display'],
    motions: ['calm', 'snappy'],
    imagery: [
      'a bright, modern dental clinic with a treatment chair',
      'a dentist’s gloved hands with dental tools, faces not shown',
      'dental equipment matching the listed treatments',
      'a close detail of a toothbrush, dental mirror or clean tools',
    ],
    queries: ['modern dental clinic', 'dentist tools hands', 'dental chair', 'dental mirror close up'],
    content: 'the treatments offered, how a visit works, comfort and hygiene, and an FAQ answered only from the facts. No invented prices, results or qualifications.',
    avoid: 'dark themes, harsh reds, playful pop styling',
  },
  {
    id: 'real-estate',
    name: 'Real estate: property dealers, builders, interiors',
    icon: 'house',
    keywords: ['property', 'properties', 'real estate', 'realty', 'dealer', 'builder', 'construction', 'flat', 'flats', 'plot', 'plots', 'apartment', 'villa', 'rent', 'rental', 'bhk', 'house for sale', 'interior design', 'architect', 'colonizer'],
    feel: 'trust, aspiration and local expertise',
    archetypes: ['Architectural blueprint', 'Editorial magazine', 'Swiss International', 'Quiet luxury', 'Mid-century modern', 'Art Deco revival', 'Gallery whitespace'],
    moods: ['terracotta and clay with warm cream', 'deep forest green and brass', 'midnight navy and copper', 'ink blue and bone cream', 'warm stone monochrome with one vivid accent', 'oxblood and parchment'],
    types: ['high-contrast didone serif display', 'wide extended sans display', 'old-style humanist serif display', 'condensed industrial display'],
    motions: ['calm', 'cinematic', 'luxe'],
    imagery: [
      'an attractive Indian home exterior or residential street at golden hour',
      'a bright, welcoming living room interior',
      'the property types the owner listed (homes, flats, plots or commercial spaces)',
      'house keys being handed over, a front door or an architectural detail',
    ],
    queries: ['modern indian house exterior', 'bright living room interior', 'apartment building', 'house keys handover'],
    content:
      'the properties or listings the owner mentioned with only the facts given (type, size, area, price only if given), help with buying, selling or renting, how to enquire or arrange a visit, and local knowledge of the city.',
    avoid: 'playful pop styling, cartoon houses',
  },
  {
    id: 'bakery',
    name: 'Bakeries, cakes and sweet shops',
    icon: 'cake',
    keywords: ['bakery', 'bakers', 'baker', 'baking', 'baked', 'cake', 'cakes', 'cupcake', 'cookie', 'pastry', 'sweets', 'sweet shop', 'mithai', 'halwai', 'chocolate', 'dessert', 'brownie', 'confection'],
    feel: 'appetite, warmth and delight',
    archetypes: ['Retro 70s print', 'Hand-made zine', 'Playful pop', 'Heritage craft', 'Mid-century modern', 'Organic botanical', 'Editorial magazine'],
    moods: ['coral and sand', 'saffron and charcoal', 'plum and peach', 'rose and moss', 'mustard and teal', 'terracotta and clay with warm cream'],
    types: ['expressive soft serif display', 'elegant script accent paired with a clean serif', 'rounded friendly sans display', 'slab serif with character'],
    motions: ['playful', 'calm', 'luxe'],
    imagery: [
      'the signature cakes or sweets beautifully styled, an appetising close view',
      'hands decorating or baking in a warm home or bakery kitchen',
      'the specific products the owner listed',
      'a texture close-up of frosting, sugar, nuts or ingredients',
    ],
    queries: ['custom birthday cake', 'indian sweets mithai', 'baking hands kitchen', 'cake frosting close up'],
    content: 'the products and occasions they make them for (birthdays, festivals, weddings), how ordering on WhatsApp works, and the flavours or items listed. No invented prices or delivery promises.',
    avoid: 'cold clinical styling, dark gloomy themes',
  },
  {
    id: 'restaurant',
    name: 'Restaurants, cafes, dhabas and caterers',
    icon: 'dish',
    keywords: ['restaurant', 'cafe', 'café', 'coffee', 'dhaba', 'food', 'kitchen', 'catering', 'caterer', 'tiffin', 'thali', 'biryani', 'pizza', 'burger', 'fast food', 'juice', 'tea', 'chai', 'momos', 'street food', 'cloud kitchen'],
    feel: 'appetite, atmosphere and welcome',
    archetypes: ['Editorial magazine', 'Retro 70s print', 'Industrial workshop', 'Hand-made zine', 'Cinematic dark', 'Mid-century modern', 'Tropical vibrant', 'Newsprint'],
    moods: ['saffron and charcoal', 'terracotta and clay with warm cream', 'olive and lemon', 'rust and faded denim', 'oxblood and parchment', 'mustard and teal'],
    types: ['slab serif with character', 'condensed industrial display', 'expressive soft serif display', 'chunky geometric grotesk display'],
    motions: ['playful', 'cinematic', 'energetic'],
    imagery: [
      'signature dishes or drinks on a table, appetising and warm',
      'the dining space or the kitchen in action',
      'the dishes or menu items the owner listed',
      'steam, spices or a coffee close-up',
    ],
    queries: ['indian food thali', 'cafe interior warm', 'chef cooking kitchen', 'spices close up'],
    content: 'the dishes and specialities listed, the atmosphere, ordering or reserving on WhatsApp, and catering if mentioned. No invented menus, prices or timings.',
    avoid: 'cold clinical styling',
  },
  {
    id: 'beauty',
    name: 'Salons, spas, parlours and makeup artists',
    icon: 'scissors',
    keywords: ['salon', 'parlour', 'parlor', 'spa', 'beauty', 'makeup', 'make-up', 'bridal makeup', 'hair', 'nail', 'barber', 'grooming', 'mehndi', 'mehendi', 'facial', 'threading', 'waxing'],
    feel: 'beauty, self-care and confidence',
    archetypes: ['Quiet luxury', 'Gallery whitespace', 'Art Deco revival', 'Editorial magazine', 'Japandi minimal', 'Organic botanical'],
    moods: ['rose and moss', 'sage and blush', 'plum and peach', 'warm stone monochrome with one vivid accent', 'oxblood and parchment', 'coral and sand'],
    types: ['high-contrast didone serif display', 'elegant script accent paired with a clean serif', 'expressive soft serif display', 'wide extended sans display'],
    motions: ['luxe', 'calm'],
    imagery: [
      'a stylish, softly lit salon or spa interior',
      "a stylist's hands at work, the client's face not shown",
      'the treatments the owner listed (hair, makeup, nails, skin, mehndi)',
      'brushes, products or a mirror detail',
    ],
    queries: ['beauty salon interior', 'hair stylist hands', 'spa treatment', 'makeup brushes close up'],
    content: 'the treatments and occasions (bridal, party, everyday), the experience and hygiene, and booking on WhatsApp. No invented prices or results.',
    avoid: 'industrial or harsh styling, aggressive motion',
  },
  {
    id: 'fitness',
    name: 'Gyms, yoga studios, fitness trainers and sports academies',
    icon: 'dumbbell',
    keywords: ['gym', 'fitness', 'yoga', 'crossfit', 'trainer', 'workout', 'zumba', 'martial', 'karate', 'boxing', 'sports academy', 'cricket academy', 'swimming', 'pilates', 'aerobics'],
    feel: 'energy, strength and motivation',
    archetypes: ['Soft brutalism', 'Industrial workshop', 'Neo-Bauhaus', 'Cinematic dark', 'Swiss International', 'Futuristic clean'],
    moods: ['saffron and charcoal', 'rust and faded denim', 'mustard and teal', 'midnight navy and copper', 'olive and lemon', 'mint and graphite'],
    types: ['chunky geometric grotesk display', 'condensed industrial display', 'wide extended sans display'],
    motions: ['energetic', 'snappy', 'cinematic'],
    imagery: [
      'a well-equipped gym or training in action, people seen from behind or in silhouette',
      'a coach guiding training or equipment ready for a session',
      'the classes the owner listed (strength, yoga, cardio, martial arts)',
      'dumbbells, chalk or a kettlebell close-up',
    ],
    queries: ['modern gym interior', 'weight training', 'yoga class studio', 'dumbbells close up'],
    content: 'the training and classes offered, what a first visit looks like, and joining on WhatsApp. No invented results, prices or timings.',
    avoid: 'soft pastel delicacy, sleepy motion',
  },
  {
    id: 'education',
    name: 'Coaching, tuition, schools, libraries and academies',
    icon: 'book',
    keywords: ['coaching', 'tuition', 'tutor', 'classes', 'school', 'academy', 'institute', 'library', 'study room', 'study centre', 'education', 'ielts', 'neet', 'jee', 'upsc', 'computer course', 'training centre', 'language class', 'music class', 'dance class'],
    feel: 'trust, focus and progress',
    archetypes: ['Editorial magazine', 'Swiss International', 'Neo-Bauhaus', 'Newsprint', 'Mid-century modern', 'Playful pop', 'Gallery whitespace'],
    moods: ['ink blue and bone cream', 'mustard and teal', 'deep forest green and brass', 'coral and sand', 'mint and graphite', 'turmeric and deep indigo dye'],
    types: ['old-style humanist serif display', 'slab serif with character', 'rounded friendly sans display', 'monospace-accented technical display'],
    motions: ['calm', 'snappy', 'playful'],
    imagery: [
      'a bright classroom or a calm, organised study space',
      "students' hands writing, or books and notes on a desk",
      'the subjects or courses the owner listed',
      'notebooks, pens or a bookshelf close-up',
    ],
    queries: ['classroom students', 'study library desk', 'books on desk', 'notebook pen close up'],
    content: 'the courses or subjects, how classes work, the learning environment, and enrolling on WhatsApp. No invented results, ranks, fees or timings.',
    avoid: 'dark cinematic gloom',
  },
  {
    id: 'fashion',
    name: 'Boutiques, tailors and clothing stores',
    icon: 'hanger',
    keywords: ['boutique', 'tailor', 'stitching', 'clothing', 'clothes', 'garment', 'fashion', 'saree', 'suit', 'lehenga', 'kurti', 'designer wear', 'apparel', 'footwear', 'shoes'],
    feel: 'style, craft and confidence',
    archetypes: ['Editorial magazine', 'Gallery whitespace', 'Art Deco revival', 'Heritage craft', 'Quiet luxury', 'Soft brutalism'],
    moods: ['oxblood and parchment', 'plum and peach', 'rose and moss', 'terracotta and clay with warm cream', 'warm stone monochrome with one vivid accent', 'deep forest green and brass'],
    types: ['high-contrast didone serif display', 'condensed industrial display', 'elegant script accent paired with a clean serif', 'wide extended sans display'],
    motions: ['luxe', 'cinematic', 'snappy'],
    imagery: [
      'garments or fabrics beautifully displayed in a boutique',
      "a tailor's hands measuring or stitching",
      'the garments or services the owner listed',
      'fabric texture, embroidery or buttons close-up',
    ],
    queries: ['boutique clothing rack', 'tailor stitching hands', 'indian embroidery fabric', 'fabric texture close up'],
    content: 'the collections or tailoring services, occasions, fittings, and ordering on WhatsApp. No invented prices or brands.',
    avoid: 'clinical sterile styling',
  },
  {
    id: 'jewellery',
    name: 'Jewellers',
    icon: 'gem',
    keywords: ['jewels', 'jewellers', 'jewellery', 'jewelry', 'jeweller', 'gold', 'silver', 'diamond', 'ornament', 'bangles', 'necklace'],
    feel: 'prestige, heritage and trust',
    archetypes: ['Art Deco revival', 'Quiet luxury', 'Gallery whitespace', 'Heritage craft', 'Cinematic dark'],
    moods: ['midnight navy and copper', 'deep forest green and brass', 'oxblood and parchment', 'warm stone monochrome with one vivid accent', 'plum and peach'],
    types: ['high-contrast didone serif display', 'elegant script accent paired with a clean serif', 'old-style humanist serif display'],
    motions: ['luxe', 'cinematic'],
    imagery: [
      'fine jewellery displayed elegantly with dramatic light',
      "a jeweller's hands crafting or polishing a piece",
      'the jewellery types the owner listed',
      'a macro detail of a gemstone or gold texture',
    ],
    queries: ['gold jewellery display', 'jeweller craftsmanship', 'necklace close up', 'gold texture macro'],
    content: 'the collections and occasions, craftsmanship and trust, and visiting or enquiring on WhatsApp. No invented purity claims, prices or certifications.',
    avoid: 'playful pop, cheap bright colours',
  },
  {
    id: 'automotive',
    name: 'Garages, car and bike services, dealers and driving schools',
    icon: 'car',
    keywords: ['car', 'bike', 'garage', 'mechanic', 'auto', 'automobile', 'service centre', 'service center', 'tyre', 'tyres', 'detailing', 'car wash', 'driving school', 'scooter', 'two wheeler', 'four wheeler'],
    feel: 'reliability, skill and speed',
    archetypes: ['Industrial workshop', 'Soft brutalism', 'Futuristic clean', 'Swiss International', 'Cinematic dark'],
    moods: ['rust and faded denim', 'saffron and charcoal', 'midnight navy and copper', 'mustard and teal', 'mint and graphite'],
    types: ['condensed industrial display', 'wide extended sans display', 'chunky geometric grotesk display', 'monospace-accented technical display'],
    motions: ['snappy', 'energetic', 'cinematic'],
    imagery: [
      'a clean, well-lit workshop with a car or bike being serviced',
      "a mechanic's hands working on an engine",
      'the services the owner listed',
      'tools or a tyre tread close-up',
    ],
    queries: ['car service garage', 'mechanic working engine', 'car detailing', 'mechanic tools close up'],
    content: 'the services, how a booking works, honesty and turnaround (only if stated), and booking on WhatsApp. No invented prices or warranties.',
    avoid: 'soft pastel styling',
  },
  {
    id: 'home-services',
    name: 'Home services: electricians, plumbers, repairs, cleaning, pest control',
    icon: 'wrench',
    keywords: ['electrician', 'plumber', 'plumbing', 'repair', 'ac repair', 'ac service', 'cleaning', 'pest', 'carpenter', 'painter', 'painting', 'appliance', 'ro service', 'handyman', 'waterproofing', 'cctv', 'installation'],
    feel: 'reliability, speed and honesty',
    archetypes: ['Industrial workshop', 'Swiss International', 'Neo-Bauhaus', 'Soft brutalism', 'Architectural blueprint'],
    moods: ['mustard and teal', 'ink blue and bone cream', 'rust and faded denim', 'mint and graphite', 'saffron and charcoal'],
    types: ['chunky geometric grotesk display', 'slab serif with character', 'condensed industrial display', 'wide extended sans display'],
    motions: ['snappy', 'calm'],
    imagery: [
      'a professional at work in a tidy home, face not shown',
      'hands using tools carefully',
      'the services the owner listed',
      'a toolbox or tools close-up',
    ],
    queries: ['electrician at work', 'plumber repairing sink', 'home repair tools', 'toolbox close up'],
    content: 'the services and areas covered (only if given), how booking works, and calling or messaging for help. No invented prices, response times or guarantees.',
    avoid: 'luxury fashion styling',
  },
  {
    id: 'professional',
    name: 'Lawyers, accountants, tax, insurance and consultants',
    icon: 'scales',
    keywords: ['lawyer', 'advocate', 'legal', 'law firm', 'chartered accountant', 'ca firm', 'accountant', 'tax', 'gst', 'insurance', 'consultant', 'consultancy', 'finance', 'loan agent', 'notary', 'visa', 'immigration'],
    feel: 'trust, clarity and expertise',
    archetypes: ['Swiss International', 'Editorial magazine', 'Quiet luxury', 'Newsprint', 'Gallery whitespace'],
    moods: ['ink blue and bone cream', 'deep forest green and brass', 'midnight navy and copper', 'oxblood and parchment', 'warm stone monochrome with one vivid accent'],
    types: ['old-style humanist serif display', 'high-contrast didone serif display', 'wide extended sans display'],
    motions: ['calm', 'luxe'],
    imagery: [
      'a calm, professional office with natural light',
      'a consultation across a desk, hands and documents only',
      'the services the owner listed',
      'documents, a pen or a calculator close-up',
    ],
    queries: ['office desk documents', 'business consultation hands', 'law books shelf', 'documents pen close up'],
    content: 'the services, how a consultation works, clarity and confidentiality, and booking on WhatsApp. No invented case results, credentials or fees.',
    avoid: 'playful pop, loud colours, bouncy motion',
  },
  {
    id: 'travel',
    name: 'Travel agents, tours, taxis and stays',
    icon: 'pin',
    keywords: ['travel', 'tour', 'tours', 'taxi', 'cab', 'holiday', 'trip', 'hotel', 'homestay', 'guest house', 'resort', 'tempo traveller', 'ticket', 'pilgrimage', 'yatra'],
    feel: 'wanderlust, comfort and ease',
    archetypes: ['Tropical vibrant', 'Editorial magazine', 'Retro 70s print', 'Cinematic dark', 'Mid-century modern'],
    moods: ['coral and sand', 'olive and lemon', 'mustard and teal', 'ink blue and bone cream', 'terracotta and clay with warm cream'],
    types: ['wide extended sans display', 'expressive soft serif display', 'condensed industrial display', 'slab serif with character'],
    motions: ['cinematic', 'playful', 'calm'],
    imagery: [
      'a breathtaking destination landscape in India',
      'a comfortable vehicle on an open road or a welcoming stay',
      'the trips, routes or stays the owner listed',
      'a map, luggage or travel details close-up',
    ],
    queries: ['india travel landscape', 'road trip car mountains', 'hotel room cozy', 'travel map close up'],
    content: 'the trips, routes, vehicles or stays offered, how booking works, and planning on WhatsApp. No invented prices or packages.',
    avoid: 'clinical sterile styling',
  },
  {
    id: 'events',
    name: 'Weddings, events, decorators and photographers',
    icon: 'camera',
    keywords: ['wedding', 'event', 'events', 'decor', 'decorator', 'tent', 'photographer', 'photography', 'videography', 'dj', 'banquet', 'planner', 'catering for events', 'flowers decoration'],
    feel: 'celebration, emotion and memories',
    archetypes: ['Cinematic dark', 'Editorial magazine', 'Gallery whitespace', 'Art Deco revival', 'Retro 70s print'],
    moods: ['oxblood and parchment', 'plum and peach', 'midnight navy and copper', 'rose and moss', 'saffron and charcoal'],
    types: ['high-contrast didone serif display', 'elegant script accent paired with a clean serif', 'expressive soft serif display'],
    motions: ['cinematic', 'luxe'],
    imagery: [
      'a beautifully decorated celebration venue with warm lights',
      'a photographer or decorator at work, faces not shown',
      'the event services the owner listed',
      'flowers, lights or decor details close-up',
    ],
    queries: ['indian wedding decoration', 'photographer camera event', 'event lights decor', 'flower decoration close up'],
    content: 'the event services and occasions, how planning works, and enquiring on WhatsApp. No invented packages, prices or client names.',
    avoid: 'clinical or industrial styling',
  },
  {
    id: 'retail',
    name: 'Shops: grocery, electronics, mobiles, hardware and general stores',
    icon: 'bag',
    keywords: ['shop', 'store', 'kirana', 'grocery', 'mart', 'supermarket', 'electronics', 'mobile shop', 'mobile repair', 'hardware', 'stationery', 'general store', 'gift shop', 'toys', 'furniture', 'sanitary', 'paint shop'],
    feel: 'choice, value and convenience',
    archetypes: ['Playful pop', 'Swiss International', 'Newsprint', 'Neo-Bauhaus', 'Retro 70s print'],
    moods: ['mustard and teal', 'coral and sand', 'olive and lemon', 'saffron and charcoal', 'mint and graphite'],
    types: ['chunky geometric grotesk display', 'rounded friendly sans display', 'condensed industrial display'],
    motions: ['snappy', 'playful'],
    imagery: [
      'a neat, well-stocked shop interior',
      'a friendly counter with products being handed over, faces not shown',
      'the product categories the owner listed',
      'a close-up of products neatly arranged',
    ],
    queries: ['shop interior shelves', 'store counter', 'products on shelves', 'shopping bag close up'],
    content: 'the product categories, brands only if given, ordering or checking stock on WhatsApp, and the convenience of the shop. No invented prices, offers or delivery.',
    avoid: 'gloomy cinematic darkness',
  },
  {
    id: 'tech',
    name: 'Software, IT, digital agencies and computer services',
    icon: 'code',
    keywords: ['software', 'it services', 'web design', 'website', 'digital marketing', 'app development', 'seo', 'computer', 'laptop repair', 'cyber cafe', 'agency', 'startup'],
    feel: 'competence, clarity and momentum',
    archetypes: ['Futuristic clean', 'Swiss International', 'Architectural blueprint', 'Neo-Bauhaus', 'Soft brutalism'],
    moods: ['mint and graphite', 'rust and faded denim', 'olive and lemon', 'midnight navy and copper', 'warm stone monochrome with one vivid accent'],
    types: ['monospace-accented technical display', 'wide extended sans display', 'chunky geometric grotesk display'],
    motions: ['snappy', 'cinematic'],
    imagery: [
      'a modern workspace with screens and good light',
      'hands on a keyboard or a team discussion, faces not shown',
      'the services the owner listed',
      'a circuit board or code on a screen close-up',
    ],
    queries: ['laptop workspace', 'team working office', 'code on screen', 'circuit board close up'],
    content: 'the services, the process, and starting a conversation on WhatsApp. No invented clients, stats or prices.',
    avoid: 'generic tech indigo gradients',
  },
  {
    id: 'garden',
    name: 'Florists, nurseries, farms and organic produce',
    icon: 'leaf',
    keywords: ['florist', 'flowers', 'nursery', 'plants', 'garden', 'farm', 'organic', 'dairy', 'agri', 'seeds', 'landscaping', 'honey'],
    feel: 'freshness and natural care',
    archetypes: ['Organic botanical', 'Japandi minimal', 'Hand-made zine', 'Heritage craft', 'Tropical vibrant'],
    moods: ['sage and blush', 'olive and lemon', 'rose and moss', 'deep forest green and brass', 'terracotta and clay with warm cream'],
    types: ['expressive soft serif display', 'old-style humanist serif display', 'elegant script accent paired with a clean serif'],
    motions: ['calm', 'playful'],
    imagery: [
      'lush plants or fresh flowers in natural light',
      'hands potting a plant or arranging flowers',
      'the products the owner listed',
      'a leaf, petal or soil texture close-up',
    ],
    queries: ['plant nursery greenhouse', 'florist arranging flowers', 'fresh flowers bouquet', 'green leaf close up'],
    content: 'the plants, flowers or produce, freshness and care, and ordering on WhatsApp. No invented prices or delivery promises.',
    avoid: 'industrial harshness, neon',
  },
  {
    id: 'general',
    name: 'Local business',
    icon: 'store',
    keywords: [],
    feel: 'trust and a warm welcome',
    archetypes: ALL,
    moods: ALL,
    types: ALL,
    motions: ALL,
    imagery: [
      'the business’s main offering shown at its best',
      'the workplace or craft behind it, people not identifiable',
      'the products or services the owner listed',
      'a close detail of the work or products',
    ],
    queries: [],
    content: 'what the business offers, why customers choose it (from the facts), how to get in touch on WhatsApp, and a short FAQ answered from the facts.',
    avoid: '',
  },
];

const BY_ID = new Map(INDUSTRIES.map((i) => [i.id, i]));

function haystack(site) {
  return [site.category, site.category, site.category, site.businessName, (site.services || []).join(' '), site.description, site.ownerWords]
    .filter(Boolean)
    .join(' \n ')
    .toLowerCase();
}

const GENERIC = new Set(['clinic', 'health', 'shop', 'store', 'classes', 'service centre', 'service center', 'agency', 'consultant']);
const patterns = new Map();
function wordPattern(word) {
  if (!patterns.has(word)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    patterns.set(word, new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?:s|es)?(?![\\p{L}\\p{N}])`, 'gu'));
  }
  return patterns.get(word);
}

export function classifyIndustry(site) {
  if (site?.industry && BY_ID.has(site.industry)) return BY_ID.get(site.industry);
  const text = haystack(site || {});
  let best = BY_ID.get('general');
  let bestScore = 0;
  for (const industry of INDUSTRIES) {
    let score = 0;
    for (const word of industry.keywords) {
      const hits = (text.match(wordPattern(word)) || []).length;
      if (hits) score += hits * (word.includes(' ') ? 2 : GENERIC.has(word) ? 0.5 : 1);
    }
    if (score > bestScore) {
      best = industry;
      bestScore = score;
    }
  }
  return best;
}

export function industryIcon(industry) {
  return ICONS[industry?.icon] || ICONS.store;
}

export function industryBrief(industry) {
  return (
    `BUSINESS CLASS: ${industry.name}\n` +
    `- Customers should feel: ${industry.feel}\n` +
    `- Picture for each section: hero = ${industry.imagery[0]}; about = ${industry.imagery[1]}; services = ${industry.imagery[2]}; detail = ${industry.imagery[3]}\n` +
    `- Content to cover: ${industry.content}\n` +
    (industry.avoid ? `- Avoid for this class: ${industry.avoid}\n` : '') +
    'If the business does not fit this class exactly, take the closest related class and borrow most of its direction.'
  );
}
