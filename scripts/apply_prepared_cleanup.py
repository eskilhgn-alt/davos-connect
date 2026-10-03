#!/usr/bin/env python3
"""Import the prepared cleanup, verifying every touched file before any write.

Usage: python scripts/apply_prepared_cleanup.py SOURCE_CHECKOUT LOVABLE_ROOT
The source checkout must be the exact reviewed cleanup commit. Unrelated and
newer target changes are preserved; a conflict aborts the entire preflight.
"""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile

MANIFEST = Path('docs/CLEANUP_20260920_FILES.json')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def safe_path(root, relative):
    rel = Path(relative)
    if rel.is_absolute() or '..' in rel.parts or '.git' in rel.parts:
        raise ValueError(f'Unsafe path: {relative}')
    path = root / rel
    if path.is_symlink() or not path.resolve().is_relative_to(root):
        raise ValueError(f'Unsafe target: {relative}')
    if path.exists() and not path.is_file():
        raise ValueError(f'Not a regular file: {relative}')
    return path


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.cleanup-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as handle:
            handle.write(data)
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    source, target = (Path(value).resolve(strict=True) for value in sys.argv[1:])
    manifest_bytes = safe_path(source, MANIFEST).read_bytes()
    manifest = json.loads(manifest_bytes)
    operations = []
    seen = set()
    for entry in manifest['files']:
        relative = entry['path']
        if relative in seen or relative == str(MANIFEST):
            raise ValueError(f'Duplicate/recursive manifest entry: {relative}')
        seen.add(relative)
        src = safe_path(source, relative)
        dst = safe_path(target, relative)
        before, after = entry['before_sha256'], entry['after_sha256']
        if digest(src) != after:
            raise ValueError(f'Source hash mismatch: {relative}')
        current = digest(dst)
        if current not in (before, after):
            raise ValueError(f'Target conflict; no files changed: {relative}')
        if current != after:
            operations.append((dst, None if after is None else src.read_bytes(), after))
    dst_manifest = safe_path(target, MANIFEST)
    if dst_manifest.exists() and dst_manifest.read_bytes() != manifest_bytes:
        raise ValueError('Existing manifest differs; no files changed')

    # Only now, after all source hashes and target preconditions passed, mutate.
    for path, data, expected in operations:
        if data is None:
            path.unlink()
        else:
            atomic_write(path, data)
        if digest(path) != expected:
            raise RuntimeError(f'Post-write verification failed: {path}')
    atomic_write(dst_manifest, manifest_bytes)
    print(f'Verified {len(seen)} files; applied {len(operations)} changes. No database/deploy action.')


if __name__ == '__main__':
    main()
