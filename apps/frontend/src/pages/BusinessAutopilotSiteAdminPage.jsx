import { Link, useLocation } from "react-router-dom";
import BusinessAutopilotSiteAdminChat from "../components/BusinessAutopilotSiteAdminChat.jsx";

function SiteAdminHeaderTabs() {
  const location = useLocation();
  const pathname = String(location.pathname || "");
  const isAssistantActive = pathname === "/assistant" || pathname.endsWith("/business-autopilot/assistant");
  const isSiteAdminActive = pathname.includes("/site-admin");

  return (
    <div className="ba-assistant-page-tabs__bar">
      <Link to="/assistant" className={`ba-assistant-page-tabs__tab ${isAssistantActive ? "is-active" : ""}`}>
        AI Assistant
      </Link>
      <Link to="/site-admin" className={`ba-assistant-page-tabs__tab ${isSiteAdminActive ? "is-active" : ""}`}>
        Site Admin
      </Link>
    </div>
  );
}

export default function BusinessAutopilotSiteAdminPage() {
  return <BusinessAutopilotSiteAdminChat headerTabs={<SiteAdminHeaderTabs />} />;
}
