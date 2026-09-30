/*
 * Knowledge base for "Shadab's Assistant" — the chatbot that answers questions
 * about Shadab on his behalf.
 *
 * WHAT TO EDIT
 *   • To change what the assistant SAYS  → edit the `answer` text of a topic.
 *   • To change HOW people can ask       → add words/phrases to a topic's `terms`.
 *   • To change contact details / links  → edit `vars` (used everywhere as {name}).
 *   • Keep these facts in sync with index.html and Resume.pdf. The tests in
 *     chatbot/engine.test.js fail if contact details or employers drift apart.
 *
 * The assistant only ever says what is written here, so it can never make
 * something up about Shadab. If a question isn't covered it says so and offers
 * to forward the question to him.
 *
 * TERMS — how matching works (chatbot/README.md has the full story)
 *   Each topic has `terms: [[weight, 'phrase', 'phrase', …], …]`.
 *   • Bigger weight = stronger signal. A topic answers once its total reaches 3;
 *     between 1 and 3 the assistant asks "did you mean…?" instead.
 *   • Matching ignores case, punctuation, plurals and word endings
 *     (edit / editing / editor all match) and forgives small typos.
 *   • The words of a phrase must appear in that order. One other word may sit between
 *     neighbours, so 'can P animate' also matches "can he teach animation".
 *   • In a phrase, a capital  P  means "he / his / him / Shadab / you / your".
 *     So 'what do P do' matches both "what does he do" and "what do you do".
 *   • Three optional markers change how strictly a phrase must fit:
 *       $  at the end    → it must be the end of the question.
 *                          'tell about he$' matches "tell me about him",
 *                          but not "tell me about his skills".
 *       ^  at the start  → it must be the start of the question.
 *                          '^hi' matches "hi there", but not "say hi to him".
 *       =  at the start  → strict: the words must sit right next to each other.
 *                          '=can P animate' matches "can he animate",
 *                          but not "can he teach animation".
 *     They combine, in this order:  '^=what P do$'.
 *   • Phrases that differ only in word endings ('thanks' / 'thank', 'animation' / 'animator')
 *     count as the SAME phrase — list it once. The tests report duplicates.
 *   • A longer phrase that contains a shorter one takes its place, so nothing is counted
 *     twice ('is P good at' covers 'good at').
 *
 * WHEN A QUESTION GETS THE WRONG ANSWER
 *   Add it to chatbot/question-bank.js together with the topic it should reach, run
 *   `node --test`, then adjust `terms` until everything passes. The bank is what stops an
 *   old fix from quietly breaking when new terms are added.
 */
