from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
PROMPTS_DIR = BASE_DIR / "prompts"


def _read_prompt(relative_path: str) -> str:
    return (PROMPTS_DIR / relative_path).read_text(encoding="utf-8").strip()


@lru_cache(maxsize=1)
def _load_quick_estimate_schema() -> dict:
    return json.loads(_read_prompt("schemas/quick_estimate_output.json"))


@dataclass(frozen=True)
class SiteAdminModuleInstruction:
    key: str
    module_name: str
    enabled: bool
    supported_intents: tuple[str, ...]
    required_fields: tuple[str, ...]
    optional_fields: tuple[str, ...]
    payment_statuses: tuple[str, ...] = ()
    delivery_statuses: tuple[str, ...] = ()
    hints: tuple[str, ...] = ()
    global_prompt_path: str = "global.md"
    module_prompt_path: str = ""
    schema_path: str = ""

    @property
    def output_schema(self) -> dict:
        if self.key == "quick_estimate":
            return _load_quick_estimate_schema()
        return {}

    def build_instruction_text(self) -> str:
        parts = [_read_prompt(self.global_prompt_path)]
        if self.module_prompt_path:
            parts.append(_read_prompt(self.module_prompt_path))
        if self.schema_path:
            parts.append("Output JSON Schema:\n" + _read_prompt(self.schema_path))
        return "\n\n".join(part for part in parts if part).strip()


SITE_ADMIN_MODULES: dict[str, SiteAdminModuleInstruction] = {
    "quick_estimate": SiteAdminModuleInstruction(
        key="quick_estimate",
        module_name="Quick Estimate",
        enabled=True,
        supported_intents=(
            "quick_estimate_create",
            "quick_estimate_edit",
            "quick_estimate_add_item",
            "quick_estimate_remove_item",
            "quick_estimate_update_payment_status",
            "quick_estimate_update_delivery_status",
            "quick_estimate_assign_user",
            "quick_estimate_whatsapp_share",
            "ask_missing_field",
            "unknown",
        ),
        required_fields=("mobile", "client_name", "items", "amount"),
        optional_fields=(
            "email",
            "address",
            "gst_number",
            "notes",
            "assigned_to_user",
            "payment_status",
            "delivery_status",
        ),
        payment_statuses=("unpaid", "advance_paid", "partial_paid", "paid", "cancelled", "refunded"),
        delivery_statuses=("pending", "design_pending", "design_completed", "printing", "ready", "delivered", "cancelled"),
        hints=("qe", "quick estimate", "quick estimate create", "qe create"),
        module_prompt_path="modules/quick_estimate.md",
        schema_path="schemas/quick_estimate_output.json",
    ),
    "invoice": SiteAdminModuleInstruction(
        key="invoice",
        module_name="Invoice",
        enabled=False,
        supported_intents=(),
        required_fields=(),
        optional_fields=(),
        module_prompt_path="modules/invoice.md",
    ),
    "payment": SiteAdminModuleInstruction(
        key="payment",
        module_name="Payment",
        enabled=False,
        supported_intents=(),
        required_fields=(),
        optional_fields=(),
        module_prompt_path="modules/payment.md",
    ),
    "delivery": SiteAdminModuleInstruction(
        key="delivery",
        module_name="Delivery",
        enabled=False,
        supported_intents=(),
        required_fields=(),
        optional_fields=(),
        module_prompt_path="modules/delivery.md",
    ),
    "crm": SiteAdminModuleInstruction(
        key="crm",
        module_name="CRM",
        enabled=False,
        supported_intents=(),
        required_fields=(),
        optional_fields=(),
        module_prompt_path="modules/crm.md",
    ),
    "hrm": SiteAdminModuleInstruction(
        key="hrm",
        module_name="HRM",
        enabled=False,
        supported_intents=(),
        required_fields=(),
        optional_fields=(),
        module_prompt_path="modules/hrm.md",
    ),
    "ticketing": SiteAdminModuleInstruction(
        key="ticketing",
        module_name="Ticketing",
        enabled=False,
        supported_intents=(),
        required_fields=(),
        optional_fields=(),
        module_prompt_path="modules/ticketing.md",
    ),
    "inventory": SiteAdminModuleInstruction(
        key="inventory",
        module_name="Inventory",
        enabled=False,
        supported_intents=(),
        required_fields=(),
        optional_fields=(),
        module_prompt_path="modules/inventory.md",
    ),
}


def get_site_admin_module(module_key: str) -> SiteAdminModuleInstruction | None:
    return SITE_ADMIN_MODULES.get(str(module_key or "").strip().lower())


def get_site_admin_enabled_modules() -> list[SiteAdminModuleInstruction]:
    return [module for module in SITE_ADMIN_MODULES.values() if module.enabled]


def get_site_admin_module_hints(module_key: str) -> tuple[str, ...]:
    module = get_site_admin_module(module_key)
    return module.hints if module else ()


def build_site_admin_instruction_context(module_key: str | None = None) -> str:
    if module_key:
        module = get_site_admin_module(module_key)
        if not module:
            return ""
        return module.build_instruction_text()
    enabled_modules = get_site_admin_enabled_modules()
    return "\n\n".join(module.build_instruction_text() for module in enabled_modules)
