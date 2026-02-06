import { useState } from "react";

export default function ScreenRecordingGate({ onComplete }) {
  const [checking, setChecking] = useState(false);

  async function handleContinue() {
    if (!window.storageApi?.checkScreenRecording) {
      return;
    }
    setChecking(true);
    const screenAllowed = await window.storageApi.checkScreenRecording();
    if (screenAllowed) {
      onComplete();
      return;
    }
    setChecking(false);
  }

  return (
    <div className="screen-gate">
      <div className="screen-gate-panel">
        <h1>Enable Screen Recording to continue</h1>
        <div className="screen-gate-text">
          System Settings → Privacy &amp; Security → Screen Recording
          <br />
          Enable "Work Zilla Agent"
          <br />
          Then return to the app
        </div>
        <button className="btn btn-primary" type="button" onClick={handleContinue} disabled={checking}>
          {checking ? "Checking..." : "I've enabled it – Continue"}
        </button>
      </div>
    </div>
  );
}
