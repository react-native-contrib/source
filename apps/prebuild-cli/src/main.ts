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
  .option('-d --dry-run', 'Dry run?')
// .option('-t, --template <char>', 'The framework template to use');

program.parse();

const options = program.opts();
// const limit = options.framework ? 1 : undefined;
console.log(options);
const selectedFramework = options.framework;
const selectedPlatforms = options.platform ?? ['android', 'ios', 'macos', 'windows'];

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

// Clean up any existing staging directory
if (fs.existsSync(stagingDir)) {
  fs.rmdirSync(stagingDir, { recursive: true });
}
// Make a staging directory under /tmp
fs.mkdirSync(stagingDir, { recursive: true });

const expoCreate = (projectName: string) =>
  `bunx create-expo-app@latest ${projectName} --template expo-template-blank-typescript`;
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

run(`bunx shx cp -R ${overlayDir}/expo-common/* ${projectDir}`, projectDir);

const generateIosAndroidProjects = () => {
  if (options.framework === 'expo') {
    const expoBareMinTemplatePath = path.dirname(require.resolve('expo-template-bare-minimum/package.json'));

    // run('bunx expo prebuild --clean --no-install', projectDir);
    run(`bunx shx cp -R ${expoBareMinTemplatePath}/android ${projectDir}`, projectDir);
    run(`bunx shx cp -R ${expoBareMinTemplatePath}/ios ${projectDir}`, projectDir);
    run(`bunx shx cp -R ${overlayDir}/expo-common/* ${projectDir}`, projectDir);
  }
};

const generateMacosProject = () => {
  run('bun add react-native-macos@latest', projectDir);
  run('bun run react-native-macos-init', projectDir);
  run(`bunx shx cp -R ${overlayDir}/${options.framework}-macos/* ${projectDir}`, projectDir);
  // copyRecursiveSync(overlayDir, projectDir);
};

const generateWindowsProject = () => {
  run('bun add react-native-windows@latest', projectDir);
  run('bun react-native init-windows --overwrite --template cpp-app', projectDir);
  // We have to copy the common overlay again because RNW rudely overwrites the metro.config.js
  run(`bunx shx cp -R ${overlayDir}/expo-common/* ${projectDir}`, projectDir);
  run(`bunx shx cp -R ${overlayDir}/${options.framework}-windows/* ${projectDir}`, projectDir);
};

const addMissingDeps = () => {
  run('bun add -D @react-native/metro-config', projectDir);
  run('bun add -D @rnx-kit/metro-config', projectDir);
}

// iOS and Android
if (selectedPlatforms.includes('android') || selectedPlatforms.includes('ios')) {
  generateIosAndroidProjects();
}

// macOS
if (selectedPlatforms.includes('macos')) {
  generateMacosProject();
}

// Windows
if (selectedPlatforms.includes('windows')) {
  generateWindowsProject();
}

addMissingDeps();

/**
 * SAVE FILES FROM STAGING DIRECTORY TO PACKAGE DIRECTORY
 */

if (options.dryRun) {
  console.log('Dry run complete');
  process.exit(0);
}

const prebuildTemplatePath = path.join(path.dirname(rootPackageJsonPath), 'packages', 'prebuild-expo');

const copyFromStagingToPrebuildTemplate = () => {
  const EXCLUDE_FILES = [
    '.expo',
    'node_modules',
    'patches',
    'bun.lockb',
    // We're going to handle package.json separately
    'package.json',
    'package-lock.json',
  ];
  // Copy base files
  fs.cpSync(projectDir, prebuildTemplatePath, {
    recursive: true,
    filter: (src: string) => {
      return !EXCLUDE_FILES.includes(path.basename(src));
    },
  });

  // Update package.json with scripts/deps/devDeps
  const projectPackageJson = JSON.parse(fs.readFileSync(projectPackageJsonPath, 'utf8'));
  const prebuildTemplatePackageJsonPath = path.join(prebuildTemplatePath, 'package.json');
  const prebuildTemplatePackageJson = JSON.parse(fs.readFileSync(prebuildTemplatePackageJsonPath, 'utf8'));
  prebuildTemplatePackageJson.scripts = {
    ...projectPackageJson.scripts,
    // Workaround because @expo/cli doesn't work for out-of-tree platforms yet
    start: 'npx @react-native-community/cli start',
    // Workaround because react-native-macos-init doesn't seem to add the run-macos script
    macos: 'npx @react-native-community/cli run-macos'
  };
  prebuildTemplatePackageJson.dependencies = projectPackageJson.dependencies;
  prebuildTemplatePackageJson.devDependencies = projectPackageJson.devDependencies;

  fs.writeFileSync(prebuildTemplatePackageJsonPath, JSON.stringify(prebuildTemplatePackageJson, null, 2));
};

copyFromStagingToPrebuildTemplate();
