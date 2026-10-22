const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Keep the original logo as a vector, using Expo's SVG transformer.
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer/expo');
config.resolver.assetExts = config.resolver.assetExts.filter((extension) => extension !== 'svg');
config.resolver.sourceExts = [...config.resolver.sourceExts, 'svg'];

// Backend-only dotenv files are never application modules, even when recreated
// for maintenance while the development server is running.
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : existingBlockList ? [existingBlockList] : []),
  /[/\\]\.env\.r2(?:\.[^/\\]+)?$/,
];

module.exports = config;
