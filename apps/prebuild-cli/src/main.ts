import { program } from 'commander';
import { findUpSync } from 'find-up';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';

const PROJECT_NAME = 'HelloWorld';

program
  .option('-f --framework <framework>', 'Framework to use. One of: react-native, expo')
  .option('-p --platform <platform>', 'Platform to use. One of: android, ios, macos, windows')
// .option('-t, --template <char>', 'The framework template to use');

program.parse();

const options = program.opts();
// const limit = options.framework ? 1 : undefined;
console.log(options);
const selectedFramework = options.framework;

const stagingDir = path.join(process.cwd(), '.tmp');
const rootPackageJsonPath = findUpSync('package.json');
if (!rootPackageJsonPath) {
  throw new Error('Could not find package.json');
}
const rootDir = path.dirname(rootPackageJsonPath);
const rootPatchesDir = path.join(rootDir, 'patches');
const installDir = findUpSync('package.json', { cwd: __dirname });
const overlayDir = path.join(path.dirname(installDir), 'overlays');

// Helper function that allows calling external CLI commands
function run(command: string, cwd: string) {
  console.log(`Running command: ${command}`);
  execSync(command, { cwd, stdio: 'inherit' });
}

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

// Clean up any existing staging directory
if (fs.existsSync(stagingDir)) {
  fs.rmdirSync(stagingDir, { recursive: true });
}
// Make a staging directory under /tmp
fs.mkdirSync(stagingDir, { recursive: true });

// Create new project in the staging directory
// const cliTool = selectedFramework === 'react-native'
//   ? 'bun rnc-cli'
//   : 'bunx create-expo-app@latest';
// const template = options.template ?? selectedFramework === 'react-native'
//   ? ''
//   : '--template expo-template-blank-typescript';

const expoCreate = (projectName: string) =>
  `bunx create-expo-app@latest ${projectName} --yes --template expo-template-blank-typescript`;
const reactNativeCreate = (projectName: string) =>
  `bun run rnc-cli init ${projectName} --install-pods false --pm bun`;

const createCmd = selectedFramework === 'react-native'
  ? reactNativeCreate(PROJECT_NAME)
  : expoCreate(PROJECT_NAME)

run(createCmd, stagingDir);
const projectDir = path.join(stagingDir, PROJECT_NAME);
const projectPackageJsonPath = path.join(projectDir, 'package.json');

// Make a patches directory in the new project
const patchesDir = path.join(projectDir, 'patches');
// Copy the patches directory to the staging directory
fs.cpSync(rootPatchesDir, patchesDir, { recursive: true });
// Add patches to staging directory's package.json
const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));
const projectPackageJson = JSON.parse(fs.readFileSync(projectPackageJsonPath, 'utf8'));
projectPackageJson.patchedDependencies = rootPackageJson.patchedDependencies;
fs.writeFileSync(projectPackageJsonPath, JSON.stringify(projectPackageJson, null, 2));

// PLATFORM-SPECIFIC
const prebuildTemplatePath = path.join(path.dirname(rootPackageJsonPath), 'packages', 'prebuild-expo');

// macOS

// Add macOS platform
if (options.platform === 'macos') {
  run('bun add react-native-macos@latest', projectDir);
  run('bun run react-native-macos-init', projectDir);
  copyRecursiveSync(overlayDir, projectDir);

  // copyRecursiveSync(path.join(projectDir, 'macos'), path.join(prebuildTemplatePath, 'macos'));
}

// Add Windows platform
if (options.platform === 'windows') {

  run('bun add react-native-windows@latest', projectDir);
  run('bun react-native init-windows --overwrite --template cpp-app', projectDir);
  copyRecursiveSync(overlayDir, projectDir);

  // copyRecursiveSync(path.join(projectDir, 'windows'), path.join(prebuildTemplatePath, 'windows'));
}


// #bun add react-native-macos@latest
// #bun run react-native-macos-init
// #cp -R ../../overlays/* .
// #pod install --project-directory=macos
