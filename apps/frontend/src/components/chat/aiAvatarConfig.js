export const AI_EMOTION_MAP = {
  neutral: "🙂",
  thinking: "🤔",
  explaining: "😊",
  happy: "😄",
  concerned: "😐",
};

const EMOTION_KEYWORDS = {
  thinking: [
    "let us think",
    "let's think",
    "analyze",
    "analysis",
    "investigate",
    "debug",
    "consider",
    "checking",
    "review",
    "problem",
    "issue",
    "working on",
  ],
  explaining: [
    "because",
    "this means",
    "for example",
    "step",
    "how to",
    "explains",
    "here is why",
    "details",
    "summary",
    "based on",
  ],
  happy: [
    "done",
    "completed",
    "fixed",
    "resolved",
    "success",
    "great",
    "perfect",
    "working",
    "enabled",
    "updated",
    "saved",
  ],
  concerned: [
    "cannot",
    "can't",
    "unable",
    "warning",
    "missing",
    "failed",
    "error",
    "not available",
    "blocked",
    "problem remains",
  ],
};

function emojiToCodepoint(emoji) {
  return Array.from(emoji)
    .map((char) => char.codePointAt(0).toString(16))
    .join("-");
}

export function getAiEmotionFromText(text) {
  const value = String(text || "").trim().toLowerCase();
  if (!value) {
    return "neutral";
  }
  if (EMOTION_KEYWORDS.concerned.some((keyword) => value.includes(keyword))) {
    return "concerned";
  }
  if (EMOTION_KEYWORDS.happy.some((keyword) => value.includes(keyword))) {
    return "happy";
  }
  if (EMOTION_KEYWORDS.thinking.some((keyword) => value.includes(keyword))) {
    return "thinking";
  }
  if (EMOTION_KEYWORDS.explaining.some((keyword) => value.includes(keyword))) {
    return "explaining";
  }
  return "neutral";
}

export function getAiEmotionEmoji(emotion) {
  return AI_EMOTION_MAP[emotion] || AI_EMOTION_MAP.neutral;
}

export function getAnimatedEmojiUrl(emotion) {
  const emoji = getAiEmotionEmoji(emotion);
  const codepoint = emojiToCodepoint(emoji);
  return `https://fonts.gstatic.com/s/e/notoemoji/latest/${codepoint}/512.gif`;
}
