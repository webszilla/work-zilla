def _make_key(app_label, object_name):
    return f"{app_label}:{object_name}"


def _parse_model_path(path):
    if not path or "." not in path:
        return None
    app_label, object_name = path.split(".", 1)
    return (app_label.strip(), object_name.strip())


ADMIN_MENU = {
    "SAAS ADMIN": [
        "saas_admin.Product",
        "saas_admin.OrgProductEntitlement",
        "core.Plan",
        "core.Subscription",
        "core.BillingProfile",
        "core.InvoiceSellerProfile",
    ],
    "COMMON": [
        "common_auth.Organization",
        "common_auth.User",
        "auth.Group",
        "core.Organization",
        "core.UserProfile",
        "core.ReferralSettings",
        "core.ReferralEarning",
        "core.DealerAccount",
        "core.DealerReferralEarning",
    ],
    "CORE": [
        "core.ThemeSettings",
        "core.OrganizationSettings",
        "core.CompanyPrivacySettings",
        "core.SupportAccessAuditLog",
        "core.PendingTransfer",
        "core.SubscriptionHistory",
        "core.DeletedAccount",
        "core.AdminActivity",
    ],
}

ADMIN_QUICK_LINKS = {
    "CORE": [
        ("Support Access", "/admin/support-access/"),
    ],
}

HIDDEN_MODELS = {
    "core.Activity",
    "core.Screenshot",
    "core.Employee",
}


def build_grouped_admin_app_list(app_list):
    model_lookup = {}
    for app in app_list:
        for model in app.get("models", []):
            key = _make_key(app.get("app_label"), model.get("object_name"))
            model_lookup[key] = model

    grouped = []
    used = set()

    for label, model_paths in ADMIN_MENU.items():
        models = []
        for path in model_paths:
            parsed = _parse_model_path(path)
            if not parsed:
                continue
            app_label, object_name = parsed
            key = _make_key(app_label, object_name)
            model = model_lookup.get(key)
            if not model:
                continue
            models.append(model)
            used.add(key)

        for link_label, target_path in ADMIN_QUICK_LINKS.get(label, []):
            if isinstance(target_path, str) and target_path.startswith("/"):
                models.append(
                    {
                        "name": link_label,
                        "object_name": f"QuickLink{label.replace(' ', '')}{link_label.replace(' ', '')}",
                        "admin_url": target_path,
                        "add_url": None,
                        "view_only": True,
                    }
                )
                continue
            parsed = _parse_model_path(target_path)
            if not parsed:
                continue
            target_key = _make_key(*parsed)
            target_model = model_lookup.get(target_key)
            if not target_model or not target_model.get("admin_url"):
                continue
            models.append(
                {
                    "name": link_label,
                    "object_name": f"QuickLink{parsed[0]}{parsed[1]}",
                    "admin_url": target_model.get("admin_url"),
                    "add_url": None,
                    "view_only": True,
                }
            )

        if models:
            grouped.append(
                {
                    "name": label,
                    "app_label": label.lower().replace(" ", "_"),
                    "app_url": "#",
                    "has_module_perms": True,
                    "models": models,
                }
            )

    remaining = []
    for app in app_list:
        for model in app.get("models", []):
            key = _make_key(app.get("app_label"), model.get("object_name"))
            if key in used:
                continue
            model_path = f"{app.get('app_label')}.{model.get('object_name')}"
            if model_path in HIDDEN_MODELS:
                continue
            remaining.append(model)

    if remaining:
        grouped.append(
            {
                "name": "OTHER",
                "app_label": "other",
                "app_url": "#",
                "has_module_perms": True,
                "models": remaining,
            }
        )

    return grouped
