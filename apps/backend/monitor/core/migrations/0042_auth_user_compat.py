from django.db import migrations


CREATE_AUTH_USER_TABLE = """
CREATE TABLE IF NOT EXISTS auth_user (
    id INTEGER NOT NULL PRIMARY KEY
);
"""

SYNC_EXISTING_USERS = """
INSERT INTO auth_user (id)
SELECT id FROM common_auth_user
WHERE id NOT IN (SELECT id FROM auth_user);
"""

CREATE_INSERT_TRIGGER = """
CREATE TRIGGER IF NOT EXISTS auth_user_sync_insert
AFTER INSERT ON common_auth_user
BEGIN
    INSERT INTO auth_user (id) VALUES (NEW.id);
END;
"""

CREATE_DELETE_TRIGGER = """
CREATE TRIGGER IF NOT EXISTS auth_user_sync_delete
AFTER DELETE ON common_auth_user
BEGIN
    DELETE FROM auth_user WHERE id = OLD.id;
END;
"""

DROP_INSERT_TRIGGER = "DROP TRIGGER IF EXISTS auth_user_sync_insert;"
DROP_DELETE_TRIGGER = "DROP TRIGGER IF EXISTS auth_user_sync_delete;"


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0041_screenshot_employee_name"),
        ("common_auth", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql=";".join(
                [
                    CREATE_AUTH_USER_TABLE,
                    SYNC_EXISTING_USERS,
                    CREATE_INSERT_TRIGGER,
                    CREATE_DELETE_TRIGGER,
                ]
            ),
            reverse_sql=";".join(
                [
                    DROP_INSERT_TRIGGER,
                    DROP_DELETE_TRIGGER,
                ]
            ),
        ),
    ]
