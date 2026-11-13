// Curated starter aliases; native-language relevance still needs pilot review.
const groups = [
  ["phone", "phones", "bilbila", "bilbilaa", "\u1235\u120d\u12ad"],
  ["computer", "laptop", "kompiitara", "\u12ae\u121d\u1352\u12cd\u1270\u122d"],
  ["sofa", "couch", "soofaa", "\u1236\u134b"],
  ["bicycle", "bike", "biskileetii", "\u1265\u1235\u12ad\u120c\u1275"],
];
export function searchTerms(raw: string) {
  const q = raw.normalize("NFKC").trim().toLowerCase().slice(0, 100);
  return [
    ...new Set([q, ...(groups.find((group) => group.includes(q)) || [])]),
  ].map((s) => "%" + s.replace(/[\\%_]/g, "\\$&") + "%");
}
