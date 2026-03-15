import { useState } from "react";
import { getAiEmotionEmoji, getAnimatedEmojiUrl } from "./aiAvatarConfig.js";

export default function AiAvatar({ emotion = "neutral", size = 44, className = "" }) {
  const [failed, setFailed] = useState(false);
  const emoji = getAiEmotionEmoji(emotion);
  const style = { width: `${size}px`, height: `${size}px` };

  return (
    <span
      className={`ai-avatar ${className}`.trim()}
      style={style}
      aria-hidden="true"
      title={`AI avatar ${emotion}`}
    >
      {failed ? (
        <span className="ai-avatar__fallback" style={{ fontSize: `${Math.max(22, Math.round(size * 0.58))}px` }}>
          {emoji}
        </span>
      ) : (
        <img
          className="ai-avatar__img"
          src={getAnimatedEmojiUrl(emotion)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
