// Builds two static variants for GitHub Pages:
//   dist/           -> the headset build (no emulator, fastest cold start on Quest)
//   dist/emulator/  -> same game with the IWER WebXR emulator injected, so it can be
//                      tried in any desktop browser (Meta Quest 3 emulation, hands mode)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const cfgPath = 'iwsdk.config.json';
const original = readFileSync(cfgPath, 'utf8');
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
try {
  if (!process.argv.includes('--emu-only')) run('npx vite build');
  const cfg = JSON.parse(original);
  cfg.dev = cfg.dev || {};
  cfg.dev.emulator = { ...(cfg.dev.emulator || {}), injectOnBuild: true, activation: 'always' };
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  run('npx vite build --outDir dist/emulator --emptyOutDir');
} finally {
  writeFileSync(cfgPath, original);
}
writeFileSync('dist/.nojekyll', '');
console.log('Built dist/ and dist/emulator/');
