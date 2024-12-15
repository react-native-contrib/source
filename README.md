# react-native-contrib/source

Monorepo for all React Native contributions.

## Prebuild

### Updating the template

```bash
# Build the prebuild-cli
nx build prebuild-cli
# Run the prebuild-cli, add -d for a dry run
bun dist/apps/prebuild-cli/main.js -f expo -p macos
```

### Testing the template

```bash
cd dist/packages/prebuild-expo
npm pack
# Take note of the generated tarball's path

cd <TO_YOUR_PROJECT>
expo prebuild --template <PATH_TO_TARBALL> -p macos
expo prebuild --template <PATH_TO_TARBALL> -p windows
```
