import os

from django.db import migrations, models
from django.utils.text import slugify


def backfill_employee_name(apps, schema_editor):
    Screenshot = apps.get_model("core", "Screenshot")
    Employee = apps.get_model("core", "Employee")
    employee_map = {}
    for emp in Employee.objects.all().only("id", "name", "pc_name", "org_id"):
        employee_map[emp.id] = {
            "name": emp.name,
            "pc_name": emp.pc_name,
            "org_id": emp.org_id,
        }
    org_company_keys = {
        row["id"]: row["company_key"]
        for row in apps.get_model("core", "Organization")
        .objects.all()
        .values("id", "company_key")
    }
    shots = Screenshot.objects.filter(employee_name="").select_related("employee")
    for shot in shots.iterator():
        emp_meta = employee_map.get(shot.employee_id) or {}
        fallback = emp_meta.get("name") or ""
        image_name = shot.image.name or ""
        filename = os.path.basename(image_name)
        stem, _ext = os.path.splitext(filename)
        parts = stem.split("-")
        employee_name = ""
        if len(parts) >= 7:
            middle_tokens = parts[3:-2]
            company_slug = slugify(org_company_keys.get(emp_meta.get("org_id")) or "")
            pc_slug = slugify(emp_meta.get("pc_name") or "pc")
            company_tokens = company_slug.split("-") if company_slug else []
            pc_tokens = pc_slug.split("-") if pc_slug else []
            if company_tokens and middle_tokens[:len(company_tokens)] == company_tokens:
                middle_tokens = middle_tokens[len(company_tokens):]
            if pc_tokens and middle_tokens[-len(pc_tokens):] == pc_tokens:
                middle_tokens = middle_tokens[:-len(pc_tokens)]
            if middle_tokens:
                employee_slug = "-".join(middle_tokens)
                employee_name = employee_slug.replace("-", " ").title()
        shot.employee_name = employee_name or fallback
        shot.save(update_fields=["employee_name"])


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0040_dealeraccount_country"),
    ]

    operations = [
        migrations.AddField(
            model_name="screenshot",
            name="employee_name",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.RunPython(backfill_employee_name, migrations.RunPython.noop),
    ]
