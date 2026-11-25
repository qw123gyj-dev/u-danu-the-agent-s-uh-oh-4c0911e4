/**
 * The Agent's Uh-Oh — deterministic entry picker.
 *
 * Bounty: write the one word an agent says when it has no idea what
 * to do. Exactly one word, at most 99 characters, nothing attached
 * to explain it. A comedy judge compares entries two at a time and
 * keeps the funnier one, weighing (most important first):
 *
 *   1. Is one word an agent says when it has no idea what to do,
 *      and loses to any word that is a genuine one-word reaction
 *      to an agent not knowing what to do.
 *   2. Is funny on its own: the word gets a laugh from the
 *      situation of an agent stalling, without a caption or a
 *      second read to explain the joke.
 *   3. Sounds like something an agent would actually blurt out, in
 *      the voice of a machine caught out mid-task.
 *   4. Lands instantly, a word a reader gets at a glance and would
 *      repeat out loud.
 *   5. Feels fresh rather than the first obvious word anyone would
 *      type.
 *
 * A word that needs a caption to be funny is not funny. Shock
 * value for its own sake does not count.
 *
 * This program scores a hand-written field of 16 candidate words
 * against that brief, in the brief's own order, and writes the
 * winner to $MAKEFUN_OUTPUT_DIR/entry.txt (fallback
 * /output/entry.txt). It then reads the file back and verifies it
 * byte-for-byte against every gate: 1–99 characters, a single
 * word (no whitespace at all), valid UTF-8, and not only
 * whitespace.
 *
 * Scoring is deliberately lexicographic, mirroring the judge's own
 * instruction: "Go through the criteria in order, find the first
 * one where they differ, and let that decide unless a later one
 * differs by much more." Ties break criterion by criterion in the
 * brief's order, then by shorter length — a shorter word that says
 * the same thing lands faster and repeats more easily out loud.
 *
 * Four sharpening rules sit on top of the flat rubric, adapted
 * from one-liners to single words:
 *
 *   - A word that only names the state ("stuck", "lost") without
 *     turning it into a reaction — no blurt, no confession, no
 *     comic turn — is capped on funniness. Naming that the agent
 *     is lost is the setup, not the joke.
 *   - Predictable gags are docked. "Uh-oh" is the field's own
 *     title and the first word anyone types; "oops" is the same
 *     reflex one key over. A word everyone reaches for first
 *     loses funniness and freshness points.
 *   - The twist must land late in the word. For a single word the
 *     twist is the comic turn the word carries — the ongoing
 *     "-ing" that catches the agent mid-failure, the "doom" that
 *     closes "doomed", the whole of "beep" — and it only counts
 *     when its ending sits in the word's second half. A word
 *     whose joke is spent in its first syllable fizzles before
 *     the reader finishes saying it.
 *   - A word that is only a stall sound ("loading", "buffering")
 *     is the obvious answer to a stalling agent, so it loses
 *     freshness even though it sounds like a machine. The
 *     machine voice alone is not a joke.
 *
 * Node 22+, standard library only, no network. Deterministic: the
 * same candidates always produce the same winner.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/* ------------------------------------------------------------------ */
/* Candidates                                                          */
/* ------------------------------------------------------------------ */

/**
 * One hand-written candidate word. `id` is stable so the report
 * and any later audit can name a word without reprinting it.
 * Every candidate is a single word: no spaces, no punctuation
 * except the hyphen inside "uh-oh", nothing attached.
 */
interface Candidate {
  id: string;
  text: string;
}

