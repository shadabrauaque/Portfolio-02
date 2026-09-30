/*
 * Tests for the portfolio assistant. No dependencies — just Node 20+:
 *
 *     node --test chatbot/engine.test.js        (or just `node --test` from the repo root)
 *
 * They check that (1) the knowledge base is well-formed, (2) the facts in it
 * still match index.html, and (3) real-world questions reach the right answer.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('./engine.js');
const kb = require('./knowledge.js');

const repoRoot = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const newBot = () => Engine.createEngine(kb, { random: () => 0 });   // random: () => 0 → always the first answer variant
const router = newBot();                                              // routing doesn't depend on chat history, so one engine can serve many questions

/* ------------------------------------------------------------------ */
/* 1. The knowledge base is well-formed                                */
/* ------------------------------------------------------------------ */

test('knowledge base passes validation', () => {
  assert.deepEqual(Engine.validateKnowledge(kb), []);
});

test('every topic can be answered directly and has no unfilled {placeholders}', () => {
  const bot = newBot();
  for (const id of bot.topicIds()) {
    const r = bot.replyToTopic(id);
    assert.ok(r && r.text, `topic ${id} has no answer`);
    assert.doesNotMatch(r.text, /\{\w+\}/, `topic ${id} has an unfilled placeholder`);
    assert.doesNotMatch(r.text, /undefined|NaN|\[object/, `topic ${id} renders junk`);
    for (const a of r.actions) {
      assert.doesNotMatch(a.href + a.label, /\{\w+\}/, `topic ${id} action has an unfilled placeholder`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* 2. The knowledge base still matches the website                     */
/* ------------------------------------------------------------------ */

test('contact details and links match index.html', () => {
  const v = kb.vars;
  assert.ok(html.includes('mailto:' + v.email), 'email differs from index.html');
  assert.ok(html.includes('tel:' + v.phoneRaw), 'phone differs from index.html');
  assert.ok(html.includes(v.phone), 'displayed phone differs from index.html');
  for (const key of ['linkedin', 'behance', 'behanceProject', 'showreel']) {
    assert.ok(html.includes(v[key]), `${key} link differs from index.html`);
  }
});

test('the resume file the assistant links to exists', () => {
  assert.ok(fs.existsSync(path.join(repoRoot, kb.vars.resume)), kb.vars.resume + ' is missing');
});

test('index.html loads the assistant files, in an order that works', () => {
  const tag = (file) => html.indexOf(`<script src="chatbot/${file}"></script>`);
  const order = ['knowledge.js', 'engine.js', 'widget.js'].map(tag);
  assert.ok(order.every((i) => i >= 0), 'a chatbot <script> tag is missing from index.html');
  assert.ok(order[0] < order[1] && order[1] < order[2], 'chatbot scripts must load in this order: knowledge.js, engine.js, widget.js');
  assert.ok(html.includes('<link rel="stylesheet" href="chatbot/widget.css">'), 'chatbot/widget.css is not linked in index.html');
  for (const file of ['knowledge.js', 'engine.js', 'widget.js', 'widget.css']) {
    assert.ok(fs.existsSync(path.join(repoRoot, 'chatbot', file)), `chatbot/${file} is missing`);
  }
  // widget.js needs a browser to run, but a syntax slip should still be caught here.
  assert.doesNotThrow(() => new (require('node:vm').Script)(fs.readFileSync(path.join(__dirname, 'widget.js'), 'utf8'), { filename: 'widget.js' }));
});

test('experience answer lists every job on the page, with the same dates', () => {
  const answer = newBot().replyToTopic('experience').text;
  const re = /<p class="company">([^|<]+)\|\s*<span>([^<]+)<\/span><\/p>/g;
  let m, count = 0;
  while ((m = re.exec(html))) {
    count++;
    assert.ok(answer.includes(m[1].trim()), `experience answer is missing "${m[1].trim()}"`);
    assert.ok(answer.includes(m[2].trim()), `experience answer is missing "${m[2].trim()}"`);
  }
  assert.ok(count >= 5, 'expected to find the experience timeline in index.html');
});

test('education answer matches the page', () => {
  const answer = newBot().replyToTopic('education').text;
  for (const s of ['Bachelor of Science in Animation', 'Mahatma Gandhi University', '2012 – 2016']) {
    assert.ok(html.includes(s), `index.html no longer contains "${s}"`);
    assert.ok(answer.includes(s), `education answer is missing "${s}"`);
  }
});

test('skill, software and target-role tags on the page all appear in the answers', () => {
  const bot = newBot();
  const spans = (markup) => [...markup.matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1].trim());
  const tagsOf = (chunk) => spans((chunk.match(/<div class="tags[^"]*">([\s\S]*?)<\/div>/) || [, ''])[1]);

  const categories = html.split('<div class="skill-category">').slice(1).map(tagsOf);   // Animation & Design, Motion & Video, Software
  const skills = categories.slice(0, 2).flat();
  const software = categories[2] || [];
  const roles = tagsOf(html.slice(html.indexOf('class="tags roles-tags"') - 12));
  // Only check that the page could be read. Exact counts are deliberately NOT asserted, so adding a tag
  // to the site fails below with "answer is missing X" (what to fix) rather than with a parsing error.
  assert.ok(skills.length > 0 && software.length > 0 && roles.length > 0,
    `could not parse the tags from index.html (${skills.length} skills, ${software.length} software, ${roles.length} roles)`);

  const skillsAnswer = bot.replyToTopic('skills').text.toLowerCase();
  const softwareAnswer = bot.replyToTopic('software').text.toLowerCase();
  const availabilityAnswer = bot.replyToTopic('availability').text.toLowerCase();
  for (const tag of skills) {
    for (const word of tag.toLowerCase().split(/\s+/)) { assert.ok(skillsAnswer.includes(word), `skills answer is missing "${tag}"`); }
  }
  for (const tag of software) { assert.ok(softwareAnswer.includes(tag.toLowerCase()), `software answer is missing "${tag}"`); }
  for (const tag of roles) { assert.ok(availabilityAnswer.includes(tag.toLowerCase()), `availability answer is missing role "${tag}"`); }
});

/* ------------------------------------------------------------------ */
/* 3. Language handling                                                */
/* ------------------------------------------------------------------ */

test('stemmer joins related word forms', () => {
  const families = [
    ['edit', 'editing', 'editor', 'edited', 'edits', 'editors'],
    ['animate', 'animated', 'animation', 'animations', 'animator', 'animators', 'animating'],
    ['hire', 'hiring', 'hired', 'hires'],
    ['design', 'designer', 'designers', 'designing', 'designed'],
    ['freelance', 'freelancer', 'freelancing'],
    ['experience', 'experiences', 'experienced'],
    ['relocate', 'relocation', 'relocating', 'relocated'],
    ['study', 'studies', 'studied', 'studying'],
    ['company', 'companies'],
    ['skill', 'skills', 'skilled'],
    ['base', 'based', 'basing'],
    ['composite', 'compositing', 'composition'],
    ['profession', 'professional', 'professionally'],
    ['create', 'creator', 'creation', 'created'],
    ['graphic', 'graphics'],
    ['resume', 'resumes', 'résumé']
  ];
  for (const family of families) {
    const stems = new Set(family.map((w) => Engine.tokenize(w)[0]));
    assert.equal(stems.size, 1, `${family.join('/')} → ${[...stems].join(', ')}`);
  }
});

test('tokenizer understands contractions, pronouns and filler', () => {
  assert.deepEqual(Engine.tokenize("What's his email?"), ['what', 'be', 'HE', 'email']);
  assert.deepEqual(Engine.tokenize('tell me about Md Shadab Raunaqui'), ['tell', 'about', 'HE']);
  assert.deepEqual(Engine.tokenize('hiiiii!!'), ['hi']);
  assert.deepEqual(Engine.tokenize(''), []);
  assert.deepEqual(Engine.tokenize('?!...'), []);
});

test('edit distance', () => {
  assert.equal(Engine.editDistance('portfolio', 'portfolio', 2), 0);
  assert.equal(Engine.editDistance('porfolio', 'portfolio', 2), 1);
  assert.equal(Engine.editDistance('linkdin', 'linkedin', 2), 1);
  assert.equal(Engine.editDistance('resume', 'resmue', 2), 1);          // transposition
  assert.ok(Engine.editDistance('skill', 'still', 1) > 0);
});

/* ------------------------------------------------------------------ */
/* 4. Routing: real questions → the right topic                        */
/* ------------------------------------------------------------------ */

// topic → questions. An array value [a, b] means "either is an acceptable answer".
const ROUTES = {
  greeting: ['hi', 'Hello', 'hey there', 'Hello!', 'good morning', 'Good evening!', 'namaste', 'hiii', 'helloooo', 'hi there!'],
  howareyou: ['how are you', 'How are you?', "how's it going", 'how are you doing today', "what's up"],
  thanks: ['thanks', 'thank you', 'Thank you so much!', 'thx', 'thanks a lot', 'much appreciated', 'Thanks for the help'],
  bye: ['bye', 'goodbye', 'see you later', "that's all", 'no thanks', 'ok bye', 'nope', 'nothing else'],
  affirm: ['ok', 'okay', 'cool', 'great', 'nice', 'awesome', 'sounds good', 'got it', 'interesting'],
  identity: [
    'who are you', 'Who are you?', 'are you a bot?', 'are you human', 'are you real', 'is this a real person', 'are you AI',
    'are you chatgpt', 'are you shadab?', 'am I talking to Shadab', 'what is your name', "what's your name?", 'who made you',
    'tell me about yourself', 'introduce yourself', 'is this a bot', 'are you a robot'
  ],
  help: ['help', 'what can you do', 'what can I ask', 'what should I ask you', 'how does this work', 'menu', 'what do you know'],
  about: [
    'who is shadab', 'Who is Shadab?', 'who is md shadab raunaqui', 'tell me about shadab', 'tell me about him',
    'tell me more about Shadab', 'what does he do', 'what does Shadab do', 'what do you do', 'what does he do for a living',
    "what's his profession", 'what is his job', 'introduce him', 'give me a short bio', 'his background', 'quick summary',
    'what is his name', 'can you tell me about him', 'describe him', 'about shadab', 'who is he'
  ],
  skills: [
    'skills', 'what skills does he have', 'what are his skills', 'what is he good at', 'what does he specialize in',
    'his expertise', 'core skills', 'skill set', 'what are you good at', 'is he skilled in animation',
    'does he do storyboarding', 'does he know character design', 'can he do motion graphics', 'does he do compositing',
    'is he good at color correction', 'does he do vfx', 'does he do logo design', 'can he do sound design',
    'does he know python', 'does he do voice over', 'does he do 2d animation', 'what is his specialty'
  ],
  software: [
    'software', 'what software does he use', 'which tools does he use', 'what tools do you use', 'what programs does he know',
    'does he use after effects', 'does he know Premiere Pro?', 'is he good at photoshop', 'blender', 'does he use illustrator',
    'what adobe apps does he use', 'does he use Maya', 'does he know cinema 4d', 'does he know toon boom',
    'does he use davinci resolve', 'does he use capcut', 'what about Edius', 'coreldraw', 'does he know aftereffects',
    'Does he use Canva?', 'what is his tech stack', 'which software is he proficient in'
  ],
  'three-d': ['does he do 3d', '3D animation?', 'can he do 3d modeling', 'is he good at 3d', 'what about 3d', 'does he do cgi', 'rigging?', 'can you do 3d animation'],
  services: [
    'what services does he offer', 'what can he create', 'what can you make for me', 'what kind of videos does he make',
    'can he make reels', 'does he make real estate videos', 'does he do horror animation',
    'what type of work does he do', 'can he make explainer videos', 'does he do social media videos', 'services',
    'what can he do for my business', 'can you make cartoon videos', 'what can he do'
  ],
  strengths: [
    'why should I hire him', 'why hire Shadab', 'what makes him different', 'what are his strengths', 'what is his work style',
    'how does he work', 'what is his workflow', 'is he a team player', 'how is his communication', 'what is his process',
    'what sets him apart', 'what are your strengths'
  ],
  experience: [
    'experience', 'how many years of experience does he have', 'how much experience does he have', 'work history',
    'where has he worked', 'where did he work before', 'previous companies', 'which companies has he worked for',
    'what is his career path', 'career timeline', 'years of experience', 'how long has he been working',
    'has he worked with big brands', 'who are his clients', 'what is his work experience', 'what is your experience',
    'tell me about his experience', 'his professional experience', 'how many years has he been animating'
  ],
  'job-freelance': [
    'what does he do as a freelancer', 'tell me about his freelance work', 'what is his current job', 'what is he doing now',
    'where does he work now', 'what is he working on currently', 'what has he been doing since 2023', 'what did he do in 2024',
    'what is his current role'
  ],
  'job-bada': ['tell me about bada business', 'what did he do at Bada', 'bada business pvt ltd', 'his role at bada', 'what did he do in 2021'],
  'job-telyone': ['tell me about telyone', 'what did he do at Telyone', 'telyone pvt ltd', 'what was he doing in 2019'],
  'job-sri-nityanand': ['sri nityanand', 'what did he do at Sri Nityanand', 'tell me about nityanand'],
  'job-digimonk': ['digi monk', 'what did he do at Digi Monk', 'where did he start his career', 'what was his first job', 'digimonk'],
  education: [
    'education', 'what did he study', 'where did he study', 'what degree does he have', 'what is his qualification',
    'which university did he go to', 'is he a graduate', 'his educational background', 'does he have a bachelor degree',
    'does he have a masters degree', 'does he have any certifications', 'what college did he attend', 'bsc'
  ],
  location: [
    'where is he based', 'where are you based', 'where does he live', 'which country is he in', 'is he in India',
    'is he based in dubai', 'is he open to relocation', 'will he relocate to dubai', 'is he in the uae', 'location',
    'where is he from', 'what city does he live in', 'dubai'
  ],
  remote: ['can he work remotely', 'does he do remote work', 'is he open to remote', 'work from home', 'can he work on site', 'hybrid?'],
  availability: [
    'is he available', 'is Shadab available for freelance work?', 'is he open to work?', 'can I hire him', 'how can I hire him',
    'I want to hire Shadab', 'is he looking for a job', 'is he available for a project', 'what roles is he looking for',
    'what are his target roles', 'is he open to full time roles', 'does he take freelance projects', 'I have a project for him',
    'can we work together', 'are you available for hire', 'is he taking new clients', 'availability', 'hire', 'freelance',
    'is he open to job offers', 'is he seeking new opportunities'
  ],
  contact: [
    'contact', 'how can I contact him', 'what is his email', "what's his email address", 'what is his phone number',
    'how can I reach Shadab', 'give me his number', 'whatsapp', 'linkedin', 'can I call him', 'how do I get in touch',
    'email', 'phone', 'can I talk to him', 'how to contact you', 'send him a message', 'can I schedule a call with him',
    'does he have instagram', 'mobile number', 'contact details', 'his gmail'
  ],
  terms: [
    'how much does he charge', 'what are his rates', 'what is his price', 'pricing', 'how much for a 1 minute video',
    'what is his hourly rate', 'what is his salary expectation', 'can I get a quote', 'what is his budget',
    'how long does a project take', 'what is the turnaround time', 'what is his notice period', 'does he have a visa',
    'when can he start', 'what is his fee', 'what does he charge per video', 'is he expensive', 'rates'
  ],
  languages: ['what languages does he speak', 'does he speak english', 'is he fluent in english', 'does he speak arabic', 'does he speak hindi'],
  portfolio: [
    'portfolio', 'show me his work', 'can I see his work', 'do you have a portfolio', 'where can I see his work',
    'any samples?', 'work samples', 'showreel', 'show reel', 'behance', 'his past work', 'what has he made',
    'does he have a youtube channel', 'link to his portfolio', 'can I watch his videos', 'examples of his work',
    'show me your work', 'what projects has he done', 'case studies'
  ],
  resume: ['resume', 'CV', 'can I get his resume', 'download resume', 'send me his cv', 'resume pdf', 'curriculum vitae', 'do you have a resume', 'résumé'],
  personal: ['how old is he', 'what is his age', 'is he married', 'what are his hobbies', 'does he have kids', 'what religion is he', 'what is his date of birth'],
  offtopic: [
    'what is the weather in dubai', 'tell me a joke', 'who won the cricket match', 'write a poem', 'what is the capital of france',
    'can you write code for me', 'what is the bitcoin price', 'sing a song'
  ]
};

// Questions where two answers are equally reasonable.
const EITHER = [
  ['Hello! Can you tell me about his skills and software?', ['skills', 'software']],
  ['can he design characters', ['services', 'skills']],
  ['can he edit youtube videos', ['services', 'skills']],
  ['I am a recruiter in Dubai, what roles is he open to and can he relocate?', ['availability', 'location']],
  ['what is his experience with blender', ['software', 'experience']],
  ['do you have any experience in storyboarding', ['skills', 'experience']]
];

for (const [topic, questions] of Object.entries(ROUTES)) {
  test(`routes to "${topic}"`, () => {
    const failures = [];
    for (const q of questions) {
      const r = router.reply(q);
      if (!r || r.topic !== topic) {
        failures.push(`  "${q}" → ${r ? (r.topic || r.kind) : 'null'}   (scores: ${JSON.stringify(router.rank(q).slice(0, 3).map((x) => x.id + ':' + x.score.toFixed(1)))})`);
      }
    }
    assert.equal(failures.length, 0, `\n${failures.join('\n')}`);
  });
}

// Realistic questions collected in question-bank.js (see that file for how to add one).
const BANK = require('./question-bank.js');
test(`question bank: ${BANK.length} realistic visitor questions reach a sensible answer`, () => {
  const failures = [];
  for (const [q, expected] of BANK) {
    const bot = router;
    const r = bot.reply(q);
    const got = r.kind === 'answer' ? r.topic : r.kind;
    if (![].concat(expected).includes(got)) {
      const top = bot.rank(q).slice(0, 3).map((x) => x.id + ':' + x.score.toFixed(1)).join(', ');
      failures.push(`  "${q}" → ${got}   (wanted ${[].concat(expected).join(' | ')};  scores ${top})`);
    }
  }
  assert.equal(failures.length, 0, `\n${failures.join('\n')}`);
});

test('ambiguous questions land on one of the reasonable answers', () => {
  const failures = [];
  for (const [q, ok] of EITHER) {
    const r = newBot().reply(q);
    if (!r || !ok.includes(r.topic)) { failures.push(`  "${q}" → ${r && (r.topic || r.kind)}  (wanted ${ok.join(' or ')})`); }
  }
  assert.equal(failures.length, 0, `\n${failures.join('\n')}`);
});

test('typos, shouting and sloppy punctuation still work', () => {
  const cases = {
    'wat r his skils': 'skills',
    'whats his experiance': 'experience',
    'is he availabel for work': 'availability',
    'how can i contct him': 'contact',
    'sho me his porfolio': 'portfolio',
    'what sofware does he use': 'software',
    'his educaton': 'education',
    'whats his linkdin': 'contact',
    'showrell': 'portfolio',
    'resum': 'resume',
    'hw much do u charge': 'terms',
    'SKILLS!!!': 'skills',
    'WHAT IS HIS EMAIL???': 'contact',
    '  email  ?': 'contact',
    'is he freelanceing': 'availability',
    'whats ur email': 'contact',
    'tell me abt him': 'about'
  };
  const failures = [];
  for (const [q, topic] of Object.entries(cases)) {
    const r = newBot().reply(q);
    if (!r || r.topic !== topic) { failures.push(`  "${q}" → ${r && (r.topic || r.kind)}  (wanted ${topic})`); }
  }
  assert.equal(failures.length, 0, `\n${failures.join('\n')}`);
});

test('a greeting plus a real question answers the question', () => {
  assert.equal(newBot().reply('hi, what is his email?').topic, 'contact');
  assert.equal(newBot().reply('thanks! what about his education?').topic, 'education');
  assert.equal(newBot().reply('ok great, show me his portfolio').topic, 'portfolio');
});

test('"tell me about his X" goes to X, not to the general intro', () => {
  assert.equal(newBot().reply('tell me about his skills').topic, 'skills');
  assert.equal(newBot().reply('tell me about his education').topic, 'education');
  assert.equal(newBot().reply('tell me about his portfolio').topic, 'portfolio');
});

/* ------------------------------------------------------------------ */
/* 5. Honesty: never claim what isn't in the knowledge base            */
/* ------------------------------------------------------------------ */

test('listed tools get a "Yes" lead', () => {
  assert.match(newBot().reply('does he know blender').text, /^Yes — Blender is in his toolkit\./);
  assert.match(newBot().reply('does he use after effects').text, /^Yes — Adobe After Effects is in his toolkit\./);
  assert.match(newBot().reply('does he use premiere and photoshop').text, /^Yes — Adobe Premiere Pro and Adobe Photoshop are all in his toolkit\./);
});

test('tools that are not listed are NOT claimed', () => {
  assert.match(newBot().reply('does he use maya').text, /^I don’t see Maya on his list of tools\./);
  assert.match(newBot().reply('does he know davinci resolve').text, /^I don’t see DaVinci Resolve on his list of tools\./);
  const mixed = newBot().reply('does he know after effects and maya').text;
  assert.match(mixed, /^Yes — Adobe After Effects is in his toolkit, but I don’t see Maya on his list\./);
  assert.match(newBot().reply('does he know flash').text, /Adobe Animate — the successor to Flash — is part of his toolkit\./);
});

test('skills that are not listed are NOT claimed', () => {
  assert.match(newBot().reply('does he do vfx').text, /^I don’t see VFX listed among his skills\. Compositing is part of his skill set, though\./);
  assert.match(newBot().reply('can he do sound design').text, /^I don’t see sound design listed among his skills\./);
  assert.match(newBot().reply('does he know python').text, /^I don’t see programming listed among his skills\./);
  assert.match(newBot().reply('does he do storyboarding').text, /^Yes — storyboarding is one of his skills\./);
});

test('missing qualifications are not invented', () => {
  assert.match(newBot().reply('does he have a masters degree').text, /^I don’t see a postgraduate degree listed on his resume\./);
  assert.match(newBot().reply('does he have any certifications').text, /^I don’t see certifications listed on his resume\./);
});

test('3D is described honestly as a secondary skill', () => {
  const t = newBot().reply('does he do 3d').text;
  assert.match(t, /core focus is 2D/);
  assert.match(t, /Blender/);
});

test('rates, visa and notice period are never quoted', () => {
  const t = newBot().reply('how much does he charge').text;
  assert.match(t, /don’t have/);
  assert.doesNotMatch(t, /[$₹€£]\s?\d|\d+\s?(usd|inr|aed|dollars|rupees|dirhams)/i);
});

test('the assistant says what it is, and does not pretend to be Shadab', () => {
  const t = newBot().reply('are you shadab?').text;
  assert.match(t, /virtual assistant/);
  assert.match(t, /not Shadab/);
});

/* ------------------------------------------------------------------ */
/* 6. Not-understood paths                                             */
/* ------------------------------------------------------------------ */

test('nonsense falls back and offers to forward the question', () => {
  for (const q of ['asdfgh', 'qwerty', '???', '...', 'blah blah blah', 'lorem ipsum dolor sit amet', 'xyz', '😀', 'does he have a pet dog']) {
    const r = newBot().reply(q);
    assert.ok(r, q);
    assert.equal(r.kind, 'fallback', `"${q}" should fall back, got ${r.kind}/${r.topic}`);
    assert.equal(r.actions.length, 1);
    assert.ok(r.actions[0].href.startsWith('mailto:' + kb.vars.email + '?subject='), q);
    assert.ok(r.actions[0].href.includes('body=' + encodeURIComponent(q)), 'the question is passed along');
    assert.ok(r.suggestions.length >= 3, 'fallback still offers suggestions');
  }
});

test('ambiguous one-word questions ask "did you mean…" with relevant buttons', () => {
  const r = newBot().reply('animation');
  assert.equal(r.kind, 'clarify');
  assert.ok(r.suggestions.length >= 2 && r.suggestions.length <= 3);
  assert.ok(r.suggestions.every((s) => s.label && s.topic));
});

test('off-topic questions are politely declined', () => {
  const r = newBot().reply('what is the weather like in dubai today');
  assert.equal(r.topic, 'offtopic');
  assert.match(r.text, /outside my lane/);
});

/* ------------------------------------------------------------------ */
/* 7. Response shape                                                   */
/* ------------------------------------------------------------------ */

test('empty input is ignored', () => {
  const bot = newBot();
  assert.equal(bot.reply(''), null);
  assert.equal(bot.reply('    '), null);
  assert.equal(bot.reply(null), null);
  assert.equal(bot.reply(undefined), null);
});

test('contact answer has working email / phone / LinkedIn buttons', () => {
  const r = newBot().reply('how can I contact him');
  assert.deepEqual(r.actions.map((a) => a.href), ['mailto:' + kb.vars.email, 'tel:' + kb.vars.phoneRaw, kb.vars.linkedin]);
  assert.match(r.text, new RegExp(kb.vars.email.replace('.', '\\.')));
  assert.match(r.text, /\+91 7091770568/);
});

test('portfolio answer links to the three places on the page', () => {
  const r = newBot().reply('show me his work');
  assert.deepEqual(r.actions.map((a) => a.href), [kb.vars.behance, kb.vars.behanceProject, kb.vars.showreel]);
  assert.ok(r.actions.every((a) => a.external));
});

test('resume answer links to the PDF', () => {
  const r = newBot().reply('can I get his resume');
  assert.equal(r.actions[0].href, 'Resume.pdf');
});

test('project-brief email opens with a subject line', () => {
  const r = newBot().reply('how much does he charge');
  assert.ok(r.actions[0].href.startsWith('mailto:' + kb.vars.email + '?subject=Project%20enquiry'));
});

test('suggestions: at most 4, never the current topic, and they move on to new topics', () => {
  const bot = newBot();
  const first = bot.reply('what are his skills');
  assert.ok(first.suggestions.length > 0 && first.suggestions.length <= 4);
  assert.ok(!first.suggestions.some((s) => s.topic === 'skills'));
  assert.ok(first.suggestions.every((s) => s.label));

  // After exploring a few topics, suggestions prefer ones not yet asked.
  bot.reply('portfolio'); bot.reply('experience'); bot.reply('contact');
  const later = bot.reply('what software does he use');
  const asked = new Set(['skills', 'portfolio', 'experience', 'contact', 'software']);
  assert.ok(later.suggestions.some((s) => !asked.has(s.topic)), 'should surface something new');
  bot.reset();
  assert.ok(bot.reply('skills').suggestions.some((s) => s.topic === 'portfolio'));
});

test('welcome message introduces the assistant and offers the starters', () => {
  const w = newBot().welcome();
  assert.match(w.text, /virtual assistant/);
  assert.deepEqual(w.suggestions.map((s) => s.topic), kb.starters);
});

test('suggestion buttons answer their own topic', () => {
  const bot = newBot();
  for (const s of bot.welcome().suggestions) {
    assert.equal(bot.replyToTopic(s.topic).topic, s.topic);
  }
});

test('small talk does not crowd out the suggestions', () => {
  const r = newBot().reply('thanks');
  assert.ok(r.suggestions.length >= 3);
});

test('answer variants are picked with the supplied random function', () => {
  const first = Engine.createEngine(kb, { random: () => 0 }).reply('hello').text;
  const last = Engine.createEngine(kb, { random: () => 0.999 }).reply('hello').text;
  assert.notEqual(first, last);
});

/* ------------------------------------------------------------------ */
/* 8. Robustness                                                       */
/* ------------------------------------------------------------------ */

test('hostile and oversized input is handled safely', () => {
  const bot = newBot();
  const xss = bot.reply('<svg/onload=alert(1)> "dq" \'sq\' &amp; %00 \u0000');
  assert.equal(xss.kind, 'fallback');
  assert.ok(!/[<>]/.test(xss.actions[0].href), 'the forwarded question is URL-encoded');

  const t0 = Date.now();
  const huge = bot.reply('skills '.repeat(5000));
  assert.ok(huge, 'still answers');
  assert.ok(Date.now() - t0 < 500, 'does not choke on long input');

  assert.doesNotThrow(() => bot.reply(12345));
  assert.doesNotThrow(() => bot.reply({ toString() { return 'skills'; } }));
  assert.doesNotThrow(() => bot.reply('ÀÉÎÕÜ çñ 日本語 مرحبا 🤖'));
});

test('answers quickly', () => {
  const bot = newBot();
  const qs = ['what are his skills', 'is he available for freelance work in dubai', 'wat r his skils', 'does he know blender and maya'];
  const t0 = Date.now();
  for (let i = 0; i < 1000; i++) { bot.reply(qs[i % qs.length]); }
  assert.ok(Date.now() - t0 < 3000, `1000 replies took ${Date.now() - t0}ms`);
});
