// Standard react-native-config Jest mock (see their README): under Jest
// there is no native module to read the build-time .env from, so re-export
// process.env directly. Tests set process.env.API_BASE_URL etc. to override.
module.exports = process.env;