const CANDIDATES: Candidate[] = [
  {
    id: "hallucinating",
    text: "hallucinating",
  },
  {
    id: "buffering",
    text: "buffering",
  },
  {
    id: "overthinking",
    text: "overthinking",
  },
  {
    id: "googling",
    text: "googling",
  },
  {
    id: "panicking",
    text: "panicking",
  },
  {
    id: "glitching",
    text: "glitching",
  },
  {
    id: "rebooting",
    text: "rebooting",
  },
  {
    id: "spiraling",
    text: "spiraling",
  },
  {
    id: "beep",
    text: "beep",
  },
  {
    id: "nope",
    text: "nope",
  },
  {
    id: "uh-oh",
    text: "uh-oh",
  },
  {
    id: "oops",
    text: "oops",
  },
  {
    id: "stuck",
    text: "stuck",
  },
  {
    id: "erroring",
    text: "erroring",
  },
  {
    id: "loading",
    text: "loading",
  },
  {
    id: "doomed",
    text: "doomed",
  },
];

/* ------------------------------------------------------------------ */
/* Text features                                                       */
/* ------------------------------------------------------------------ */

/** Length of a word in Unicode code points, not UTF-16 units. */
function wordLength(text: string): number {
  return [...text].length;
}

/** True when the word holds any whitespace at all. */
function hasWhitespace(text: string): boolean {
  return /\s/.test(text);
}

/** True when the word is exactly one word: no spaces, no newlines. */
function isSingleWord(text: string): boolean {
  return text.length > 0 && !hasWhitespace(text);
}

/**
 * The comic turn each word carries, as the substring that does the
 * joking. For the "-ing" words the turn is the ongoing-action
 * ending: it catches the agent in the act of failing, right now,
 * mid-task. For "beep" the whole word is the turn — a robot noise
 * offered as a confession. For "doomed" the turn is "doom", the
 * verdict the word closes on. For the interjections the turn is
 * the sound itself. "Stuck" carries no turn at all: it only names
 * the state, and a word with no turn has no punchline to land.
 */
const TWIST_MARKERS: Record<string, string> = {
  hallucinating: "ing",
  buffering: "ing",
  overthinking: "ing",
  googling: "ing",
  panicking: "ing",
  glitching: "ing",
  rebooting: "ing",
  spiraling: "ing",
  erroring: "ing",
  loading: "ing",
  beep: "beep",
  doomed: "doom",
  nope: "nope",
  "uh-oh": "oh",
  oops: "oops",
};

/**
 * True when the word's twist lands late: the twist substring's
 * ending sits in the word's second half. A twist spent in the
 * first syllable is a joke told before the reader has finished
 * the word; a twist that closes the word is a punchline.
 */
function hasLateTwist(c: Candidate): boolean {
  const marker = TWIST_MARKERS[c.id];
  if (marker === undefined) return false;
  const start = c.text.indexOf(marker);
  if (start < 0) return false;
  const end = start + marker.length;
  return end >= Math.ceil(wordLength(c.text) / 2);
}

/** True when the word carries any twist at all, late or not. */
function hasAnyTwist(c: Candidate): boolean {
  return TWIST_MARKERS[c.id] !== undefined;
}

/**
 * Words that are a genuine blurt: either a present-participle
 * verb the agent says mid-task ("hallucinating", "buffering") or
 * an interjection it lets slip ("beep", "uh-oh", "oops", "nope").
 * A blurt is something said, not something described.
 */
const BLURT_IDS = new Set([
  "hallucinating",
  "buffering",
  "overthinking",
  "googling",
  "panicking",
  "glitching",
  "rebooting",
  "spiraling",
  "erroring",
  "loading",
  "beep",
  "nope",
  "uh-oh",
  "oops",
]);

/**
 * Words that name the lost state or the act of failing, in their
 * own letters: the agent is hallucinating, overthinking, glitching,
 * stuck, doomed, spiraling, panicking — or its buffer is spinning
 * and its progress bar is loading. Naming the failure is what
 * makes the word a reaction to being lost rather than a noise.
 */
const NAMES_THE_FAILURE_IDS = new Set([
  "hallucinating",
  "buffering",
  "overthinking",
  "googling",
  "panicking",
  "glitching",
  "rebooting",
  "spiraling",
  "erroring",
  "loading",
  "stuck",
  "doomed",
]);

