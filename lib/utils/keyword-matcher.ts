/**
 * Keyword Matcher
 *
 * Matches comment text against a set of keywords with support for:
 * - Case-insensitive matching
 * - Whole-word or partial matching, with typo/plural tolerance in
 *   whole-word mode (see fuzzyWholeWordMatch)
 * - Multi-keyword OR logic (any match = true)
 * - Emoji and special character stripping
 */

export interface KeywordMatchResult {
  matched: boolean;
  matchedKeyword: string | null;
}

// Below this length, edit-distance tolerance does more harm than good — a
// 4-letter keyword like "link" has too many unrelated real words one typo
// away ("pink", "wink", "sink"), so short keywords stay exact-match only.
const MIN_FUZZY_KEYWORD_LENGTH = 5;

function typoTolerance(keywordLength: number): number {
  if (keywordLength < MIN_FUZZY_KEYWORD_LENGTH) return 0;
  return keywordLength <= 8 ? 1 : 2;
}

// Classic edit-distance DP, single row of state reused per pass — comment
// text and keywords are always short (a few words), so this never needs to
// be fast, just correct.
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prevRow = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const currRow = [i];
    for (let j = 1; j <= n; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow.push(
        Math.min(
          currRow[j - 1] + 1, // insertion
          prevRow[j] + 1, // deletion
          prevRow[j - 1] + substitutionCost // substitution
        )
      );
    }
    prevRow = currRow;
  }
  return prevRow[n];
}

// Deliberately not a real stemmer — just the two English plural patterns
// common in business/campaign keywords ("prices", "categories", "accounts").
// Words of 4 letters or fewer are returned untouched so short words never
// get mangled, and doubled-s endings ("discuss", "boss") are left alone so
// they aren't misread as a plural. Known miss: -es plurals after a
// sibilant ("boxes" -> "boxe" not "box") — accepted, since those are rare
// among the nouns agencies actually use as trigger keywords.
function lightStem(word: string): string {
  if (word.length <= 4) return word;
  if (word.endsWith("ies") && word.length > 5) return word.slice(0, -3) + "y";
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 4) {
    return word.slice(0, -1);
  }
  return word;
}

// Whole-word mode's fallback when the exact \b...\b regex doesn't hit:
// catches typos (edit distance, gated to keywords long enough that it
// won't false-positive on unrelated short words) and simple plurals
// (via lightStem). Multi-word keywords ("more info") skip this entirely —
// phrase-level fuzzy matching is a different, harder problem and the exact
// regex already handles phrases fine. The leading-character check is a
// cheap extra guard: real-world typos overwhelmingly preserve the first
// letter, so requiring it filters out most coincidental same-length,
// same-distance real words before the more expensive Levenshtein call.
function fuzzyWholeWordMatch(cleanedText: string, cleanedKeyword: string): boolean {
  if (cleanedKeyword.includes(" ") || cleanedKeyword.length < 3) return false;

  // Plural stemming and typo-distance are independent checks with their own
  // minimum lengths — a keyword too short for typo tolerance ("sale") can
  // still get plural matching ("sales"), which needs a much lower bar.
  const keywordStem = lightStem(cleanedKeyword);
  const tolerance = typoTolerance(cleanedKeyword.length);

  for (const word of cleanedText.split(" ")) {
    if (!word || word[0] !== cleanedKeyword[0]) continue;

    if (lightStem(word) === keywordStem) return true;

    if (tolerance === 0) continue;
    if (Math.abs(word.length - cleanedKeyword.length) > tolerance) continue;
    if (levenshteinDistance(word, cleanedKeyword) <= tolerance) return true;
  }

  return false;
}

/**
 * Strip emojis and special characters from text, keeping only
 * alphanumeric characters and whitespace.
 */
export function stripSpecialCharacters(text: string): string {
  // Remove emoji ranges and other special unicode chars
  return text
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu,
      ""
    )
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if a comment text matches any of the given keywords.
 *
 * @param commentText - The raw comment text to check
 * @param keywords - Array of keywords to match against
 * @param wholeWordMatch - If true, keyword must be a standalone word.
 *                         If false, partial matches are allowed (e.g. "linking" matches "link")
 * @returns Match result with the first matched keyword (if any)
 */
export function matchKeywords(
  commentText: string,
  keywords: string[],
  wholeWordMatch: boolean = true
): KeywordMatchResult {
  if (!commentText || keywords.length === 0) {
    return { matched: false, matchedKeyword: null };
  }

  const cleanedText = stripSpecialCharacters(commentText).toLowerCase();

  if (!cleanedText) {
    return { matched: false, matchedKeyword: null };
  }

  for (const keyword of keywords) {
    const cleanedKeyword = stripSpecialCharacters(keyword).toLowerCase();

    if (!cleanedKeyword) continue;

    if (wholeWordMatch) {
      // Build a regex for whole-word matching
      const escapedKeyword = cleanedKeyword.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );
      const regex = new RegExp(`\\b${escapedKeyword}\\b`, "i");
      if (
        regex.test(cleanedText) ||
        fuzzyWholeWordMatch(cleanedText, cleanedKeyword)
      ) {
        return { matched: true, matchedKeyword: keyword };
      }
    } else {
      // Partial match — keyword substring exists anywhere in the cleaned text
      if (cleanedText.includes(cleanedKeyword)) {
        return { matched: true, matchedKeyword: keyword };
      }
    }
  }

  return { matched: false, matchedKeyword: null };
}
