#!/usr/bin/env python3
"""Verify every before/after hash before an optional import. Never merges conflicts.
Usage: python scripts/apply_prepared_social.py SOURCE APP_ROOT [--apply]
Both paths must be explicit. This does not deploy SQL, Edge, jobs or frontend.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import tempfile


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def safe(root, relative):
    parts = PurePosixPath(relative)
    if parts.is_absolute() or '..' in parts.parts or not parts.parts:
        raise ValueError(f'Unsafe path: {relative}')
    path = root.joinpath(*parts.parts)
    for parent in [path, *path.parents]:
        if parent == root:
            break
        if parent.is_symlink():
            raise ValueError(f'Symlink is not an import destination: {relative}')
    if path.exists() and not path.is_file():
        raise ValueError(f'Expected a regular file: {relative}')
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('app_root', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    source, target = args.source.resolve(strict=True), args.app_root.resolve(strict=True)
    if source == target:
        raise ValueError('Use separate prepared source and active application directories')
    manifest = json.loads((source/'docs/SOCIAL_PREPARED_MANIFEST.json').read_text())
    updates, conflicts = [], []
    seen = set()
    for item in manifest['files']:
        name = item['path']
        if name in seen:
            raise ValueError(f'Duplicate manifest path: {name}')
        seen.add(name)
        src, dst = safe(source, name), safe(target, name)
        if digest(src) != item['after_sha256']:
            conflicts.append(f'{name}: prepared source differs from manifest')
        elif digest(dst) == item['after_sha256']:
            continue
        elif digest(dst) != item['before_sha256']:
            conflicts.append(f'{name}: destination changed since baseline')
        else:
            updates.append((src,dst,item['mode']))
    if conflicts:
        raise ValueError('No files written. Conflicts:\n'+'\n'.join(conflicts))
    if args.apply:
        for src,dst,mode in updates:
            dst.parent.mkdir(parents=True,exist_ok=True)
            # Atomic per-file replacement after whole-package conflict preflight.
            with tempfile.NamedTemporaryFile(dir=dst.parent,delete=False) as f:
                tmp=Path(f.name)
                f.write(src.read_bytes())
            try:
                tmp.chmod(int(mode,8)&0o777)
                os.replace(tmp,dst)
            finally:
                tmp.unlink(missing_ok=True)
        for item in manifest['files']:
            if digest(safe(target,item['path'])) != item['after_sha256']:
                raise ValueError(f"Post-import mismatch: {item['path']}")
    print(json.dumps({'baseline':manifest['baseline_commit'],'verified':len(seen),'changes':len(updates),'applied':args.apply}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError,OSError,KeyError,json.JSONDecodeError) as error:
        raise SystemExit(str(error))