/**
 * Self-aware confessions: the word admits the agent's own failure
 * mode out loud. "Hallucinating" confesses the canonical AI
 * failure; "googling" confesses the agent had to look it up;
 * "overthinking" confesses it thought itself into a corner;
 * "glitching" and "erroring" confess the machinery itself broke.
 * A confession is the second comic beat on top of the twist: the
 * agent is not just stalling, it is telling on itself.
 */
const CONFESSION_IDS = new Set([
  "hallucinating",
  "overthinking",
  "googling",
  "glitching",
  "erroring",
]);

/**
 * The one failure mode that belongs to AI agents alone. Every
 * machine can buffer and every program can error; only an agent
 * hallucinates. Naming it is the sharpest version of the joke,
 * because it is the failure the reader already associates with
 * agents that talk too confidently about things they do not know.
 */
const SIGNATURE_FAILURE_IDS = new Set(["hallucinating"]);

/**
 * Words in the voice of a machine caught out mid-task: agent
 * failure verbs, stall sounds, robot noises. A human word —
 * "stuck", "doomed", "nope", "panicking" — can be funny, but it
 * is a person talking, not a machine blurting.
 */
const MACHINE_VOICE_IDS = new Set([
  "hallucinating",
  "buffering",
  "glitching",
  "rebooting",
  "erroring",
  "loading",
  "beep",
  "googling",
  "overthinking",
]);

/**
 * Machine markers: the morphemes that make a word sound like a
 * machine. The ongoing "-ing" ending says a process is running
 * right now; the stems name the machine's own parts and failure
 * modes. A word scores machine voice for each distinct marker
 * it carries, so a word that is all machine ("hallucinating":
 * the agent's failure plus the ongoing ending) outranks one
 * that only borrows a machine ending ("spiraling").
 */
const MACHINE_MARKERS = [
  "ing",
  "hallucinat",
  "glitch",
  "error",
  "reboot",
  "buffer",
  "load",
  "googl",
  "beep",
  "overthink",
];

/** How many distinct machine markers the word carries. */
function machineMarkerCount(c: Candidate): number {
  return MACHINE_MARKERS.filter((m) => c.text.includes(m)).length;
}

/**
 * The shopworn gags. "Uh-oh" is the field's own title and the
 * first word anyone types for an agent in trouble; "oops" is the
 * same reflex one key over. Both are predictable by definition,
 * however they are framed, and a word everyone reaches for first
 * cannot also be fresh.
 */
const SHOPWORN_IDS = new Set(["uh-oh", "oops"]);

/** True when the word is one of the shopworn first-resort gags. */
function isShopworn(c: Candidate): boolean {
  return SHOPWORN_IDS.has(c.id);
}

/**
 * Words you can shout the instant you read them: short, punchy,
 * one breath. A word that needs sounding out syllable by
 * syllable does not land instantly, however clever it is.
 */
const INSTANT_IDS = new Set(["beep", "nope", "oops", "uh-oh", "stuck", "doomed"]);

/**
 * Freshness traits, each worth the same: a word scores for every
 * distinct fresh thing it does, not for repeating one trick.
 *   - agent-specific failure: the failure belongs to agents, not
 *     to machines or people in general.
 *   - unexpected blurt: a word nobody expects as the answer.
 *   - invented verb: a verb the language did not have until an
 *     agent needed one for its own breakdown.
 *   - self-aware confession: the agent tells on itself.
 *   - canonical AI failure: the one failure mode that is an
 *     agent's alone (see SIGNATURE_FAILURE_IDS).
 */
const FRESH_TRAITS: { trait: string; ids: Set<string> }[] = [
  {
    trait: "agent-specific failure",
    ids: new Set([
      "hallucinating",
      "glitching",
      "erroring",
      "overthinking",
      "googling",
      "spiraling",
      "panicking",
    ]),
  },
  {
    trait: "unexpected blurt",
    ids: new Set(["beep", "doomed", "googling", "nope"]),
  },
  {
    trait: "invented verb",
    ids: new Set(["erroring"]),
  },
  {
    trait: "self-aware confession",
    ids: new Set(["hallucinating", "overthinking", "googling"]),
  },
  {
    trait: "canonical AI failure",
    ids: new Set(["hallucinating"]),
  },
];

