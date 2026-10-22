"""Run an official Zotero binary against a new empty profile, inside Docker only."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile

assert Path('/.dockerenv').exists(), 'This test must run in Docker'
binary = Path('/tmp/Zotero_linux-x86_64')
root = Path('/workspace')
out = root / 'test-results'
out.mkdir(exist_ok=True)
report = out / 'runtime-install.json'
if report.exists():
    report.rename(out / 'runtime-install-previous.json')
temp = Path(tempfile.mkdtemp(prefix='zsh-runtime-'))
profile = temp / 'profile'
profile.mkdir()
data = temp / 'data'
data.mkdir()
preferences = {
    'extensions.zotero.dataDir': str(data), 'extensions.zotero.useDataDir': True,
    'extensions.zotero.firstRun2': False, 'extensions.zotero.firstRunGuidance': False,
    'extensions.zotero.firstRun.skipFirefoxProfileAccessCheck': True,
    'extensions.zotero.sync.autoSync': False, 'extensions.zotero.automaticScraperUpdates': False,
    'extensions.zoteroOpenOfficeIntegration.skipInstallation': True,
    'app.update.enabled': False, 'browser.shell.checkDefaultBrowser': False,
    'network.offline': True,
}
(profile / 'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)}, {json.dumps(v)});' for k, v in preferences.items()))
for base in (binary, binary / 'app'):
    folder = base / 'defaults' / 'pref'
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'zsh-autoconfig.js').write_text('pref("general.config.filename", "zsh-install.cfg");\npref("general.config.obscure_value", 0);\npref("general.config.sandbox_enabled", false);\n')
    shutil.copyfile(root / 'tests/runtime/install.cfg', base / 'zsh-install.cfg')
env = dict(os.environ, MOZ_NO_REMOTE='1', MOZ_DISABLE_CONTENT_SANDBOX='1', MOZ_CRASHREPORTER_DISABLE='1')
env['ZSH_TEST_XPIS'] = '|'.join(str((root / name).resolve()) for name in os.sys.argv[1:])
command = ['xvfb-run', '-a', str(binary / 'zotero'), '-no-remote', '-profile', str(profile), '-ZoteroDebugText']
with (out / 'runtime-console.log').open('w') as log:
    try:
        run = subprocess.run(command, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=110)
        print('Zotero process exit:', run.returncode)
    except subprocess.TimeoutExpired:
        print('Zotero runtime timed out; inspect test-results/runtime-console.log')
        raise
if report.exists():
    print(report.read_text())
    result = json.loads(report.read_text())
    assert not result.get('error'), result
    current = result['cases'][-1]
    assert current.get('installed') and current.get('isActive') and current.get('menuPresent'), current
    assert current.get('titleHighlight') == 'Cell' and current.get('creatorHighlight') == 'Cell', current
    assert current.get('infoHighlightCount', 0) >= 1 and current.get('infoClearWorked'), current
else:
    print((out / 'runtime-console.log').read_text()[-10000:])
    raise SystemExit('No runtime report produced')
