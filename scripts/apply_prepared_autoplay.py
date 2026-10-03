from pathlib import Path
import hashlib,json,sys
source=Path(__file__).resolve().parent.parent
target=Path(sys.argv[1]).resolve()
manifest=json.loads((source/'docs/CAMERA_AUTOPLAY_20260921_FILES.json').read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None
for f in manifest['files']:
    if sha(source/f['path']) != f['after']: raise SystemExit('Bad package: '+f['path'])
    if sha(target/f['path']) not in [f['before'],f['after']]: raise SystemExit('Conflict: '+f['path'])
for f in manifest['files']:
    p=target/f['path'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((source/f['path']).read_bytes())
for f in manifest['files']:
    if sha(target/f['path']) != f['after']: raise SystemExit('Import mismatch: '+f['path'])
print(str(len(manifest['files']))+' files imported and SHA-256 verified')

for extra in ['docs/CAMERA_AUTOPLAY_20260921_FILES.json','scripts/apply_prepared_autoplay.py']:
    p=target/extra;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((source/extra).read_bytes())
