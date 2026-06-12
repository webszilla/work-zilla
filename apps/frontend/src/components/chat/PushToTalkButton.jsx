import { useRef } from "react";

export default function PushToTalkButton({
  supported = false,
  listening = false,
  disabled = false,
  onStart,
  onStop,
  className = "ba-assistant__round-btn",
}) {
  const pressedRef = useRef(false);

  const canUse = supported && !disabled;

  const handlePressStart = (event) => {
    if (!canUse || pressedRef.current) {
      return;
    }
    pressedRef.current = true;
    event?.preventDefault?.();
    if (typeof onStart === "function") {
      onStart();
    }
  };

  const handlePressEnd = (event) => {
    if (!pressedRef.current) {
      return;
    }
    pressedRef.current = false;
    event?.preventDefault?.();
    if (typeof onStop === "function") {
      onStop();
    }
  };

  return (
    <button
      type="button"
      className={className}
      disabled={!canUse}
      title={
        supported
          ? (listening ? "Release to send voice" : "Hold to talk")
          : "Voice input is not supported in this browser"
      }
      aria-label={
        supported
          ? (listening ? "Release to send voice" : "Hold to talk")
          : "Voice input unsupported"
      }
      onPointerDown={handlePressStart}
      onPointerUp={handlePressEnd}
      onPointerLeave={handlePressEnd}
      onPointerCancel={handlePressEnd}
      onTouchEnd={handlePressEnd}
      onMouseUp={handlePressEnd}
      onContextMenu={(event) => event.preventDefault()}
    >
      <i className={`bi ${listening ? "bi-mic-fill" : "bi-mic"}`} aria-hidden="true" />
    </button>
  );
}
