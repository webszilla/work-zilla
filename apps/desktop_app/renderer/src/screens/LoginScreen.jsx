import { useState } from "react";

export default function LoginScreen({ onLogin, onBack }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [status, setStatus] = useState({ loading: false, error: "" });

  async function handleSubmit(event) {
    event.preventDefault();
    if (status.loading) {
      return;
    }
    setStatus({ loading: true, error: "" });
    try {
      await onLogin(form);
    } catch (error) {
      setStatus({ loading: false, error: error?.message || "Login failed." });
      return;
    }
    setStatus({ loading: false, error: "" });
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <div>
            <h1>Work Zilla Agent</h1>
            <p className="text-muted">Sign in once to access all enabled products.</p>
          </div>
          {onBack ? (
            <button className="btn btn-secondary" type="button" onClick={onBack}>
              Back
            </button>
          ) : null}
        </div>
        {status.error ? <div className="alert alert-danger">{status.error}</div> : null}
        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              required
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={status.loading}>
            {status.loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
