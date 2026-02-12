from .branding import build_branding_payload


def serialize_branding(product_key, request=None):
    return build_branding_payload(product_key, request=request)
