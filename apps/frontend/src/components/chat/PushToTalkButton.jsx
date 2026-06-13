import { useRef } from "react";

export default function PushToTalkButton({
  supported = false,
  listening = false,
  disabled = false,
  onStart,
  onStop,
  className = "ba-assistant__round-btn",
  title,
  ariaLabel,
  tooltip,
}) {
  const pressedRef = useRef(false);

  const canUse = supported && !disabled;
  const resolvedLabel = ariaLabel || title || (supported
    ? (listening ? "Release to send voice" : "Hold to talk")
    : "Voice input unsupported");
  const resolvedTitle = title || resolvedLabel;
  const resolvedTooltip = tooltip || resolvedLabel;

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
      title={resolvedTitle}
      data-wz-tooltip={resolvedTooltip}
      aria-label={resolvedLabel}
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
