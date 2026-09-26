import type { PuzzleDefinition } from "../../core/model";
import { recognizeSudokuPadRenderFeatures } from "../normalize/features";

export function puzzleSolution(def: PuzzleDefinition): string | undefined {
  return def.meta.solutionOverride ?? def.logic?.solution;
}

export function puzzleConstraintLabels(def: PuzzleDefinition): string[] {
  const out = new Set<string>(def.meta.archiveConstraints ?? def.meta.constraints ?? []);
  const logic = def.logic;
  const scene = def.scene;
  if (logic?.antiKnight) out.add("Anti-knight");
  if (logic?.antiKing) out.add("Anti-king");
  if (logic?.antiRook) out.add("Anti-rook");
  if (logic?.regions?.length) out.add("Irregular regions");
  if (scene?.fog) out.add("Fog of war");
  if (scene?.cages.some((cage) => !cage.hidden && (cage.style ?? "killer") === "killer")) out.add("Killer cages");
  if (scene?.arrows.length) out.add("Arrow constraints");
  if (scene) {
    const plan = recognizeSudokuPadRenderFeatures(scene);
    let black = false; let white = false;
    for (const graphic of [...scene.underlays, ...scene.overlays]) {
      if (plan.graphicFeature.get(graphic) === "kropki") {
        const fill = String(graphic.backgroundColor ?? graphic.color ?? "").toLowerCase();
        if (/#000|black|rgb\(0/.test(fill)) black = true; else white = true;
      }
      if (plan.graphicFeature.get(graphic) === "xv") out.add("XV clues");
    }
    if (black && white) out.add("Black and white dots");
    else if (black) out.add("Black dots");
    else if (white) out.add("White dots");
    if (scene.lines.some((line) => plan.lineFeature.get(line) === "palindrome")) out.add("Palindrome lines");
    if (scene.arrows.some((arrow) => plan.arrowFeature.get(arrow) === "littlekiller")) out.add("Little killer clues");
  }
  for (const constraint of logic?.constraints ?? []) {
    const type = String(constraint.type ?? "").toLowerCase();
    if (type.includes("thermo")) out.add("Thermo lines");
    else if (type.includes("whisper")) out.add("Whisper lines");
    else if (type.includes("palindrome")) out.add("Palindrome lines");
    else if (type.includes("renban")) out.add("Renban lines");
    else if (type.includes("entropic")) out.add("Entropic lines");
    else if (type.includes("modular")) out.add("Modular lines");
    else if (type.includes("littlekiller")) out.add("Little killer clues");
    else if (type.includes("killer")) out.add("Killer cages");
  }

  const rules = (def.meta.rules ?? "").toLowerCase();
  const keywordMap: Array<[RegExp, string]> = [
    [/\bthermo\b/, "Thermo lines"], [/\bwhisper\b/, "Whisper lines"], [/\brenban\b/, "Renban lines"],
    [/\bpalindrome\b/, "Palindrome lines"], [/\barrow\b/, "Arrow constraints"], [/\bkiller\b/, "Killer cages"],
    [/\bsandwich\b/, "Sandwich clues"], [/\bx\s*-?\s*sum\b/, "X-sum clues"], [/\bskyscraper\b/, "Skyscraper clues"],
    [/\blittle\s*killer\b/, "Little killer clues"], [/\banti\s*-?\s*knight\b/, "Anti-knight"],
    [/\banti\s*-?\s*king\b/, "Anti-king"], [/\bdisjoint\b/, "Disjoint groups"], [/\bfog\b/, "Fog of war"],
  ];
  for (const [pattern, label] of keywordMap) if (pattern.test(rules)) out.add(label);
  return [...out];
}
