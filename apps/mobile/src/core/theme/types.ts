export type BrandingPayload = {
  key: string;
  displayName: string;
  tagline: string;
  description: string;
  logoUrl: string;
  primaryColor: string;
  themePrimary?: string;
  themeSecondary?: string;
  publicSlug: string;
  legacySlugs: string[];
  aliases: {
    ui?: Record<string, string>;
    marketing?: Record<string, string>;
    email?: Record<string, string>;
  };
};

export type AuthSession = {
  authenticated: boolean;
  user?: {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    is_superuser: boolean;
  };
  profile?: {
    role: string;
    access_role: string;
    phone_number: string;
    organization?: {
      id: number;
      name: string;
      company_key: string;
    } | null;
  } | null;
  accessible_products?: string[];
  theme_primary?: string;
  theme_secondary?: string;
};

export type SignupResponse = {
  ok: boolean;
  authenticated: boolean;
  verification_sent: boolean;
  pricing_url: string;
  message: string;
};

export type ProductSubscription = {
  product_slug: string;
  product_name: string;
  status: string;
  access_role: string;
  permission: string;
  plan_id: number | null;
  plan_name: string;
  plan_is_free: boolean;
  allow_app_usage: boolean;
  allow_gaming_ott_usage: boolean;
  allow_hr_view: boolean;
  starts_at: string;
  ends_at: string;
  trial_end: string;
  billing_cycle?: string;
};

export type SubscriptionsResponse = {
  authenticated: boolean;
  subscriptions: ProductSubscription[];
};

export type ThemeTokens = {
  branding: BrandingPayload;
  colors: {
    primary: string;
    primarySoft: string;
    primaryGlow: string;
    secondary: string;
    background: string;
    backgroundAccent: string;
    surface: string;
    surfaceRaised: string;
    surfaceAlt: string;
    surfaceTint: string;
    text: string;
    muted: string;
    border: string;
    shadow: string;
    success: string;
    danger: string;
  };
};
