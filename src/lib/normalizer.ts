export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const SENTENCE_ENDERS = /[.;:?!]$/;
const UPPERCASE_START = /^[A-ZÁÀÃÂÉÊÍÓÔÕÚÇ]/;
const SOFT_HYPHEN = /-\n/g;
// A line that ends mid-sentence: last char is a letter (not digit, not punctuation)
const ENDS_MID_WORD = /[a-záàãâéêíóôõúç]$/iu;
// A line ending with a comma also continues mid-sentence (list item or clause)
const ENDS_WITH_COMMA = /,$/;

export function normalizeText(raw: string): string {
  // 1. Normalise line endings
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2. Trim each line
  const lines = text.split("\n").map((l) => l.trim());

  // 3. Collapse multiple blank lines into one
  const collapsed: string[] = [];
  let blankCount = 0;
  for (const line of lines) {
    if (line === "") {
      blankCount++;
      if (blankCount === 1) collapsed.push("");
    } else {
      blankCount = 0;
      collapsed.push(line);
    }
  }

  // 4. Fix soft hyphenation before join pass
  text = collapsed.join("\n").replace(SOFT_HYPHEN, "");

  // 5. Re-split and join mid-sentence breaks
  // A break is mid-sentence when:
  //   - current line ends with a letter (truly mid-word) or with a comma (mid-clause)
  //   - next line starts with a lowercase letter
  //   - current line does not end with hard sentence-ending punctuation (.;:?!)
  const parts = text.split("\n");
  const result: string[] = [];
  let i = 0;
  while (i < parts.length) {
    let current = parts[i];

    if (current === "") {
      result.push(current);
      i++;
      continue;
    }

    // Greedily join as long as the break looks mid-sentence
    while (i + 1 < parts.length) {
      const next = parts[i + 1];
      const canJoin =
        next !== "" &&
        (ENDS_MID_WORD.test(current) || ENDS_WITH_COMMA.test(current)) &&
        !SENTENCE_ENDERS.test(current) &&
        !UPPERCASE_START.test(next);

      if (canJoin) {
        current = current + " " + next;
        i++;
      } else {
        break;
      }
    }

    result.push(current);
    i++;
  }

  return result.join("\n").trim();
}
