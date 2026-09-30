# Shadab's Assistant

A small chat assistant for the portfolio. Visitors click **Ask about Shadab** (bottom-right of the page) and can ask about Shadab's work, skills, experience, education, availability and how to reach him. It answers **on his behalf**, clearly labelled as an automated assistant, using only what is written in `knowledge.js`.

## What it does — and what it deliberately doesn't

- **Runs entirely in the visitor's browser.** No server, no API key, no AI service, no running cost. It works on any static host and even when `index.html` is opened straight from disk.
- **Only says what's in `knowledge.js`**, which is taken from the website and `Resume.pdf`. It cannot invent facts about Shadab.
- **Says so when it doesn't know.** Rates, salary, notice period, age, languages spoken, awards, references, testimonials, follower counts… none of these are on the site or resume, so it replies "I don't have that detail" and offers buttons to email, call or message him on LinkedIn.
- **Nothing typed into the chat is stored or sent anywhere.** The one exception is the visitor's own choice: "Send this question to Shadab" opens *their* email app with the question pre-filled. Nothing is sent until they press send there.
- **Talks about Shadab in the third person** ("Shadab is proficient in…") and never claims to be him.
- **Shares only contact details that are already on the site**, plus a link to `Resume.pdf`. Note that the website itself doesn't link the resume — the assistant does, so the PDF is now easy to find.

## Files

| File | What it is |
| --- | --- |
| `knowledge.js` | Everything the assistant knows and says. **This is the file you edit.** |
| `engine.js` | The matching logic: turns a question into the best topic. No page code in it. |
| `widget.js`, `widget.css` | The chat window (button, panel, typing, suggestion buttons). |
| `engine.test.js` | Automated tests. |
| `question-bank.js` | ~210 realistic questions, each with the topic it should reach. Used by the tests. |

`index.html` loads the assistant with one stylesheet link and three script tags (order matters: `knowledge.js`, `engine.js`, `widget.js`). **To remove the assistant**, delete those four lines and the `chatbot/` folder — nothing else on the site depends on it.

## Everyday edits

### Change what it says
Open `knowledge.js`, find the topic (each has an `id` such as `skills`, `availability`, `contact`) and edit its `answer`.

- `**bold**`, `[link text](https://…)` and lines starting with `- ` (bullets) are supported; a blank line starts a new paragraph.
- `{email}`, `{phone}`, `{linkedin}`… are replaced with the values in `vars`.
- `answer` can also be a list of alternatives; one is picked at random.

### Change contact details or links
Edit `vars` near the top of `knowledge.js` (and `links` for the button labels). Answers and buttons pick the change up everywhere. The tests compare them with `index.html`, so a typo or an out-of-date number is caught.

### The site changed (new job, new skill, new software)
Update the matching answer in `knowledge.js`, then run the tests. They read `index.html` and fail with a message such as `software answer is missing "Blender"` until the assistant knows about the change.

### Add a topic
Add an object to `topics`:

```js
{
  id: 'awards', priority: 1, chip: 'Awards',            // chip = label of the suggestion button (leave out for no button)
  terms: [
    [8, 'P awards', 'won any award'],                   // [weight, 'phrase', 'phrase', …]
    [4, 'award', 'prize']
  ],
  answer: 'Shadab has … ([see his resume]({resume})).',
  actions: ['resume', { link: 'email', label: 'Ask him directly', subject: 'Question for Shadab' }],   // buttons
  followUps: ['experience', 'contact']                  // suggestion buttons to show next (topic ids)
}
```

Then run `node --test`. The tests check that every topic is well-formed and answerable.

If the new topic replaces an "I don't have that" answer (as awards would), also remove its words (`award`, `achievement`…) from the `unknown` topic so the two don't compete.

### Make it understand another way of asking
Add words or phrases to the topic's `terms`. The header of `knowledge.js` explains the phrase syntax in full: `P` for "he/you", and the `$`, `^` and `=` markers for phrases that must end the question, start it, or keep their words together.

## A question got the wrong answer

1. Add a line to `question-bank.js`: `["what the visitor typed", 'topic-id'],`
2. Run `node --test` — it fails, which proves the bank line catches the problem.
3. Adjust `terms` in `knowledge.js` until everything passes again.