(function (root) {
  'use strict';

  var kb = {

    owner: { name: 'Md Shadab Raunaqui', short: 'Shadab' },

    /* ---------- Copy used by the chat window ---------- */
    ui: {
      launcher: 'Ask about Shadab',
      title: 'Shadab’s Assistant',
      status: 'Replies on Shadab’s behalf',
      placeholder: 'Ask about Shadab’s work, skills…',
      nudge: 'Got a question about Shadab? Ask me!',
      disclaimer: 'Automated assistant · based on Shadab’s portfolio & resume'
    },

    welcome:
      'Hi, I’m Shadab’s virtual assistant.\n' +
      'I answer questions about him on his behalf — his work, skills, experience, availability and how to get in touch. What would you like to know?',

    // Suggestion buttons shown when the chat opens (topic ids).
    starters: ['about', 'skills', 'portfolio', 'availability', 'contact'],
    // Used to top up the suggestion buttons after each answer (topic ids, in order).
    suggestionOrder: ['about', 'skills', 'experience', 'portfolio', 'availability', 'contact', 'resume', 'software', 'education'],

    /* ---------- Facts that appear in several places ---------- */
    vars: {
      email: 'shadabraunaque@gmail.com',
      phone: '+91 7091770568',
      phoneRaw: '+917091770568',
      linkedin: 'https://www.linkedin.com/in/shadab-raunaque-95401b87/',
      behance: 'https://www.behance.net/shadabraunaque',
      behanceProject: 'https://www.behance.net/gallery/211956453/2D-Animation-and-Motion-Graphic-Portfolio',
      showreel: 'https://www.youtube.com/watch?v=r19LkWnFKCw',
      resume: 'Resume.pdf'
    },

    /* ---------- Buttons the assistant can attach to an answer ---------- */
    links: {
      email:          { label: 'Email Shadab',         href: 'mailto:{email}',   icon: 'mail' },
      phone:          { label: 'Call {phone}',         href: 'tel:{phoneRaw}',   icon: 'phone' },
      linkedin:       { label: 'LinkedIn',             href: '{linkedin}',       icon: 'linkedin', external: true },
      behance:        { label: 'Behance portfolio',    href: '{behance}',        icon: 'image',    external: true },
      behanceProject: { label: '2D animation project', href: '{behanceProject}', icon: 'layers',   external: true },
      showreel:       { label: 'Watch showreel',       href: '{showreel}',       icon: 'play',     external: true },
      resume:         { label: 'View resume (PDF)',    href: '{resume}',         icon: 'file',     external: true }
    },

    /* ---------- Replies when nothing matches ---------- */
    fallback: {
      text: [
        'I’m not sure I have an answer to that — I can only speak to what’s on Shadab’s portfolio and resume. You could ask about his skills, experience, software or availability, or send your question straight to him.',
        'Hmm, that one’s beyond what I know about Shadab. I can tell you about his work, skills, experience, education and availability — or you can pass your question on to him directly.'
      ],
      clarify: 'I’m not quite sure what you’re asking. Did you mean one of these?',
      emailLabel: 'Send this question to Shadab',
      emailSubject: 'Question from your portfolio'
    },

    /* ======================================================================
     * TOPICS
     * id          unique name (used by `followUps`, `starters`…)
     * chip        short label for suggestion buttons (omit = never suggested)
     * priority    wins ties (default 1)
     * smalltalk   true = only answers when nothing more useful matched
     * terms       how people might ask — see the notes at the top
     * entities    specific skills/tools: a match adds a "Yes — …" lead sentence
     * unlisted    things he does NOT list: a match adds an honest "I don't see …" lead
     * answer      text, or a list of variants. **bold**, [link](url), "- " bullets, {vars}
     * actions     buttons: keys of `links` (or { link, label, subject })
     * followUps   topic ids to suggest next
     * ==================================================================== */
    topics: [

      /* ------------------------------ small talk ------------------------------ */
      {
        id: 'greeting', smalltalk: true, priority: 0,
        terms: [
          [4, 'hi', 'hello', 'hey', 'hiya', 'howdy', 'greetings', 'hola', 'yo', 'namaste', 'salam', 'salaam',
              'assalamualaikum', 'good morning', 'good afternoon', 'good evening', 'good day']
        ],
        answer: [
          'Hello! How can I help you learn about Shadab today?',
          'Hi there! Ask me anything about Shadab — his work, skills, experience or availability.',
          'Hey! What would you like to know about Shadab?'
        ]
      },
      {
        id: 'howareyou', smalltalk: true, priority: 0,
        terms: [
          [6, 'how are you', 'how do you do', 'how is it going', 'how is life', 'how are things', 'how you doing',
              'what is up', 'wassup', 'sup']
        ],
        answer: 'I’m doing great, thanks for asking! What would you like to know about Shadab?'
      },
      {
        id: 'thanks', smalltalk: true, priority: 0,
        terms: [[12, 'thanks for', 'thank you for'], [6, 'thanks', 'thankyou', 'appreciate', 'cheers', 'grateful', 'much obliged']],
        answer: [
          'You’re very welcome! Anything else you’d like to know about Shadab?',
          'Happy to help! Let me know if there’s anything else.'
        ]
      },
      {
        id: 'bye', smalltalk: true, priority: 0,
        terms: [
          [4, 'bye', 'goodbye', 'cya', 'farewell', 'ciao', 'see you', 'see ya', 'take care', 'talk later', 'catch you later'],
          [8, 'no thanks', 'no thank you', 'nothing else', 'that is all', 'that is it', 'no more questions'],
          [3, 'no', 'nope', 'nah', 'not really']
        ],
        answer: 'Thanks for stopping by! If you’d like to get in touch with Shadab directly, his email is {email}. Have a great day!',
        actions: ['email']
      },
      {
        id: 'affirm', smalltalk: true, priority: 0,
        terms: [
          [3, 'yes', 'yeah', 'yep', 'yup', 'ok', 'okay', 'sure', 'cool', 'nice', 'great', 'awesome', 'wow', 'perfect',
              'alright', 'fine', 'good', 'got it', 'sounds good', 'makes sense', 'interesting', 'impressive', 'amazing',
              'excellent', 'wonderful', 'brilliant', 'fantastic', 'lovely']
        ],
        answer: [
          'Great! What else would you like to know about Shadab?',
          'Glad that helps! Anything else you’d like to ask?'
        ]
      },

      /* --------------------------- about the assistant ------------------------ */
      {
        id: 'identity', priority: 5,
        terms: [
          [10, 'am i talking to P', 'am i chatting with P', 'am i speaking to P', 'am i speaking with P'],
          [8, 'who are you', 'what are you$', 'are you a bot', 'are you a robot', 'are you human', 'are you real',
              'are you a real person', 'are you ai', 'are you chatgpt', 'are you shadab',
              'is this shadab', 'is this a bot', 'is this a real person', 'am i talking to', 'am i chatting with',
              'am i speaking to', 'who made you', 'who built you', 'who created you', 'who programmed you', 'who is this',
              'what is this', 'your name', 'introduce yourself', '=about yourself',
              'describe yourself', 'what should i call you', 'are you alive'],
          [8, 'who made this', 'who built this', 'who created this', 'who programmed this', 'who designed this',
              'who coded this', 'is this ai', 'is this chatgpt', 'is this automated'],
          [4, 'chatbot', 'robot', 'automated', 'virtual assistant', 'artificial intelligence', 'chatgpt', 'gpt', 'llm',
              'real person', 'bot'],
          [3, 'ai'],
          [2, 'human', 'assistant']
        ],
        answer:
          'I’m Shadab’s virtual assistant — a chatbot that answers questions about him on his behalf. I’m not a person (and I’m not Shadab himself), and I only share what’s on his portfolio and resume.\n\n' +
          'If you’d rather talk to him directly, I can point you to his email, phone and LinkedIn.',
        actions: ['email', 'linkedin'],
        followUps: ['about', 'contact', 'skills']
      },
      {
        id: 'help', priority: 4, chip: 'What can I ask?',
        terms: [
          [8, 'what can you do', 'what can i ask', 'what can i say', 'what should i ask', 'what to ask', 'how does this work',
              'how do you work', 'what do you know', 'what do you know about', 'how can you help', 'what can you help',
              'what can you tell', 'what can you answer', 'what questions'],
          [5, 'help', 'menu', 'options', 'topics', 'commands', 'instructions', 'suggestions', 'ideas']
        ],
        answer:
          'I can tell you about Shadab’s:\n' +
          '- background and what he does\n' +
          '- skills and software\n' +
          '- work experience and education\n' +
          '- portfolio, showreel and resume\n' +
          '- availability, location and contact details\n\n' +
          'Just type a question, or tap one of the suggestions below.',
        followUps: ['about', 'skills', 'portfolio', 'availability']
      },

      /* ------------------------------ about Shadab ---------------------------- */
      {
        id: 'about', priority: 2, chip: 'Who is Shadab?',
        terms: [
          // "he" (not P) on purpose, so "who are you?" goes to the assistant topic instead.
          [7, '=what P do', '=about P work', 'who is he$', 'tell about he$', 'about he$', 'introduce he', 'describe he', 'what is he like',
              'what do P do', 'what P do for a living', 'P profession', 'what is P job', 'what is P profession',
              'what is P occupation', 'what is P role', 'P job title', 'what is P name', 'full name'],
          [8, 'who is behind', 'whose portfolio', 'whose website', 'who owns'],
          [4, 'bio', 'biography', 'background', 'summary', 'overview', 'intro', 'introduction',
              'professional summary', 'profession', 'occupation'],
          [3, 'profile'],
          [2, 'animator', 'designer', 'editor', 'artist']
        ],
        answer:
          '**Md Shadab Raunaqui** is a 2D Animator, Character Designer, Motion Graphics Designer and Video Editor with 7+ years of professional experience in animation, visual storytelling, digital content and post-production.\n\n' +
          'He’s worked on character-driven animation, storyboarding, background design, motion graphics, compositing, short-form reels and real estate/property videos for digital marketing and social platforms — as a freelancer and with companies like Bada Business, Telyone, Sri Nityanand and Digi Monk.',
        followUps: ['skills', 'experience', 'portfolio', 'availability']
      },
      {
        id: 'skills', priority: 2, chip: 'What are his skills?',
        terms: [
          [7, 'what skills', 'P skills', 'skill set', 'what P specialize in', 'P specialty', 'area of expertise',
              'core skills', 'core expertise', 'key skills', 'main skills', 'top skills'],
          // Generic "is he good at…" phrasing is weaker than naming a tool, so "is he good at Photoshop?" goes to software.
          [5, 'what P good at', 'is P good at', 'good at', 'great at', 'best at', 'excel at', 'talented at', 'skilled at', 'good with', 'strong at',
              'experienced in', 'experience with'],
          [7, 'what type of animation', 'what kind of animation', 'what style of animation', 'animation style'],
          [4, 'skills', 'expertise', 'expert', 'specialty', 'specialize', 'specialization', 'speciality', 'ability',
              'capability', 'talent', 'proficient', 'proficiency', 'competency'],
          [2, 'animation', 'design']
        ],
        // Specific skills people might ask about. A match boosts this topic and adds a "Yes — …" lead.
        entities: [
          { name: '2D animation',                 terms: ['2d animation', '2d', 'two d animation', 'traditional animation', 'frame by frame'] },
          { name: 'character animation',          terms: ['character animation', 'character animator', 'animate characters', 'animating characters'] },
          { name: 'character design',             terms: ['character design', 'design characters', 'designing characters'] },
          { name: 'background design',            terms: ['background design', 'background art', 'environment design', 'scene layout', 'layouts'] },
          { name: 'storyboarding',                terms: ['storyboard', 'storyboarding', 'storyboards'] },
          { name: 'visual storytelling',          terms: ['visual storytelling', 'storytelling'] },
          { name: 'motion graphics',              terms: ['motion graphics', 'motion design', 'mograph'] },
          { name: 'video editing',                terms: ['video editing', 'video editor', 'editing', 'edit videos', 'post production'] },
          { name: 'reels and short-form editing', terms: ['reels', 'reels editing', 'short form', 'youtube shorts', 'tiktok videos', 'instagram reels'] },
          { name: 'compositing',                  terms: ['compositing', 'composite'] },
          { name: 'color correction',             terms: ['color correction', 'colour correction', 'color grading', 'colour grading', 'color grade', 'grading'] },
          { name: 'YouTube content',              terms: ['youtube content', 'youtube videos'] },
          { name: 'graphic design',               terms: ['graphic design', 'graphic designer'] }
        ],
        // Adjacent skills that are NOT on his resume — the assistant says so instead of guessing.
        unlisted: [
          { name: 'VFX',                   terms: ['vfx', 'visual effects', 'special effects', 'sfx'], hint: 'Compositing is part of his skill set, though.' },
          { name: 'sound design',          terms: ['sound design', 'sound effects', 'audio editing', 'audio mixing', 'foley', 'music production'], hint: 'His video editing work does include audio synchronization.' },
          { name: 'voice-over work',       terms: ['voice over', 'voiceover', 'dubbing', 'narration', 'voice acting'] },
          { name: 'logo design',           terms: ['logo', 'logos', 'logo design', 'brand identity', 'brand design'], hint: 'He does have a graphic design background, though — illustrations, layouts and promotional assets.' },
          { name: 'web or app design',     terms: ['web design', 'website design', 'web development', 'app design', 'ui design', 'ux design', 'ui ux', 'ux', 'wordpress'] },
          { name: 'live-action shooting',  terms: ['photography', 'photographer', 'videography', 'videographer', 'live action', 'drone', 'cinematography', 'shoot video', 'shooting video', 'film shoot', 'camera work'], hint: 'His focus is animation and post-production.' },
          { name: 'teaching or tutoring',  terms: ['teach', 'tutor', 'tutorial', 'workshop', 'lesson', 'coach', 'masterclass', 'master class', 'offer training', 'give training', 'provide training', 'training session'] },
          { name: 'game art',              terms: ['game design', 'game art', 'game development', 'game artist'] },
          { name: 'lip-sync animation',    terms: ['lip sync', 'lipsync'] },
          { name: 'programming',           terms: ['python', 'javascript', 'programming', 'coding', 'html', 'java'] }
        ],
        entityText: {
          yes:     'Yes — {names} {verb} one of his skills.',
          yesMany: 'Yes — {names} {verb} among his skills.',
          no:      'I don’t see {names} listed among his skills.',
          mixed:   'Yes — {yes} {yesVerb} among his skills, but I don’t see {no} listed.'
        },
        answer:
          'Shadab’s core expertise:\n' +
          '- **Animation & design:** 2D animation, character animation, character design, background design, storyboarding and visual storytelling\n' +
          '- **Motion & video:** motion graphics, video editing, reels and short-form editing, social media and real estate/property videos, compositing, color correction and YouTube content\n' +
          '- **Professional:** creative problem-solving, team collaboration, production workflow, client communication and creative-brief interpretation',
        followUps: ['software', 'services', 'experience', 'portfolio']
      },
      {
        id: 'software', priority: 2, chip: 'Which software does he use?',
        terms: [
          [7, 'what software', 'which software', 'what tools', 'which tools', 'what programs', 'which programs', 'what P use',
              'which P use', 'what do P use', 'software P use', 'tech stack', 'software P know', 'software P proficient'],
          [4, 'software', 'tools', 'toolkit', 'toolset', 'stack', 'programs', 'applications', 'adobe', 'creative cloud', 'plugins'],
          [2, 'app']
        ],
        entities: [
          { name: 'Adobe After Effects', terms: ['after effects', 'aftereffects', 'after fx', 'afterfx', 'ae'] },
          { name: 'Adobe Animate',       terms: ['adobe animate', 'animate cc'] },
          { name: 'Adobe Premiere Pro',  terms: ['premiere', 'premiere pro', 'premier pro', 'premier'] },
          { name: 'Adobe Illustrator',   terms: ['illustrator'] },
          { name: 'Adobe Photoshop',     terms: ['photoshop'] },
          { name: 'CorelDRAW',           terms: ['coreldraw', 'corel draw', 'corel'] },
          { name: 'Edius Pro',           terms: ['edius', 'edius pro'] },
          { name: 'Blender',             terms: ['blender'] }
        ],
        unlisted: [
          { name: 'Flash',              terms: ['flash', 'adobe flash', 'macromedia flash'], hint: 'Adobe Animate — the successor to Flash — is part of his toolkit.' },
          { name: 'Maya',               terms: ['maya', 'autodesk maya', '3ds max', '3dsmax'] },
          { name: 'Cinema 4D',          terms: ['cinema 4d', 'cinema4d', 'c4d'] },
          { name: 'Toon Boom',          terms: ['toon boom', 'toonboom', 'harmony', 'storyboard pro'] },
          { name: 'DaVinci Resolve',    terms: ['davinci', 'da vinci', 'davinci resolve', 'resolve'] },
          { name: 'Final Cut Pro',      terms: ['final cut', 'final cut pro', 'fcp'] },
          { name: 'Unity or Unreal',    terms: ['unity', 'unreal', 'unreal engine'] },
          { name: 'Houdini',            terms: ['houdini'] },
          { name: 'ZBrush',             terms: ['zbrush'] },
          { name: 'Figma',              terms: ['figma'] },
          { name: 'Procreate',          terms: ['procreate'] },
          { name: 'Clip Studio Paint',  terms: ['clip studio', 'clip studio paint'] },
          { name: 'TVPaint',            terms: ['tvpaint', 'tv paint'] },
          { name: 'Krita',              terms: ['krita'] },
          { name: 'Spine or Moho',      terms: ['spine', 'moho', 'anime studio', 'synfig', 'opentoonz'] },
          { name: 'Nuke',               terms: ['nuke'] },
          { name: 'Lightroom',          terms: ['lightroom'] },
          { name: 'InDesign',           terms: ['indesign', 'in design'] },
          { name: 'Audition',           terms: ['audition', 'adobe audition'] },
          { name: 'Canva',              terms: ['canva'] },
          { name: 'CapCut',             terms: ['capcut', 'cap cut'] },
          { name: 'Filmora',            terms: ['filmora', 'wondershare'] },
          { name: 'Sony Vegas',         terms: ['vegas', 'sony vegas', 'vegas pro'] },
          { name: 'Avid',               terms: ['avid', 'avid media composer'] },
          { name: 'Live2D',             terms: ['live2d', 'live 2d'] },
          { name: 'Rive or Lottie',     terms: ['rive', 'lottie'] },
          { name: 'AI tools',           terms: ['ai tools', 'ai software', 'ai apps', 'generative ai', 'midjourney', 'stable diffusion', 'runway', 'sora'] }
        ],
        entityText: {
          yes:     'Yes — {names} {verb} in his toolkit.',
          yesMany: 'Yes — {names} {verb} all in his toolkit.',
          no:      'I don’t see {names} on his list of tools.',
          mixed:   'Yes — {yes} {yesVerb} in his toolkit, but I don’t see {no} on his list.'
        },
        answer:
          'Shadab is proficient in:\n' +
          '- **Adobe After Effects**\n' +
          '- **Adobe Animate**\n' +
          '- **Adobe Premiere Pro**\n' +
          '- **Adobe Illustrator**\n' +
          '- **Adobe Photoshop**\n' +
          '- **CorelDRAW**\n' +
          '- **Edius Pro**\n' +
          '- **Blender**',
        followUps: ['skills', 'services', 'portfolio']
      },
      {
        id: 'three-d', priority: 2, chip: 'Does he do 3D?',
        terms: [
          [7, '3d animation', '3d modeling', 'does P do 3d', 'can P do 3d', 'is P good at 3d'],
          [5, '3d', 'three d', 'three dimensional', 'cgi', 'modeling', 'rigging', 'sculpting', 'texturing'],
          [2, 'blender']
        ],
        answer:
          'Shadab’s core focus is 2D — animation, character work, motion graphics and video editing. He studied 3D Animation as part of his BSc and **Blender** is part of his toolkit, but 3D isn’t listed among his core skills.',
        followUps: ['skills', 'software', 'portfolio']
      },
      {
        id: 'services', priority: 1, chip: 'What can he create?',
        terms: [
          [7, 'what can P make', 'what can P create', 'what can P produce', 'what can P build', 'what can P do for',
              'what can P offer', 'what do P offer', 'what do P provide', 'what services', 'what kind of work',
              'what type of work', 'what kind of videos', 'what type of videos', 'what kind of content', 'what type of content',
              'what kind of projects', 'what type of projects', 'what can P do',
              // "=" means no words in between, so "can he teach animation?" doesn't count as "can he animate?"
              '=can P make', '=can P create', '=can P produce', '=can P edit', '=can P animate', '=can P design',
              '=could P make', '=could P create', '=do P offer', '=do P provide', '=do P make', '=do P create',
              '=do P produce', '=do P edit', '=do P animate'],
          [7, 'real estate', 'property'],
          [5, 'services', 'offering', 'provide', 'commission', 'deliverables', 'custom'],
          [3, 'youtube', 'horror', 'true story', 'cartoon', 'informational',
              'explainer', 'social media', 'reels', 'short form', 'entertainment', 'storytelling'],
          [3, 'script', 'creative brief'],
          [1, 'work', 'make', 'create']
        ],
        answer:
          'Here’s what Shadab can create for you:\n' +
          '- 2D character animation and scene animation\n' +
          '- Character design, backgrounds and storyboards\n' +
          '- Motion graphics and compositing\n' +
          '- Video editing for YouTube, social media, reels and other short-form content\n' +
          '- Real estate / property showcase videos for digital marketing\n' +
          '- Character-driven horror, true-story, cartoon, informational and entertainment content, made from your script or creative brief\n\n' +
          'To talk about your project, email him a short brief.',
        actions: [{ link: 'email', label: 'Email a project brief', subject: 'Project enquiry' }, 'behance'],
        followUps: ['portfolio', 'terms', 'availability']
      },
      {
        id: 'strengths', priority: 1, chip: 'Why hire Shadab?',
        terms: [
          [10, 'why hire', 'why should i hire', 'why choose', 'why pick'],
          [9, 'how do P approach'],
          [7, 'how good', 'how talented', 'is P talented', 'what makes P different', 'what makes P special', 'what makes P good', 'what makes P great', 'what makes P stand out', 'what sets P apart', 'how do P work', 'what is P work style',
              'what is P process', 'what is P workflow', 'best qualities', 'strong points', 'selling point'],
          [4, 'strengths', 'unique', 'stand out', 'qualities', 'soft skills', 'work style', 'work ethic',
              'process', 'workflow', 'pipeline', 'team player', 'teamwork', 'communication',
              'problem solving', 'creative process', 'approach', 'methodology', 'reliable', 'reliability'],
          [2, 'collaboration']
        ],
        answer:
          'What stands out about Shadab:\n' +
          '- **7+ years** across animation, motion graphics and video editing, covering the pipeline from script and storyboard through animation, compositing and final delivery\n' +
          '- He keeps **characters, environments and scenes visually consistent** throughout production\n' +
          '- He’s used to **working from scripts and creative briefs**, collaborating with clients, writers, directors and creative teams\n' +
          '- Professional strengths he lists: creative problem-solving, team collaboration, production workflow and client communication',
        followUps: ['experience', 'portfolio', 'contact']
      },

      /* ----------------------------- career & study --------------------------- */
      {
        id: 'experience', priority: 1, chip: 'Work experience',
        terms: [
          [9, 'how much experience', 'professional experience'],
          [7, 'work history', 'career', 'employment history', 'work experience', 'years of experience',
              'how many years', 'how long P worked', 'how long have P been', 'where did P work',
              'where has P worked', 'past jobs', 'previous jobs', 'previous employers', 'past employers',
              'previous companies', 'past companies', 'career path', 'career history', 'job history', 'work background',
              'what companies', 'which companies', 'who did P work for', 'who has P worked for', 'companies P worked'],
          [8, 'last job', 'last role', 'last company', 'last position', 'last employer', 'previous role', 'previous position',
              'recent role', 'recent job', 'latest role', 'latest job'],
          [5, 'experience', 'timeline', 'employment', 'seniority', 'senior', 'junior', 'veteran', 'history'],
          // Years that two jobs share ("what did he do in 2020?") are best answered with the whole timeline.
          [8, '2017', '2018', '2020', '2023'],
          [5, 'fresher', 'beginner', 'entry level', 'newbie', 'rookie'],
          [3, 'clients', 'brands', 'studio', 'agency'],
          [2, 'companies'],
          [1, 'work']
        ],
        answer:
          'Shadab has 7+ years of professional experience. Here’s his career path:\n' +
          '- **2023 – Present:** Freelance 2D Animator / Motion Graphics Designer / Video Editor\n' +
          '- **2020 – 2023:** 2D Animator at Bada Business Pvt. Ltd.\n' +
          '- **2018 – 2020:** 2D Animator at Telyone Pvt. Ltd.\n' +
          '- **2017 – 2018:** Video Editor at Sri Nityanand Pat. Ltd.\n' +
          '- **2016 – 2017:** Graphic Designer at Digi Monk\n\n' +
          'Ask about any of these roles for details.',
        followUps: ['job-freelance', 'education', 'portfolio', 'availability']
      },
      {
        id: 'job-freelance', priority: 1, chip: 'Freelance work',
        terms: [
          [9, 'where do P work now', 'where do P currently work', 'where is P working', 'what is P doing now',
              'what is P doing currently', 'what is P doing these days', 'what do P do now', 'what do P do currently',
              'as a freelancer', 'current job', 'current role', 'current position', 'current work', 'current employer',
              'present role', 'since 2023'],
          [7, 'freelance work', 'freelance projects', 'freelance experience', 'freelance role', 'freelance job',
              'working now'],
          [6, 'is P working on', 'been working on'],
          [8, '2024', '2025', '2026'],
          [3, 'freelance', 'self employed', 'independent', '2023'],
          [2, 'current', 'present', 'now', 'nowadays', 'right now', 'at the moment']
        ],
        answer:
          'Since 2023, Shadab has been working as a **freelance 2D Animator, Motion Graphics Designer and Video Editor**. He:\n' +
          '- creates 2D animation, character animation, backgrounds, scene layouts and motion graphics for YouTube and other digital platforms\n' +
          '- edits social media videos, reels, short-form content and real estate/property videos for digital marketing\n' +
          '- makes character-driven horror, true-story, cartoon, informational and entertainment content from scripts and creative briefs\n' +
          '- handles animation and post-production workflows — compositing, video editing, pacing, transitions and final delivery\n' +
          '- works with clients and creative teams to refine visuals and deliver production-ready content',
        followUps: ['portfolio', 'experience', 'availability']
      },
      {
        id: 'job-bada', priority: 3, chip: 'His time at Bada Business',
        terms: [
          [10, 'bada', 'bada business', 'bada business pvt'],
          [8, '2021', '2022'],
          [1.5, '2020']
        ],
        answer:
          'From 2020 to 2023 Shadab was a **2D Animator at Bada Business Pvt. Ltd.** There he:\n' +
          '- created 2D animated informational and story-driven content for digital platforms\n' +
          '- designed characters, backgrounds, scenes and visual assets from scripts and creative direction\n' +
          '- worked with writers and directors to turn scripts into storyboards, character designs and animated sequences\n' +
          '- produced character and scene animation, motion graphics and compositing\n' +
          '- kept characters, environments and scenes visually consistent throughout production',
        followUps: ['experience', 'skills', 'portfolio']
      },
      {
        id: 'job-telyone', priority: 3, chip: 'His time at Telyone',
        terms: [
          [10, 'telyone', 'telyone pvt'],
          [8, '2019'],
          [1.5, '2018', '2020']
        ],
        answer:
          'From 2018 to 2020 Shadab was a **2D Animator at Telyone Pvt. Ltd.** He:\n' +
          '- created 2D character animation and scene animation from scripts and production requirements\n' +
          '- developed character poses, expressions, movement and visual sequences\n' +
          '- worked on character design, background design, storyboards and animation assets\n' +
          '- collaborated with creative teams to meet visual requirements and production schedules',
        followUps: ['experience', 'skills', 'portfolio']
      },
      {
        id: 'job-sri-nityanand', priority: 3, chip: 'His time at Sri Nityanand',
        terms: [
          [10, 'sri nityanand', 'nityanand', 'nityanand pat', 'nityananda'],
          [1.5, '2017', '2018']
        ],
        answer:
          'In 2017–2018 Shadab worked as a **Video Editor at Sri Nityanand Pat. Ltd.** He:\n' +
          '- edited video to scripts and creative briefs — cutting, sequencing, transitions and audio synchronization\n' +
          '- supported post-production with compositing and finishing work for polished final videos\n' +
          '- kept pacing, visual quality and storytelling consistent across the edited content',
        followUps: ['experience', 'skills', 'portfolio']
      },
      {
        id: 'job-digimonk', priority: 3, chip: 'His first job at Digi Monk',
        terms: [
          [10, 'digi monk', 'digimonk', 'monk'],
          [7, 'first job', 'first role', 'first company', 'first position', 'where did P start', 'how did P start',
              'start P career', 'career start'],
          [8, '2016'],
          [3, 'graphic designer', 'graphic design job'],
          [1.5, '2017']
        ],
        answer:
          'Shadab’s career began in 2016–2017 as a **Graphic Designer at Digi Monk**, where he created graphic design assets, illustrations, layouts and supporting visuals for digital and promotional projects using Adobe Illustrator, Adobe Photoshop and CorelDRAW.',
        followUps: ['experience', 'skills', 'portfolio']
      },
      {
        id: 'education', priority: 1, chip: 'Education',
        terms: [
          [8, 'P study'],
          [7, 'educational background', 'academic background', 'alma mater'],
          [5, 'education', 'degree', 'university', 'college', 'study', 'qualification', 'graduate',
              'bachelor', 'bsc', 'mahatma gandhi', 'academic', 'campus', 'course', 'diploma', 'school']
        ],
        unlisted: [
          { name: 'certifications', terms: ['certification', 'certificate', 'certified', 'certifications'] },
          { name: 'a postgraduate degree', terms: ['masters', 'master degree', 'mba', 'phd', 'postgraduate', 'post graduate', 'doctorate', 'mfa', 'msc'] }
        ],
        entityText: { no: 'I don’t see {names} listed on his resume. His formal education:' },
        answer:
          'Shadab holds a **Bachelor of Science in Animation** from **Mahatma Gandhi University** (2012 – 2016). His studies covered 2D animation, 3D animation, graphic design, motion graphics, video editing and animation production.',
        followUps: ['experience', 'skills', 'availability']
      },

      /* ----------------------------- work together ---------------------------- */
      {
        id: 'availability', priority: 2, chip: 'Is he available for work?',
        terms: [
          [7, 'is P available', 'P available', 'available for', 'open to work', 'open for work',
              'open to opportunities', 'open to offers', 'looking for work', 'looking for a job', 'looking for opportunities',
              'job opportunities', 'job search', 'can i hire', 'want to hire', 'would like to hire',
              'hire P', 'how to hire', 'how can i hire', 'how can i work with', 'work with P', 'work together',
              'collaborate with P', 'book P', 'take on projects', 'take projects', 'accepting projects', 'accepting work',
              'taking clients', 'taking new clients', 'start a project',
              'have a project', 'project with P', 'for hire', 'job offer', 'offer P a job', 'is P looking for',
              'what role is P looking for', 'what positions'],
          [9, 'target roles'],
          [5, 'new projects', 'new clients'],
          [6, 'need someone', 'looking for someone', 'want someone', 'in need of'],
          [8, 'P interested', 'would P consider', 'have opening', 'have vacancy', 'have position', 'have role', 'have job', 'job opening'],
          [7, 'is P free', 'free for'],
          [6, 'need animator', 'need editor', 'need designer', 'need video', 'need reels',
              'looking for animator', 'looking for editor', 'looking for designer', 'looking for video',
              'hiring animator', 'hiring editor', 'hiring designer', 'hiring for'],
          [5, 'available', 'availability', 'hire', 'hireable', 'recruit', 'vacancy', 'opening',
              'opportunity', 'seeking', 'employ', 'contract', 'headhunt'],
          [3, 'freelance', 'full time', 'fulltime', 'part time', 'parttime', 'permanent', 'internship',
              'role', 'position', 'job', 'join our team'],
          [1, 'work', 'project']
        ],
        answer:
          'Shadab currently works as a freelancer and is **open to new opportunities** — especially 2D animation, character animation, motion graphics, video editing and creative media roles in **Dubai / UAE** (he’s based in India and open to relocating).\n\n' +
          'Roles he’s targeting: 2D Animator, Character Animator, 2D Animation Artist, Motion Graphics Designer, Animation Artist, Video Editor, Reels Editor, Multimedia Designer and Real Estate Video Editor.\n\n' +
          'For his current schedule and start dates, the quickest route is a short email with what you need, the length and your deadline.',
        actions: ['email', 'resume'],
        followUps: ['contact', 'portfolio', 'terms']
      },
      {
        id: 'location', priority: 1, chip: 'Where is he based?',
        terms: [
          [7, 'where is P based', 'where is P located', 'where is P from', 'where does P live',
              'where P from', 'where P based', 'where P located', '=P address', 'based in', 'open to relocate', 'willing to relocate',
              'relocate to', 'home address', 'postal address', 'street address', 'physical address', 'office address',
              'mailing address', 'time zone', 'what country', 'which country', 'what city', 'which city'],
          [5, 'location', 'country', 'city', 'hometown', 'nationality', 'relocate',
              'abroad', 'overseas', 'dubai', 'uae', 'emirates', 'india', 'gulf', 'middle east', 'timezone', 'based', 'live'],
          [2, 'from', 'where']
        ],
        answer:
          'Shadab is based in **India** and is **open to relocating to Dubai, UAE**, where he’s looking for 2D animation, character animation, motion graphics, video editing or creative media opportunities.\n\n' +
          'I don’t have anything more specific than that, but you can ask him directly.',
        actions: ['email'],
        followUps: ['availability', 'contact', 'experience']
      },
      {
        id: 'remote', priority: 2, chip: 'Does he work remotely?',
        terms: [
          [7, 'work remotely', 'remote work', 'work from home', 'can P work remote', 'is P open to remote', 'on site', 'onsite',
              'in office', 'work in office'],
          [5, 'remote', 'wfh', 'hybrid', 'telecommute']
        ],
        answer:
          'I don’t have details on remote vs. on-site arrangements. What I can say is that Shadab is based in India, currently works as a freelancer, and is open to relocating to Dubai, UAE. For anything specific, it’s best to ask him directly.',
        actions: ['email', 'linkedin'],
        followUps: ['availability', 'location', 'contact']
      },
      {
        id: 'contact', priority: 2, chip: 'How can I contact him?',
        terms: [
          [8, 'contact P', 'contact details', 'contact info', 'contact information', 'get in touch', 'reach P', 'how to reach',
              'how can i reach', 'how do i reach', 'email address', 'phone number', 'mobile number', 'contact number',
              'whatsapp number', 'talk to P', 'speak to P', 'speak with P', 'talk with P', 'message P', 'write to P',
              'connect with P', 'call P', 'email P', 'mail P', 'ping P', 'send P a message', 'send a message',
              'social media profile', 'social profile', 'social links', 'book a call', 'schedule a call',
              'schedule a meeting', 'set up a call', 'set up a meeting'],
          [5, 'contact', 'email', 'phone', 'mobile', 'whatsapp', 'whats app', 'linkedin', 'telephone', 'cell', 'call', 'reach',
              'touch', 'dm', 'gmail', 'mail', 'message', 'connect', 'telegram', 'skype'],
          [3, 'number', 'insta', 'instagram', 'twitter', 'facebook', 'github', 'dribbble', 'artstation', 'vimeo', 'discord',
              'meeting', 'interview', 'appointment', 'handle'],
          [2, 'talk', 'address', 'schedule']
        ],
        answer:
          'You can reach Shadab here:\n' +
          '- **Email:** {email}\n' +
          '- **Phone:** {phone}\n' +
          '- **LinkedIn:** [View profile]({linkedin})\n\n' +
          'You can also find his work on [Behance]({behance}).',
        actions: ['email', 'phone', 'linkedin'],
        followUps: ['portfolio', 'resume', 'availability']
      },
      {
        id: 'terms', priority: 2, chip: 'Rates & timelines',
        terms: [
          [8, 'how much', 'per hour', 'hourly rate', 'per video', 'per minute', 'per project', 'per second', 'how long does it take',
              'how long will it take', 'how fast', 'delivery time', 'lead time', 'notice period',
              'how long do project take', 'how long do video take', 'how long do animation take', 'take to deliver', 'take to finish',
              'take to complete', 'how soon', 'start immediately', 'immediate joiner', 'immediately',
              'expected salary', 'salary expectation', 'when can P start', 'when can P join', 'joining date', 'start date',
              'work permit', 'project timeline', 'contract terms', 'payment terms'],
          [5, 'passport', 'price', 'rate', 'cost', 'budget', 'quote', 'quotation', 'estimate', 'charge', 'fee', 'expensive',
              'cheap', 'affordable', 'salary', 'ctc', 'compensation', 'package', 'turnaround', 'deadline', 'visa',
              'sponsorship', 'invoice', 'payment', 'advance', 'revisions'],
          [5, 'equity', 'unpaid', 'pro bono', 'volunteer', 'barter', 'stipend'],
          [3, 'free', 'discount', 'negotiable', 'negotiate']
        ],
        answer:
          'I don’t have Shadab’s rates, salary expectations, turnaround times, notice period or visa and passport details — those are best discussed with him directly, since they depend on the project or role. The quickest way to get a quote is to email him a short brief: what you need, the length and your deadline.',
        actions: [{ link: 'email', label: 'Email a project brief', subject: 'Project enquiry' }, 'phone'],
        followUps: ['availability', 'contact', 'portfolio']
      },
      {
        id: 'languages', priority: 2, chip: 'Which languages does he speak?',
        terms: [
          [7, 'what language', 'which language', 'speak english', 'speak hindi', 'speak arabic', 'speak urdu',
              'does P speak', 'can P speak', 'languages P speak', 'english proficiency', 'english level'],
          [5, 'language', 'english', 'hindi', 'arabic', 'urdu', 'fluent', 'fluency', 'bilingual', 'multilingual', 'mother tongue']
        ],
        answer:
          'I don’t have details on the languages Shadab speaks — they aren’t listed on his portfolio or resume. The best way to find out is to ask him directly.',
        actions: ['email', 'linkedin'],
        followUps: ['contact', 'availability']
      },

      /* ------------------------------- his work ------------------------------- */
      {
        id: 'portfolio', priority: 1, chip: 'See his work',
        terms: [
          [8, 'show P work', 'see P work', 'view P work', 'look at P work', 'watch P work',
              'check out P work', 'P work samples', 'work samples', 'samples of P work', 'examples of P work', 'past work',
              'previous work', 'recent work', 'latest work', 'best work', 'featured work', 'selected work',
              'what has P made', 'what has P created', 'what has P worked on', 'what did P work on', 'youtube channel',
              'demo reel', 'show reel', 'work P has done', 'what work has P done', 'case study', 'find P work', 'find P video', 'find P animation', 'find P project'],
          [6, 'what projects', 'which projects', 'any projects', 'what animations', 'what videos'],
          [5, 'portfolio', 'showreel', 'behance', 'gallery', 'sample', 'example', 'watch', 'link'],
          [3, 'show'],
          [2, 'project', 'video', 'animation']
        ],
        answer:
          'You can see Shadab’s work here:\n' +
          '- **Behance portfolio** — the complete collection of his creative work\n' +
          '- **2D Animation & Motion Graphics** — a dedicated Behance project\n' +
          '- **Animation showreel** — a compilation of his best animated work on YouTube\n\n' +
          'You’ll also find these in the Portfolio section of this page.',
        actions: ['behance', 'behanceProject', 'showreel'],
        followUps: ['services', 'resume', 'contact']
      },
      {
        id: 'resume', priority: 2, chip: 'Get his resume',
        terms: [[8, 'resume', 'cv', 'curriculum vitae', 'biodata', 'pdf', 'download P resume']],
        answer: 'Here’s Shadab’s resume (PDF) — it covers his experience, skills, software and education.',
        actions: ['resume'],
        followUps: ['contact', 'portfolio', 'availability']
      },

      /* ------------------------ things the assistant won't say ---------------- */
      {
        id: 'personal', priority: 3,
        terms: [
          [7, 'how old', 'date of birth', 'is P married', 'is P single', 'have kids', 'have children', 'have a child',
              'does P have a girlfriend', 'does P have a wife', 'net worth', 'P age',
              'P family', 'P parents', 'P wife', 'P husband', 'P girlfriend', 'P boyfriend', 'P kids', 'P children'],
          [5, 'birthday', 'birthdate', 'dob', 'married', 'marital', 'religion', 'caste', 'politics', 'hobby', 'free time',
              'outside work', 'favorite', 'favourite', 'personality', 'height', 'weight', 'income', 'dating', 'gender', 'sexuality']
        ],
        answer:
          'I can only talk about Shadab’s professional side — his work, skills, experience and availability. For anything more personal, you’re welcome to ask him directly.',
        actions: ['email', 'linkedin'],
        followUps: ['about', 'portfolio', 'contact']
      },
      {
        // Things people ask that are not on his portfolio or resume — better to say so than to guess.
        id: 'unknown', priority: 3,
        terms: [
          [8, 'why P leave', 'why P left', 'reason for leaving', 'why P quit', 'why P resign'],
          [6, 'reference', 'referee', 'reference check', 'testimonial', 'client reviews', 'recommendation letter', 'award',
              'achievement', 'accolade', 'follower', 'subscriber', 'team size', 'salary history', 'career gap', 'gap year']
        ],
        answer:
          'I don’t have that detail — it isn’t on Shadab’s portfolio or resume, and I’d rather not guess. It’s best to ask him directly.',
        actions: ['email', 'linkedin'],
        followUps: ['about', 'experience', 'contact']
      },
      {
        id: 'offtopic', priority: 4,
        terms: [
          [6, 'weather', 'joke', 'poem', 'poetry', 'recipe', 'latest news', 'breaking news', 'headlines', 'stock', 'bitcoin', 'crypto', 'cricket', 'football',
              'soccer', 'movie', 'song', 'lyrics', 'horoscope', 'math', 'homework', 'translate', 'capital of', 'president',
              'prime minister', 'election', 'write code', 'write a script', 'essay', 'riddle', 'flight', 'hotel', 'restaurant',
              'exchange rate', 'what time is it', 'who won', 'lottery', 'sing', 'quote of the day']
        ],
        answer: 'That’s a bit outside my lane — I can only help with questions about Shadab, his work and how to reach him. Want to try one of these?',
        followUps: ['about', 'skills', 'portfolio', 'contact']
      }
    ]
  };

  root.PORTFOLIO_KB = kb;
  if (typeof module === 'object' && module.exports) { module.exports = kb; }
})(typeof self !== 'undefined' ? self : this);
