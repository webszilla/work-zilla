from typing import Callable, List


_EXPORTERS: List[Callable] = []
_RESTORERS: List[Callable] = []


def register_backup_exporter(exporter):
    """
    Exporter signature:
      exporter(org_id, product_id, output_dir) -> dict
    Returns dict to add into manifest.
    """
    _EXPORTERS.append(exporter)


def get_exporters():
    return list(_EXPORTERS)


def register_backup_restorer(restorer):
    """
    Restorer signature:
      restorer(org_id, product_id, extracted_dir, manifest) -> None
    """
    _RESTORERS.append(restorer)


def get_restorers():
    return list(_RESTORERS)
