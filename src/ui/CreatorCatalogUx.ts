/** Creator-only navigation helpers; never alter stored puzzle tools or their IDs. */
export type CreatorCatalogCategory = "Lines & paths" | "Cells, edges & cages" | "Outside & global" | "Artwork" | "Fog & advanced";
export type CreatorCatalogFilter = "All" | CreatorCatalogCategory;
export type CreatorCatalogSearchItem = { id: string; name: string; description: string };

const lineIds = new Set([
  "thermometers", "slow-thermometers", "renban-lines", "german-whispers", "dutch-whispers", "palindromes",
  "between-lines", "region-sum-lines", "sequence-lines", "entropic-lines", "3-modular-lines", "parity-lines",
  "lockout-lines", "arrows", "double-arrows",
]);
const groupIds = new Set([
  "extra-region", "even", "odd", "minimum", "maximum", "difference-kropki", "ratio-kropki", "xv",
  "killer-cages", "clones", "quadruples", "look-and-say-cages", "different-values", "counting-circles",
]);
const artworkIds = new Set([
  "cosmetic-lines", "cosmetic-cages", "cosmetic-symbols", "cosmetic-text", "cosmetic-shapes",
  "cosmetic-images", "cosmetic-backgrounds",
]);
const advancedIds = new Set(["fog-lights", "custom-fog-clearing", "custom-constraint"]);

export const CREATOR_CATALOG_CATEGORIES: readonly CreatorCatalogCategory[] = [
  "Lines & paths", "Cells, edges & cages", "Outside & global", "Artwork", "Fog & advanced",
];

export function creatorCatalogCategory(id: string): CreatorCatalogCategory {
  if (lineIds.has(id)) return "Lines & paths";
  if (groupIds.has(id)) return "Cells, edges & cages";
  if (artworkIds.has(id)) return "Artwork";
  if (advancedIds.has(id)) return "Fog & advanced";
  return "Outside & global";
}

const aliases: Readonly<Record<string, string>> = {
  "difference-kropki": "white dot adjacent difference",
  "ratio-kropki": "black dot ratio",
  "xv": "five ten sum",
  "german-whispers": "whisper line",
  "dutch-whispers": "whisper line",
  "little-killers": "outside diagonal sum",
  "fog-lights": "fog initial reveal",
  "custom-fog-clearing": "fog trigger reveal",
  "cosmetic-backgrounds": "image picture background",
  "cosmetic-images": "image picture artwork",
  "extra-region": "irregular region",
};
const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();

export function filterCreatorCatalog<T extends CreatorCatalogSearchItem>(
  catalog: readonly T[], query: string, category: CreatorCatalogFilter = "All",
): T[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return catalog.filter((item) => {
    if (category !== "All" && creatorCatalogCategory(item.id) !== category) return false;
    const search = normalize(`${item.name} ${item.description} ${item.id.replace(/-/g, " ")} ${aliases[item.id] ?? ""} ${creatorCatalogCategory(item.id)}`);
    return terms.every((term) => search.includes(term));
  });
}