The bank is what stops an old fix from silently breaking when new terms are added. Use `'fallback'` for questions that should get "I don't know", or a list of ids when more than one answer is acceptable.

## How a question is answered

`text → lower-case, strip punctuation, reduce words to their stems → score every topic → reply`

| Best score | What the visitor gets |
| --- | --- |
| 3 or more | The answer for that topic, plus buttons and follow-up suggestions. |
| 1 to under 3 | "I'm not quite sure… did you mean one of these?" with up to 3 suggestion buttons. |
| under 1 | "That one's beyond what I know" plus a **Send this question to Shadab** email button. |

Matching details worth knowing:

- Words are matched by stem, so `edit`, `editing` and `editor` are the same word. Small typos are forgiven (`experiance`, `portfollio`), but a word that is a known keyword is never treated as a typo of another (`contact` ≠ `contract`).
- A topic's score is the sum of the weights of its matched terms. Weights used in `knowledge.js`: 10–12 very specific ("why hire", company names), 7–9 clear intents, 5–6 strong keywords, 2–4 weak keywords that only help alongside others.
- Naming a specific skill or program ("does he use Photoshop?") adds weight and gives a direct "Yes — …" or "I don't see … listed" answer.
- Small talk (hi, thanks, bye) gives way to a real question in the same message ("thanks! and where did he study?").
- `priority` only matters when two topics tie exactly; the higher number wins.
- Each question is answered on its own. The assistant doesn't follow pronouns across messages ("and where did he learn *that*?"), which is why every answer offers suggestion buttons.
- English only.

## Tests

No install needed — just Node 20 or newer, from the repository root:

```
node --test
```

(`node --test chatbot/engine.test.js` also works. Don't use `node --test chatbot/` — Node 22 treats the folder as a file and fails.)

They take about a second and cover: the knowledge base is well-formed (no duplicate phrases, every answer has no stray `{placeholders}`); contact details, links, jobs, dates, education and the skill/software/role tags match `index.html`; `Resume.pdf` exists; about 330 routing examples, typos and greetings; all ~210 questions in `question-bank.js`; honest "I don't have that" answers for things not in his materials; off-topic and hostile input; and speed.

## The chat window

- **Keyboard and screen readers:** the button is a real button, `Esc` closes the chat and returns focus to where it was, the conversation is an `aria-live` log, and on phones (full-screen) Tab stays inside the chat.
- **Phones:** the chat goes full-screen, follows the on-screen keyboard, keeps the page from scrolling behind it, and uses 16px text in the input so iOS doesn't zoom. The button shrinks to an icon, and the footer gets extra bottom padding (on screens ≤ 900px wide) so the button never sits on top of the contact buttons or copyright line.
- **Short windows** (phone held sideways): suggestions become a single scrolling row.
- **Reduced motion:** with "reduce motion" switched on in the visitor's system, pulses, slides and the typing animation are turned off. The chat is hidden when printing.
- **The site's custom cursor:** the chat mirrors its hover ring on its own buttons, and the normal cursor returns at ≤ 768px exactly as it does on the rest of the site.
- **Security:** visitor text and answers are added to the page as plain text, never as HTML. Links in answers are limited to `http(s)`, `mailto:`, `tel:` and files on this site.
- **Colours and fonts** come from the variables in `style.css` (`--accent-color`, `--glass-border`, `--font-heading`…); the rest lives in `widget.css`, where every class starts with `sb-`.

Two small hooks, in case you want them elsewhere on the page:

```html
<a href="#" data-open-assistant>Ask my assistant</a>      <!-- any element with this attribute opens the chat -->
<script>ShadabAssistant.ask('what are his skills?')</script>   <!-- or from code: open(), close(), ask(text) -->
```

## Limits to be aware of

- It's a rule-based matcher, not an AI: it recognises the ways people are likely to ask, not every possible phrasing. On two batches of about 100 fresh questions that hadn't been used for tuning, it got 82% and 91% right on the first try; the misses were then fixed and added to `question-bank.js`. Expect the occasional miss on new phrasing — it then asks "did you mean…?" or offers to forward the question, rather than guessing. Keep adding misses to the bank.
- Its knowledge ends where the site and resume end. If you want it to answer more (rates, availability dates, languages), write that into `knowledge.js` deliberately — it will never volunteer anything you haven't.
