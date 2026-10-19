const fs = require('node:fs');
const path = require('node:path');

// EAS file environment variables provide a temporary path on the build worker.
// Local native builds can use the ignored Firebase client file at the root.
module.exports = ({ config }) => {
  const filename = process.env.GOOGLE_SERVICES_JSON || path.join(__dirname, 'google-services.json');
  if (process.env.GOOGLE_SERVICES_JSON && !fs.existsSync(filename)) {
    throw Error('GOOGLE_SERVICES_JSON must point to the Firebase Android client configuration file.');
  }
  if (!fs.existsSync(filename)) return config;
  const google = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!google.project_info?.project_number || !google.client?.some(client => client.client_info?.android_client_info?.package_name === config.android.package)) {
    throw Error('Firebase Android configuration must match com.aceradio.app. Use google-services.json, not a service-account private key.');
  }
  return { ...config, android: { ...config.android, googleServicesFile: filename } };
};
