/**
 * TypeScript port of SudokuPad 0.612.0 RulesParser.
 * This is semantic/checker inference only; rendering never depends on it.
 */

function normalizeRules(rules: unknown = ""): string {
  return (Array.isArray(rules) ? rules.join("\n") : String(rules ?? ""))
    .replace(/\s*[.]*\s*([\n]\s*)+([-*]+\s*)*/gm, ". ")
    .replace(/ +/gm, " ")
    .replace(/:\./gm, ":")
    .replace(/^\s*[-*]*\s*|\s*$/g, "");
}

const reRuleEnd = "(?:[.]|$| - )";

function makeRuleTesterFromParts(parts: string[]): (rules: unknown) => string | undefined {
  const regexes = parts.map((part) => new RegExp(`(${part})${reRuleEnd}`, "im"));
  regexes.sort((a, b) => a.toString().length - b.toString().length);
  return (rules: unknown) => {
    const normalized = normalizeRules(rules);
    for (const re of regexes) {
      const match = normalized.match(re);
      if (match) return match[1];
    }
    return undefined;
  };
}

const reCan = "(?:may|must|can)";
const reCannot = `(?:(?:(?:${reCan}) ?)not|can't)`;
const reShortRule = "(?:normal sudoku|killer cages?|little killers?|odds?|evens?)";
const reValue = "(?:the )?(?:clue|digit|value|number|cell|square|total)s?";
const reCells = `(?:the )?(?:(?:(?:any|no) )?two )?(?:(?:identical|neighboring|adjacent|pairs of) )?(?:${reValue}s|those)(?: in (?:(?:adjacent|a) )?cells?)?`;
const reSeeValue = `see (the same ${reValue}|each other)`;
const reSeparated = `(?:which )?(?:always )?(?:sep[ae]rated|connected|joined|that share an edge|marked|${reSeeValue})(?:\\.? (?:by|with))?`;
const reThatAre = "(?:that are|a|within)";
const reNormal = "(?:standard|normal|regular|usual)";
const reDifferent = "(?:be )?different";
const reContain = `(?:(?:contain|have|be) the same ${reValue}|repeat)`;
const reMustBeDifferent = `(?:${reCan} ${reDifferent}|${reCannot} ${reContain})`;

const reCannotAppear = `${reCannot} (?:be(?: either)?|appear|repeat|${reSeeValue})(?: (?:${reThatAre}|in (?:any )?cells))?`;
const reAnti = `(?:(?:(?:${reNormal} )?anti-?)|(?:\\W))`;
const reConstraint = " ?(?:rules?|constraint)?(?: appl(y|ies))?";
const reInChess = "\\(?:in chess\\)?";
const reApart = `(?:apart|away|((apart|away) )?(?:of|from) each other|\\(touching each other diagonally\\))(?: ${reInChess})?`;
const reChess = `(?:.+? or )?(?:${reThatAre} )?(?:a )?(?:[(]?chess[)]? )?`;
const reSMove = `(?:'?s)?(?:[- ]move)?(?: or [^.]+?)?(?: ${reInChess})?`;
const reKingCannotTouch = "[(]i[.]e[.] cannot touch diagonally[)]";
const reChessShortRule = (move: string) => `${reAnti}${reChess}${move}${reSMove}(?: and [^.:]+ )?${reConstraint}`;
const antiChessParts = (move: string) => [
  `${reChessShortRule(move)}: ${reCells} ${reSeparated} ${reChess}${move}${reSMove} ${reCan} ${reContain}`,
  `${reChessShortRule(move)}: ${reCells} ${reSeparated} ${reChess}${move}${reSMove} ${reMustBeDifferent}`,
  `${reChessShortRule(move)}: ${reCells} ${reThatAre} ${reChess}${move}${reSMove} ${reApart} ${reMustBeDifferent}`,
  `${reCells} ${reCannotAppear} ${reChess}${move}${reSMove} ${reApart}(?: ${reKingCannotTouch})?`,
  `${reCells} ${reCannotAppear} ${reChess}${move}${reSMove} ${reApart}`,
  `${reCells} ${reSeparated} ${reChess}${move}${reSMove} ${reCannot} ${reContain}`,
  `${reCells} ${reThatAre} ${reChess}${move}${reSMove} ${reApart} ${reCannot} ${reContain}`,
];

const hasAntiKnight = makeRuleTesterFromParts(antiChessParts("knight"));
const hasAntiKing = makeRuleTesterFromParts(antiChessParts("king"));

