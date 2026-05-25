const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

// Exclude Node.js-only packages from the bundle (they run on the backend, not the app)
config.resolver.blockList = [
  /node_modules\/@anthropic-ai\/sdk\/.*/,
];

// Provide empty shims for Node.js built-ins used by excluded packages
config.resolver.extraNodeModules = {
  'node:fs': require.resolve('./src/utils/emptyShim.js'),
  'node:path': require.resolve('./src/utils/emptyShim.js'),
  'node:os': require.resolve('./src/utils/emptyShim.js'),
  'node:crypto': require.resolve('./src/utils/emptyShim.js'),
};

module.exports = config;
