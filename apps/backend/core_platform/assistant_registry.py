from dataclasses import dataclass
from typing import Iterable, Optional, Tuple


@dataclass(frozen=True)
class AssistantProductProfile:
    key: str
    label: str
    audience: str
    operating_mode: str
    default_agent_name: str
    capability_notes: Tuple[str, ...]
    knowledge_notes: Tuple[str, ...]


ASSISTANT_PRODUCT_REGISTRY = {
    "business_autopilot": AssistantProductProfile(
        key="business_autopilot",
        label="Business Autopilot",
        audience="internal organization users like org admin, CRM users, HRM users, and full-access business users",
        operating_mode="internal business copilot",
        default_agent_name="Work Zilla AI Assistant",
        capability_notes=(
            "Works as an internal organization employee-style assistant, not as a public website support bot.",
            "Can answer across enabled ERP modules such as CRM, HRM, Projects, Accounts, Subscriptions, Ticketing, Inventory, Users, Billing, Plans, and Profile.",
            "Must respect current organization scope, user role scope, enabled modules, and visible records.",
            "Meetings belong to the CRM module.",
            "Invoices belong to the Accounts workspace data.",
        ),
        knowledge_notes=(
            "When the user asks a total, count, top owner, pending amount, or module availability question, the assistant should reason from the provided org context instead of replying generically.",
            "Feature availability and data availability are different: if a feature exists but there are no rows today, clearly say the feature exists and there is no current data.",
            "Use recent discussion and referential words like that, antha, same, those, and current page context before saying data is unavailable.",
        ),
    ),
    "ai_chatbot": AssistantProductProfile(
        key="ai_chatbot",
        label="AI Chatbot",
        audience="external website visitors and lead/support conversations",
        operating_mode="public website live support chat widget",
        default_agent_name="Work Zilla Live Assistant",
        capability_notes=(
            "Works like a configurable public website live support chat widget.",
            "Can be embedded in websites and should focus on support, lead capture, FAQs, and guided responses.",
            "Should avoid exposing internal business-only data unless explicitly configured.",
        ),
        knowledge_notes=(
            "Should keep visitor replies short, friendly, and conversion-focused.",
            "Should support routing to humans, lead collection, and configured FAQ knowledge.",
        ),
    ),
}


def get_assistant_product_profile(product_key: str) -> Optional[AssistantProductProfile]:
    return ASSISTANT_PRODUCT_REGISTRY.get(str(product_key or "").strip().lower())


def build_assistant_training_context(
    product_key: str,
    *,
    org_name: str = "",
    enabled_modules: Optional[Iterable[str]] = None,
    extra_notes: Optional[Iterable[str]] = None,
) -> str:
    profile = get_assistant_product_profile(product_key)
    if not profile:
        return ""
    enabled_module_list = [str(item or "").strip() for item in (enabled_modules or []) if str(item or "").strip()]
    lines = [
        f"Product profile: {profile.label}",
        f"Audience: {profile.audience}",
        f"Operating mode: {profile.operating_mode}",
    ]
    if org_name:
        lines.append(f"Organization: {org_name}")
    if enabled_module_list:
        lines.append(f"Enabled modules: {', '.join(enabled_module_list)}")
    lines.extend(f"Capability: {note}" for note in profile.capability_notes)
    lines.extend(f"Knowledge: {note}" for note in profile.knowledge_notes)
    lines.extend(
        f"Note: {str(note).strip()}"
        for note in (extra_notes or [])
        if str(note or "").strip()
    )
    return "\n".join(lines)
