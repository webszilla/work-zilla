export type MobileProductCatalogEntry = {
  slug: string;
  title: string;
  mobileDescription: string;
  planHint: string;
  aliases: string[];
  onlineOnly: boolean;
  requiresNativeAgent: boolean;
};

const MOBILE_PRODUCTS: MobileProductCatalogEntry[] = [
  {
    slug: "worksuite",
    title: "Work Suite",
    mobileDescription: "Work Suite mobile workspace for attendance, activity, and employee monitoring.",
    planHint: "Employee monitoring, attendance, screenshots, and reports.",
    aliases: ["worksuite", "monitor", "work-suite"],
    onlineOnly: false,
    requiresNativeAgent: true
  },
  {
    slug: "business-autopilot-erp",
    title: "Business Autopilot",
    mobileDescription: "Business Autopilot mobile workspace for CRM, HR, projects, accounts, and stocks.",
    planHint: "CRM, HRM, projects, accounts, subscriptions, and automation.",
    aliases: ["business-autopilot-erp", "business-autopilot"],
    onlineOnly: false,
    requiresNativeAgent: false
  },
  {
    slug: "storage",
    title: "Online Storage",
    mobileDescription: "Online Storage mobile workspace for organization files and folders.",
    planHint: "Cloud storage, device access, user slots, and bandwidth limits.",
    aliases: ["storage", "online-storage"],
    onlineOnly: false,
    requiresNativeAgent: true
  },
  {
    slug: "ai-chatbot",
    title: "AI Chatbot",
    mobileDescription: "AI Chatbot mobile workspace for inbox, live chat, and leads.",
    planHint: "Website chatbot, AI replies, agents, and conversation analytics.",
    aliases: ["ai-chatbot"],
    onlineOnly: true,
    requiresNativeAgent: false
  },
  {
    slug: "imposition-software",
    title: "Print Marks",
    mobileDescription: "Print Marks mobile workspace for plan, license, and print operations.",
    planHint: "Print marks, sheet sizes, and device-based licensing plans.",
    aliases: ["imposition-software", "imposition"],
    onlineOnly: false,
    requiresNativeAgent: true
  },
  {
    slug: "whatsapp-automation",
    title: "WhatsApp Automation",
    mobileDescription: "WhatsApp Automation mobile workspace for campaigns, inbox, and team messaging.",
    planHint: "Campaigns, inbox, flows, and team messaging automation.",
    aliases: ["whatsapp-automation"],
    onlineOnly: true,
    requiresNativeAgent: false
  },
  {
    slug: "digital-automation",
    title: "Digital Automation",
    mobileDescription: "Digital Automation mobile workspace for agency automation and managed service operations.",
    planHint: "Agency automation and managed service operations.",
    aliases: ["digital-automation"],
    onlineOnly: true,
    requiresNativeAgent: false
  }
];

export const DEFAULT_PRODUCT_KEY = "worksuite";

export function getMobileProductCatalog() {
  return MOBILE_PRODUCTS;
}

export function normalizeMobileProductSlug(value?: string | null) {
  const slug = String(value || "").trim().toLowerCase();
  const match = MOBILE_PRODUCTS.find((product) => product.aliases.includes(slug));
  return match?.slug || slug || DEFAULT_PRODUCT_KEY;
}

export function getMobileProduct(slug?: string | null) {
  const normalizedSlug = normalizeMobileProductSlug(slug);
  return MOBILE_PRODUCTS.find((product) => product.slug === normalizedSlug) || null;
}
