# CHANGELOG

## 1.2.0

- Migrated build system from npm to Bun for faster builds and better performance
- Added Biome for code formatting and linting (replaced Prettier)
- Added CI/CD workflows for automated building and publishing
- Added debug mode configuration option (`vscodeReactRefactor.enableDebug`)
- Optimized plugin activation to run only when needed
- Fixed whitespace sensitivity issues in JSX extraction
- Enhanced webpack configuration for better build output
- Updated README with CI/CD setup instructions

## 1.1.0

- Added `Extract to Class Component` Code action
- Added option to config Custom Babel plugins used by parser
- Added option to choose generated function type
- Added error message on parse error
- Updated @babel modules to the latest version
- Removed `Extract to File` Code action for now (due to VSCode changes),
workaround is to call manually `Move to new file` on the newly created Component
- Updated vscode to the latest and migrated extension to webpack
