#!/usr/bin/env python3
import argparse
import os
import sys
from pathlib import Path


def main():
    root_dir = Path(__file__).resolve().parent.parent
    repo_python = root_dir / "env" / "bin" / "python"
    repo_env = root_dir / "env"
    if repo_python.exists() and Path(sys.prefix).resolve() != repo_env.resolve():
        os.execv(str(repo_python), [str(repo_python), str(Path(__file__).resolve()), *sys.argv[1:]])
    sys.path.insert(0, str(root_dir))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "apps.backend.core_platform.settings")

    import django

    django.setup()

    from apps.backend.website import application_downloads

    parser = argparse.ArgumentParser(description="Sync generated application installers to Backblaze object storage.")
    parser.add_argument(
        "--clean-local-first",
        action="store_true",
        help="Delete old local matched installer files before a fresh build.",
    )
    parser.add_argument(
        "--delete-local",
        action="store_true",
        help="Delete matched local installer files after successful upload.",
    )
    parser.add_argument(
        "--keep-local",
        action="store_true",
        help="Keep local installer files after upload.",
    )
    args = parser.parse_args()

    if args.clean_local_first:
        deleted_pre = application_downloads.clear_local_application_downloads()
        print(f"Pre-clean deleted local files: {len(deleted_pre)}")
        for filename in deleted_pre:
            print(f"  - {filename}")
        return

    delete_local = args.delete_local or not args.keep_local
    result = application_downloads.sync_local_application_downloads(delete_local=delete_local)

    print(f"Application folder: {result['folder_prefix'] or application_downloads.APPLICATION_DOWNLOADS_CATEGORY}")
    print(f"Uploaded: {len(result['uploaded'])}")
    for item in result["uploaded"]:
        print(f"  - {item['filename']} -> {item['storage_key']}")
    print(f"Deleted remote old files: {len(result['deleted_remote'])}")
    for filename in result["deleted_remote"]:
        print(f"  - {filename}")
    if delete_local:
        print(f"Deleted local files: {len(result['deleted_local'])}")
        for filename in result["deleted_local"]:
            print(f"  - {filename}")


if __name__ == "__main__":
    main()
