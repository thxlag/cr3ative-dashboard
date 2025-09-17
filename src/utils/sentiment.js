const positiveWords = new Set([
  "awesome",
  "amazing",
  "great",
  "good",
  "love",
  "nice",
  "helpful",
  "thanks",
  "thank",
  "cool",
  "win",
  "yay",
  "congrats",
]);

const negativeWords = new Set([
  "bad",
  "terrible",
  "hate",
  "awful",
  "annoying",
  "bug",
  "broken",
  "issue",
  "angry",
  "sad",
  "fail",
  "loser",
]);

export function scoreSentiment(text = "") {
  if (!text) return 0;
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return 0;

  let score = 0;
  for (const word of words) {
    if (positiveWords.has(word)) score += 1;
    if (negativeWords.has(word)) score -= 1;
  }
  return score / words.length;
}