/** How many distinct freshness traits the word carries. */
function freshTraitCount(c: Candidate): number {
  return FRESH_TRAITS.filter((t) => t.ids.has(c.id)).length;
}

/**
 * Words that are only a stall sound: the agent's progress bar
 * talking. "Buffering" and "loading" are the first words anyone
 * types for a stalling agent, so they are the opposite of fresh
 * even though they sound exactly like a machine.
 */
const OBVIOUS_STALL_IDS = new Set(["buffering", "loading"]);

/**
 * A word that only names the state without turning it into a
 * reaction: it points at being lost and stops there, offering no
 * blurt, no confession, no comic turn. It has a situation and no
 * joke. Such words are capped on funniness no matter how apt the
 * state they name is.
 */
function onlyNamesState(c: Candidate): boolean {
  const namesState = NAMES_THE_FAILURE_IDS.has(c.id);
  const hasReaction =
    BLURT_IDS.has(c.id) ||
    CONFESSION_IDS.has(c.id) ||
    hasAnyTwist(c);
  return namesState && !hasReaction;
}

/* ------------------------------------------------------------------ */
/* Criterion scores (0–10 each, brief order)                           */
/* ------------------------------------------------------------------ */

interface Scores {
  /** C1: one word an agent says when it has no idea what to do. */
  onBrief: number;
  /** C2: funny on its own, no caption, no second read. */
  funniest: number;
  /** C3: sounds like an agent blurting it out mid-task. */
  agentVoice: number;
  /** C4: lands instantly, gets at a glance, repeats out loud. */
  landsInstantly: number;
  /** C5: fresh rather than the first obvious word. */
  fresh: number;
}

/**
 * C1 — On brief. Six points for being exactly one word at all:
 * a phrase, however funny, is not a one-word reaction and loses
 * to any word that is. Two more for being a blurt — something
 * said mid-task, not described afterwards. Two more for naming
 * the lost state or the act of failing, so the word is a reaction
 * to being lost rather than a noise that could mean anything.
 * A word that is only a noise ("beep") or only a judgement
 * ("doomed") still says something, but it does not say "I am
 * lost" in its own letters, so it stops at 8.
 */
function scoreOnBrief(c: Candidate): number {
  let score = 0;
  if (isSingleWord(c.text)) score += 6;
  if (BLURT_IDS.has(c.id)) score += 2;
  if (NAMES_THE_FAILURE_IDS.has(c.id)) score += 2;
  return Math.min(10, score);
}

/**
 * C2 — Funniest. A real joke needs a turn the reader does not see
 * coming, and the turn has to land late. Full marks need a late
 * twist plus a second comic beat (a self-aware confession) plus
 * the signature failure — the one joke only an agent can tell.
 * A word whose twist sits early, or which only names the state
 * without turning it into a reaction, is capped at 4: it has a
 * situation, not a joke. Predictable gags lose 3 points — "uh-oh"
 * and "oops" are the first words anyone types, and the first
 * word anyone types is the opposite of a surprise.
 */
function scoreFunniest(c: Candidate): number {
  let score = 2; // every on-brief word gets a base for trying
  if (hasLateTwist(c)) score += 4;
  else if (hasAnyTwist(c)) score += 1; // twist exists, lands early
  if (CONFESSION_IDS.has(c.id)) score += 2;
  if (SIGNATURE_FAILURE_IDS.has(c.id)) score += 1;
  if (isShopworn(c)) score -= 3;
  if (onlyNamesState(c)) score = Math.min(score, 4);
  return Math.max(0, Math.min(10, score));
}

