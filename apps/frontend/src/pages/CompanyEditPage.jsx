import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api.js";

const emptyState = {
  loading: true,
  error: "",
  name: ""
};

export default function CompanyEditPage() {
  const navigate = useNavigate();
  const [state, setState] = useState(emptyState);
  const [name, setName] = useState("");

  useEffect(() => {
    let active = true;
    async function loadCompany() {
      try {
        const data = await apiFetch("/api/dashboard/company");
        if (!active) {
          return;
        }
        const orgName = data.org?.name || "";
        setName(orgName);
        setState({ loading: false, error: "", name: orgName });
      } catch (error) {
        if (error?.data?.redirect) {
          window.location.href = error.data.redirect;
          return;
        }
        if (active) {
          setState({
            loading: false,
            error: error?.message || "Unable to load company details.",
            name: ""
          });
        }
      }
    }

    loadCompany();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      await apiFetch("/api/dashboard/company/name", {
        method: "POST",
        body: JSON.stringify({ name })
      });
      navigate("/company");
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.message || "Unable to update company."
      }));
    }
  }

  if (state.loading) {
    return (
      <div className="card p-4 text-center">
        <div className="spinner" />
        <p className="mb-0">Loading company...</p>
      </div>
    );
  }

  return (
    <>
      <h2 className="page-title">Edit Company</h2>
      <hr className="section-divider" />

      {state.error ? <div className="alert alert-danger">{state.error}</div> : null}

      <form onSubmit={handleSubmit}>
        <label className="form-label">Company Name</label>
        <input
          type="text"
          className="form-control"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />

        <div className="mt-3 d-flex gap-2">
          <button className="btn btn-success" type="submit">
            Save
          </button>
          <Link to="/company" className="btn btn-outline-light">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
