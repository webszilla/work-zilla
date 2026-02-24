import { useEffect, useState } from "react";
import { waApi } from "../api/whatsappAutomation.js";

export default function DigitalBusinessCardDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [company, setCompany] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await waApi.getCompanyProfile();
        if (!active) return;
        setCompany(data?.company_profile || null);
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setError(err?.message || "Unable to load digital card data.");
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) return <div className="card p-4 text-center"><div className="spinner" /><p className="mb-0">Loading digital card...</p></div>;

  const cardUrl = company?.digital_card_url || "";
  const catalogueUrl = company?.catalogue_url || "";
  const themeColor = company?.theme_color || "#22c55e";

  return (
    <div className="d-flex flex-column gap-3">
      <div className="card p-4">
        <h3 className="mb-2">Digital Business Card</h3>
        <p className="text-secondary mb-0">Public URL and preview powered by Company Profile master details.</p>
        {error ? <div className="alert alert-danger mt-3">{error}</div> : null}
        <div className="d-flex flex-wrap gap-2 mt-3">
          {cardUrl ? <a className="btn btn-primary btn-sm" href={cardUrl} target="_blank" rel="noreferrer">Open Public Card</a> : null}
          {catalogueUrl ? <a className="btn btn-outline-light btn-sm" href={catalogueUrl} target="_blank" rel="noreferrer">Open Public Catalogue</a> : null}
          <a className="btn btn-outline-light btn-sm" href="/app/whatsapp-automation/dashboard/company-profile">Edit Company Profile</a>
        </div>
      </div>

      <div className="card p-4">
        <div className="d-flex align-items-center gap-2 mb-2">
          <span className="badge" style={{ background: themeColor, color: "#071226" }}>Theme</span>
          <h4 className="mb-0">{company?.company_name || "Company Name"}</h4>
        </div>
        <p className="text-secondary">{company?.description || "Fill company description in Company Profile to render the public digital card."}</p>
        <div className="row g-3">
          <div className="col-12 col-md-6"><strong>Phone:</strong> {company?.phone || "-"}</div>
          <div className="col-12 col-md-6"><strong>WhatsApp:</strong> {company?.whatsapp_number || "-"}</div>
          <div className="col-12 col-md-6"><strong>Email:</strong> {company?.email || "-"}</div>
          <div className="col-12 col-md-6"><strong>Website:</strong> {company?.website || "-"}</div>
          <div className="col-12"><strong>Address:</strong> {company?.address || "-"}</div>
        </div>
      </div>
    </div>
  );
}