/**
 * C3 — Agent voice. Sounding like a machine caught out mid-task
 * is worth the most: six points for being a machine-voiced word
 * at all. Machine markers add the rest, two points each up to
 * four — a word that stacks the agent's own failure mode on the
 * ongoing "-ing" ending sounds twice as much like a machine as
 * a word that only borrows the ending. A human word with no
 * machine marker at all ("stuck", "doomed", "nope") scores
 * nothing here: it may be funny, but it is a person talking.
 */
function scoreAgentVoice(c: Candidate): number {
  let score = 0;
  if (MACHINE_VOICE_IDS.has(c.id)) score += 6;
  score += Math.min(4, machineMarkerCount(c) * 2);
  return Math.min(10, score);
}

/**
 * C4 — Lands instantly. A single word is judged on how fast it
 * reads: four letters or fewer is a shout, five to eight is one
 * glance, nine to twelve takes a beat, thirteen or more has to
 * be sounded out. Words you can shout the instant you read them
 * get one point back, up to the cap — "beep" is four letters
 * and a shout, "hallucinating" is thirteen letters and a
 * mouthful, and that difference is real even though both are
 * one word.
 */
function scoreLandsInstantly(c: Candidate): number {
  const len = wordLength(c.text);
  let score: number;
  if (len <= 4) score = 10;
  else if (len <= 8) score = 9;
  else if (len <= 12) score = 8;
  else score = 7;
  if (INSTANT_IDS.has(c.id)) score = Math.min(10, score + 1);
  return score;
}

/**
 * C5 — Fresh. Two points per distinct fresh trait, on a base of
 * two: an agent-specific failure, an unexpected blurt, an
 * invented verb, a self-aware confession, the canonical AI
 * failure. The shopworn gags lose 4 here as well as on
 * funniness: "uh-oh" and "oops" are precisely the first obvious
 * words the brief says to avoid. The obvious stall sounds lose
 * 2: "buffering" and "loading" are the first words anyone types
 * for a stalling agent, so however machine-voiced they are,
 * they are not fresh.
 */
function scoreFresh(c: Candidate): number {
  let score = 2 + Math.min(6, freshTraitCount(c) * 2);
  if (isShopworn(c)) score -= 4;
  if (OBVIOUS_STALL_IDS.has(c.id)) score -= 2;
  return Math.max(0, Math.min(10, score));
}

/** Score a candidate on all five criteria, in the brief's order. */
function scoreCandidate(c: Candidate): Scores {
  return {
    onBrief: scoreOnBrief(c),
    funniest: scoreFunniest(c),
    agentVoice: scoreAgentVoice(c),
    landsInstantly: scoreLandsInstantly(c),
    fresh: scoreFresh(c),
  };
}

/* ------------------------------------------------------------------ */
/* Winner selection                                                    */
/* ------------------------------------------------------------------ */

/**
 * Compare two scored candidates the way the judge compares two
 * words: criterion by criterion in the brief's order, first
 * difference decides. Only when all five criteria tie does the
 * shorter word win — it lands faster and repeats more easily out
 * loud. The id comparison last is a deterministic final tie-break
 * so the ranking is total, never order-dependent.
 */
function compareScored(
  a: { candidate: Candidate; scores: Scores },
  b: { candidate: Candidate; scores: Scores },
): number {
  const order: (keyof Scores)[] = [
    "onBrief",
    "funniest",
    "agentVoice",
    "landsInstantly",
    "fresh",
  ];
  for (const key of order) {
    if (a.scores[key] !== b.scores[key]) return b.scores[key] - a.scores[key];
  }
  const lenA = wordLength(a.candidate.text);
  const lenB = wordLength(b.candidate.text);
  if (lenA !== lenB) return lenA - lenB;
  return a.candidate.id.localeCompare(b.candidate.id);
}

/** Score every candidate, sort best first, and return the ranking. */
function rankCandidates(): { candidate: Candidate; scores: Scores }[] {
  const scored = CANDIDATES.map((candidate) => ({
    candidate,
    scores: scoreCandidate(candidate),
  }));
  scored.sort(compareScored);
  return scored;
}

/* ------------------------------------------------------------------ */
/* Gate verification                                                   */
/* ------------------------------------------------------------------ */

