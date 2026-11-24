import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const directory = resolve('dist');
const destination = resolve(directory, 'Ash-and-Iron.html');
const fromBuild = path => resolve(directory, path);
const input = await readFile(fromBuild('index.html'), 'utf8');
const js = input.match(/<script type="module"[^>]*\ssrc="([^"]+)"[^>]*><\/script>/);
const css = input.match(/<link rel="stylesheet"[^>]*\shref="([^"]+)"[^>]*>/);
const icon = input.match(/<link rel="icon"[^>]*\shref="([^"]+)"[^>]*>/);
if (!js || !css || !icon) throw new Error('Expected Vite script, stylesheet, and icon in dist/index.html.');

const stylesheetPath = fromBuild(css[1]);
let stylesheet = await readFile(stylesheetPath, 'utf8');
const types = { webp: 'image/webp', png: 'image/png', woff2: 'font/woff2', glb: 'model/gltf-binary', ogg: 'audio/ogg' };

async function asData(path) {
  const type = types[path.split('.').pop()];
  if (!type) throw new Error(`Unsupported asset type: ${path}`);
  return `data:${type};base64,${(await readFile(path)).toString('base64')}`;
}

for (const url of new Set(Array.from(stylesheet.matchAll(/url\((\.\.[^)]+)\)/g), match => match[1]))) {
  const data = await asData(resolve(dirname(stylesheetPath), url));
  stylesheet = stylesheet.replaceAll(`url(${url})`, `url(${data})`);
}

const script = (await readFile(fromBuild(js[1]), 'utf8')).replace(/<\/script/gi, '<\\/script');
const favicon = await asData(fromBuild(icon[1]));
const notices = await Promise.all([
  readFile(resolve('node_modules/three/LICENSE'), 'utf8'),
  ...['cinzel', 'inter'].map(family => readFile(fromBuild(`fonts/${family}-OFL.txt`), 'utf8')),
  ...((await readdir(fromBuild('licenses'))).sort()).map(name => readFile(fromBuild(`licenses/${name}`), 'utf8')),
]);
const filenames = (await readdir(fromBuild('game-assets'))).sort();
const embedded = {};
for (const name of filenames) embedded[name] = await asData(fromBuild(`game-assets/${name}`));
const result = input
  .replace(js[0], () => `<script type="module">\n${script}\n</script>`)
  .replace(css[0], () => `<style>\n${stylesheet}\n</style>`)
  .replace(icon[0], () => `<link rel="icon" href="${favicon}">`)
  .replace('</body>', () => `<script type="application/json" id="offline-assets">${JSON.stringify(embedded)}</script>
</body>`)
  .replace('</html>', () => `<!-- Third-party notices\n${notices.join('\n\n')}\n-->\n</html>`);

await writeFile(destination, result);
console.log(`Standalone build written to ${destination}`);
