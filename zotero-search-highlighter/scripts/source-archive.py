"""Package only this project's reviewed source and delivery notes."""
from pathlib import Path
import zipfile
import json

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))['version']
target = root / 'dist' / f'zotero-search-highlighter-{version}-source.zip'
files = [root / name for name in (
    'package.json', 'package-lock.json', 'tsconfig.json', 'manifest.json',
    'bootstrap.js', '.gitignore', '.gitattributes', '.dockerignore', 'Dockerfile.build', 'README.md', 'VALIDATION.md',
)]
for folder in ('src', 'tests', 'scripts'):
    files.extend(p for p in (root / folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(files):
        info = zipfile.ZipInfo('zotero-search-highlighter/' + file.relative_to(root).as_posix(), (2026, 10, 22, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, file.read_bytes())
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
print(target.name, target.stat().st_size, 'bytes')