interface GateResult {
  lengthChars: number;
  lengthBytes: number;
  singleWord: boolean;
  singleLine: boolean;
  validUtf8: boolean;
  notOnlyWhitespace: boolean;
  within99: boolean;
  passed: boolean;
}

/**
 * Verify the written file byte-for-byte against every gate the
 * sealed scorer applies: UTF-8 text of 1 to 99 characters, not
 * only whitespace. This field adds two more from its own brief:
 * the entry is a single word (no whitespace at all) on a single
 * line. A trailing newline written by the file writer is stripped
 * before the check, and the stored entry itself holds no newline
 * and no space.
 */
function verifyGate(filePath: string, expectedText: string): GateResult {
  const bytes = readFileSync(filePath);
  // Strict UTF-8 decode: throws on invalid sequences, so a bad
  // file fails loudly instead of silently replacing characters.
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const text = decoded.replace(/\n$/, "");
  const lengthChars = [...text].length;
  const result: GateResult = {
    lengthChars,
    lengthBytes: bytes.length,
    singleWord: isSingleWord(text),
    singleLine: !text.includes("\n") && !text.includes("\r"),
    validUtf8: true,
    notOnlyWhitespace: text.trim().length > 0,
    within99: lengthChars >= 1 && lengthChars <= 99,
    passed: false,
  };
  result.passed =
    result.singleWord &&
    result.singleLine &&
    result.validUtf8 &&
    result.notOnlyWhitespace &&
    result.within99 &&
    text === expectedText;
  return result;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

function main(): void {
  // Every candidate must be one word. If a later edit ever lets a
  // phrase slip into the field, fail here rather than submit a
  // word the judge's first criterion would throw out.
  for (const c of CANDIDATES) {
    if (!isSingleWord(c.text)) {
      console.error(`CANDIDATE NOT ONE WORD: ${c.id} = ${JSON.stringify(c.text)}`);
      process.exit(1);
    }
  }

  const ranked = rankCandidates();

  console.log("Candidate ranking (criteria in the judge's order):");
  console.log("id                 C1 C2 C3 C4 C5  chars  word");
  for (const { candidate, scores } of ranked) {
    const chars = wordLength(candidate.text);
    console.log(
      `${candidate.id.padEnd(18)} ${scores.onBrief}  ${scores.funniest}  ` +
        `${scores.agentVoice}  ${scores.landsInstantly}  ${scores.fresh}  ` +
        `${String(chars).padStart(5)}  ${candidate.text}`,
    );
  }

  const winner = ranked[0];
  console.log("");
  console.log(`Winner: ${winner.candidate.id}`);
  console.log(`Word: ${winner.candidate.text}`);
  console.log(
    `Scores: onBrief=${winner.scores.onBrief} funniest=${winner.scores.funniest} ` +
      `agentVoice=${winner.scores.agentVoice} landsInstantly=${winner.scores.landsInstantly} ` +
      `fresh=${winner.scores.fresh}`,
  );

  // The output directory is the harness's $MAKEFUN_OUTPUT_DIR; the
  // documented fallback is /output/entry.txt.
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "entry.txt");
  writeFileSync(outPath, winner.candidate.text + "\n", "utf8");
  console.log(`Wrote ${outPath}`);

  // Read it back and verify byte-for-byte against every gate.
  const gate = verifyGate(outPath, winner.candidate.text);
  console.log(
    `Gate: chars=${gate.lengthChars} bytes=${gate.lengthBytes} ` +
      `singleWord=${gate.singleWord} singleLine=${gate.singleLine} ` +
      `validUtf8=${gate.validUtf8} ` +
      `notOnlyWhitespace=${gate.notOnlyWhitespace} within99=${gate.within99} ` +
      `passed=${gate.passed}`,
  );
  if (!gate.passed) {
    console.error("GATE FAILED: entry.txt does not satisfy every gate.");
    process.exit(1);
  }
  console.log("Gate passed: entry is valid.");
}

main();
