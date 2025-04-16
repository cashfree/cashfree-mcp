import path from 'path';
import { fileURLToPath } from 'url';
import { getPublicKeyFromPath } from './openapi/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URLS = {
  sandbox: "https://sandbox.cashfree.com",
  production: "https://api.cashfree.com"
};

// Default configuration that will be overridden by environment variables
const defaultConfig = {
  'Cashfree Payment Gateway APIs - 2025-01-01': {
    base_url: `${BASE_URLS.sandbox}/pg`,
    header: {}
  },
  'Cashfree Payout APIs - 2024-01-01': {
    base_url: `${BASE_URLS.sandbox}/payout`,
    header: {}
  },
  'Cashfree Verification API\'s. - 2023-12-18': {
    base_url: `${BASE_URLS.sandbox}/verification`,
    header: {}
  }
};

export function readConfig() {
  const config = JSON.parse(JSON.stringify(defaultConfig));
  const isProduction = process.env.ENV === 'production';

  // Set base_url based on environment
  const baseUrl = isProduction ? BASE_URLS.production : BASE_URLS.sandbox;
  Object.keys(config).forEach(api => {
    config[api].base_url = `${baseUrl}${config[api].base_url.split(BASE_URLS.sandbox)[1]}`;
  });

  // Helper function to set headers
  const setHeaders = (apiKey, appId, appSecret, publicKeyPath) => {
    if (appId && appSecret) {
      config[apiKey].header = {
        'x-client-id': appId,
        'x-client-secret': appSecret
      };
    }
    if (publicKeyPath) {
      config[apiKey].TWO_FA_PUBLIC_KEY = getPublicKeyFromPath(publicKeyPath);
    }
  };

  // Configure Payment Gateway API credentials
  setHeaders(
    'Cashfree Payment Gateway APIs - 2025-01-01',
    process.env.PAYMENTS_APP_ID,
    process.env.PAYMENTS_APP_SECRET
  );

  // Configure Payouts API credentials
  setHeaders(
    'Cashfree Payout APIs - 2024-01-01',
    process.env.PAYOUTS_APP_ID,
    process.env.PAYOUTS_APP_SECRET,
    process.env.TWO_FA_PUBLIC_KEY_PEM_PATH
  );

  // Configure Verification API credentials
  setHeaders(
    'Cashfree Verification API\'s. - 2023-12-18',
    process.env.VRS_APP_ID,
    process.env.VRS_APP_SECRET,
    process.env.TWO_FA_PUBLIC_KEY_PEM_PATH
  );

  return config;
}