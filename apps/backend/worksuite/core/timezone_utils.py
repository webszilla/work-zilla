from zoneinfo import ZoneInfo


COUNTRY_TIMEZONE_MAP = {
    "india": "Asia/Kolkata",
    "united states": "America/New_York",
    "usa": "America/New_York",
    "us": "America/New_York",
    "united kingdom": "Europe/London",
    "uk": "Europe/London",
    "uae": "Asia/Dubai",
    "united arab emirates": "Asia/Dubai",
    "canada": "America/Toronto",
    "australia": "Australia/Sydney",
    "germany": "Europe/Berlin",
    "france": "Europe/Paris",
    "singapore": "Asia/Singapore",
    "japan": "Asia/Tokyo",
    "china": "Asia/Shanghai",
    "south africa": "Africa/Johannesburg",
    "saudi arabia": "Asia/Riyadh",
    "qatar": "Asia/Qatar",
    "oman": "Asia/Muscat",
    "kuwait": "Asia/Kuwait",
    "bahrain": "Asia/Bahrain",
    "nepal": "Asia/Kathmandu",
    "sri lanka": "Asia/Colombo",
    "bangladesh": "Asia/Dhaka",
    "pakistan": "Asia/Karachi",
    "malaysia": "Asia/Kuala_Lumpur",
    "thailand": "Asia/Bangkok",
    "indonesia": "Asia/Jakarta",
    "philippines": "Asia/Manila",
    "new zealand": "Pacific/Auckland",
}


def normalize_country(value):
    return " ".join(str(value or "").strip().lower().split())


def timezone_from_country(country):
    return COUNTRY_TIMEZONE_MAP.get(normalize_country(country))


def is_valid_timezone(value):
    tz_name = str(value or "").strip()
    if not tz_name:
        return False
    try:
        ZoneInfo(tz_name)
        return True
    except Exception:
        return False


def normalize_timezone(value, fallback="UTC"):
    tz_name = str(value or "").strip()
    if is_valid_timezone(tz_name):
        return tz_name
    return fallback


def resolve_default_timezone(country=None, browser_timezone=None, fallback="UTC"):
    country_tz = timezone_from_country(country)
    if country_tz and is_valid_timezone(country_tz):
        return country_tz
    if is_valid_timezone(browser_timezone):
        return str(browser_timezone).strip()
    return fallback
