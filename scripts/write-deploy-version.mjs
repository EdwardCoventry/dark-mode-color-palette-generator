import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

const APP_ID = 'color-palette-generator';
const outputPath = resolve('dist/version.json');

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  } catch {
    return 'unknown';
  }
}

const commit = process.env.COMMIT_REF || process.env.GITHUB_SHA || gitCommit();
const deployId = process.env.DEPLOY_ID || null;
const version = {
  schemaVersion: 1,
  appId: APP_ID,
  commit,
  buildId: process.env.BUILD_ID || deployId || commit,
  deployId,
  builtAt: new Date().toISOString(),
};

mkdirSync(dirname(outputPath), {recursive: true});
writeFileSync(outputPath, `${JSON.stringify(version, null, 2)}\n`);
console.log(`Wrote ${outputPath} for ${APP_ID} at ${commit}`);
