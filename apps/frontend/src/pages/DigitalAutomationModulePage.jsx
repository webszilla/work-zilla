const moduleConfig = {
  social: {
    title: "Social Media Automation",
    description: "Connect social accounts, create posts, and schedule publishing from one place.",
    icon: "bi-share",
    points: [
      "Connect Facebook, Instagram, X, and LinkedIn",
      "Create text/image posts with scheduled publishing",
      "Track post logs and delivery status",
    ],
  },
  ai: {
    title: "AI Content Writer",
    description: "Generate blog content and social captions based on topic, keywords, and tone.",
    icon: "bi-magic",
    points: [
      "Topic + keywords based generation",
      "Professional / casual tone options",
      "Word usage tracking based on plan limits",
    ],
  },
  wordpress: {
    title: "WordPress Auto Post",
    description: "Connect WordPress sites and publish content automatically using WP REST API.",
    icon: "bi-wordpress",
    points: [
      "Store site URL, username, and app password",
      "Create title/content and featured image posts",
      "Track publish logs per site",
    ],
  },
  hosting: {
    title: "Hosting Billing (WHM)",
    description: "Manage WHM account lifecycle with hosting plans, billing, and renewals.",
    icon: "bi-hdd-network",
    points: [
      "Account create / suspend / terminate via WHM API",
      "Attach hosting plans to subscriptions",
      "Auto-provision after payment and renewal support",
    ],
  },
};

export default function DigitalAutomationModulePage({ moduleKey = "" }) {
  const module = moduleConfig[moduleKey] || {
    title: "Digital Automation Module",
    description: "Module configuration not found.",
    icon: "bi-grid",
    points: [],
  };

  return (
    <div className="card p-4">
      <div className="d-flex align-items-start gap-3">
        <div className="stat-icon stat-icon-primary">
          <i className={`bi ${module.icon}`} aria-hidden="true" />
        </div>
        <div className="flex-grow-1">
          <h4 className="mb-1">{module.title}</h4>
          <p className="text-secondary mb-3">{module.description}</p>
          <ul className="mb-0 ps-3">
            {module.points.map((point) => (
              <li key={point} className="mb-2">{point}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