const reGiven = "(?:small|given|provided)";
const reOptional = `\\(if ${reGiven}\\)`;
const reKillerCage = "(?:(?:a|the|each) )?(?:killer )?cages?";
const reDigitsInCage = `(?:${reValue} in ${reKillerCage}|in ${reKillerCage}, ${reValue})`;
const reMustSum = "(?:and )?(?:must )?sum";
const reGivenValue = `to the (?:${reGiven} )?${reValue}`;
const reIndicated = `(?:written|indicated)(?: ${reOptional})?`;
const reCageCorner = `(?:(?:written|indicated)? )?in the top left(?: corner)?(?: of the cage)?(?: ${reOptional})?`;
const reNoRepeat = `${reCannot} repeat`;
const reInCage = `(?:in|within) ${reKillerCage}`;
const reNoRepeatInCage = `(?:(?:\\. )?${reValue}|, and) ${reNoRepeat} ${reInCage}`;
const hasKillerCage = makeRuleTesterFromParts([
  `${reShortRule}, ${reKillerCage}|${reKillerCage}, ${reShortRule}(?:, [^,]+)*`,
  `${reDigitsInCage} ${reMustSum} ${reGivenValue} ${reGiven}`,
  `(?:${reNoRepeatInCage}\\. )?${reDigitsInCage} ${reMustSum} ${reGivenValue} ${reCageCorner}(?:${reNoRepeatInCage})?`,
  `${reDigitsInCage} ${reNoRepeat},? and ${reMustSum} ${reGivenValue}(?: (?:${reIndicated}|${reCageCorner}))?`,
  `${reNoRepeatInCage}(?:, which show their sums?)?`,
]);

const reSeparated2 = "(?:always )?(?:sep[ae]rated|connected|joined)(\\.? (?:by|with))?";
const reStandardXV = "(?:(?:standard|normal) )?(?:V|X|XV|X\\/V|XVXV)(?: pairs)?(?: rules apply)?";
const reAnThe = "(?:(?:an?|the|each) )?";
const reXV = `${reAnThe}["']*(?:V|X|XV)(?:'?s)?["']*`;
const reXVList = `${reXV}(?: (?:or|and) ${reXV})+`;
const reXVOrList = `(?:${reXV}|${reXVList})`;
const re510 = `${reAnThe}(?:5|10|15|five|ten|fifteen)`;
const reXVSumToA = `${reXVOrList} (?:must )?(?:(?:contain|sep[ae]rates|joins?) (?:a pair of )?digits (?:(?:that|which) )?)?(?:sum(?:ming)?|add) to ${reXVOrList}(?:,? respectively)?`;
const reXVSumToB = `${reCells} that sum to ${re510} are ${reSeparated2} ${reXV}`;
const reXVSumTo = `(${reXVSumToA}|${reXVSumToB})`;
const reXVSumToList = `${reXVSumTo}(?:(?: (?:and|or) (?:by )?|[;,.] )${reXVSumTo})*(?:[;,.]\\s*)??`;
const reXVNoNeg = `\\(?(?:Not (?:all|every) (?:such )?(?:possibles? )?${reXVOrList} (?:are|is) (?:necessarily )?(?:given|shown)|(?:there is )?(?:no )?negative constraints?(?: do not apply)?)\\)?`;
const reXVNeg = `All possible ${reXVOrList} are given`;
const hasXV = makeRuleTesterFromParts([
  "Cells separated by X must sum to 10\\. Not all Xs are necessarily given",
  `${reStandardXV} ${reXVNoNeg}`,
  `${reXVSumToList} ${reXVNoNeg}`,
  `${reXVSumToList}`,
  "Standard rules apply for each variant",
  `${reXV} joins are pair of digits which sum to 10\\. ${reXVNeg}`,
  `${reCells} with ${reXV} between them sum to ${re510}`,
  `${reStandardXV}: An X between cells means they sum to 10, and a V between cells means they sum to 5\\. Not all Xs and Vs are necessarily given`,
  "Along a clued diagonal, all contiguous pairs of digits that sum to 5 \\(V\\) or 10 \\(X\\) are indicated, in the order that they appear",
  `An X separates ${reCells} that add up to 10, a V separates ${reCells} that add up to 5\\. A white dot separates ${reCells} that are consecutive\\. Not all X,V and white dots are necessarily given`,
  "An X indicates that the digits must sum to 10 \\(no negative constraint\\)",
]);

export const sudokuPadRulesParser = {
  normalizeRules,
  hasAntiKnight,
  hasAntiKing,
  hasKillerCage,
  hasXV,
};
