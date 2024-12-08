import { findUpSync } from 'find-up';
import * as fs from 'node:fs';
import * as path from 'node:path';

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

const rootPackageJsonPath = findUpSync('package.json');
if (!rootPackageJsonPath) {
  throw new Error('Could not find package.json');
}

const rootDir = path.dirname(rootPackageJsonPath);
const overlayDir = path.join(rootDir, 'apps/prebuild-cli/overlays');
const outputDir = path.join(rootDir, 'dist/apps/prebuild-cli');

copyRecursiveSync(overlayDir, path.join(outputDir, 'overlays'));
