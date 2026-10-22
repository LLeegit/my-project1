import { build } from 'esbuild';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
await mkdir('build/content', { recursive: true });
await mkdir('dist', { recursive: true });
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
if (!manifest.applications?.zotero?.update_url) throw new Error('Zotero requires applications.zotero.update_url');
if (!manifest.applications.zotero.update_url.startsWith('https:')) throw new Error('Zotero requires HTTPS update security');
await build({ entryPoints: ['src/index.ts'], bundle: true, format: 'iife', globalName: 'ZSH', target: 'firefox140', outfile: 'build/content/plugin.js' });
for (const name of ['manifest.json', 'bootstrap.js']) await copyFile(name, `build/${name}`);
// Explicit allowlist: dependencies, test data and Zotero profiles never enter the XPI.
const packaging = `import zipfile,pathlib,hashlib,json
root=pathlib.Path('build')
version=json.loads(pathlib.Path('manifest.json').read_text())['version']
target=pathlib.Path('dist')/('zotero-search-highlighter-'+version+'.xpi')
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
 for name in ['manifest.json','bootstrap.js','content/plugin.js']:
  info=zipfile.ZipInfo(name,date_time=(2026,10,22,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED; info.external_attr=0o644<<16
  z.writestr(info,(root/name).read_bytes())
with zipfile.ZipFile(target) as z:
 assert z.testzip() is None
 assert json.loads(z.read('manifest.json'))['applications']['zotero']['strict_max_version']=='10.0.*'
digest=hashlib.sha256(target.read_bytes()).hexdigest()
pathlib.Path('dist/SHA256SUMS.txt').write_text(digest+'  '+target.name+'\\n')
print(str(target),target.stat().st_size,'bytes; SHA256',digest)
`;
execFileSync('python', ['-c', packaging], { stdio: 'inherit' });
await writeFile('dist/BUILD.txt', 'Built in Docker with Node ' + process.version + '\nTarget: Zotero 10.0.x / Firefox 140\n');
