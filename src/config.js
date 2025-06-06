/**
 * Reads and prepares configuration for Cashfree APIs (Payment, Payout, Verification).
 * Handles environment-based base URLs and API credentials.
 */

import { getPublicKeyFromPath } from './openapi/helpers.js';

const BASE_URLS = {
  sandbox: "https://sandbox.cashfree.com",
  production: "https://api.cashfree.com"
};

// Cashfree API identifiers
const PAYMENT_API_KEY      = 'Cashfree Payment Gateway APIs - 2025-01-01';
const PAYOUT_API_KEY       = 'Cashfree Payout APIs - 2024-01-01';
const VERIFICATION_API_KEY = 'Cashfree Verification API\'s. - 2023-12-18';

const DEFAULT_CONFIG = {
  [PAYMENT_API_KEY]: {
    base_url: `${BASE_URLS.sandbox}/pg`,
    header: {}
  },
  [PAYOUT_API_KEY]: {
    base_url: `${BASE_URLS.sandbox}/payout`,
    header: {}
  },
  [VERIFICATION_API_KEY]: {
    base_url: `${BASE_URLS.sandbox}/verification`,
    header: {}
  }
};

export function readConfig() {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  const isProduction = process.env.ENV === 'production';

  // Adjust base_url for sandbox vs production
  const baseUrl = isProduction ? BASE_URLS.production : BASE_URLS.sandbox;
  Object.keys(config).forEach(api => {
    config[api].base_url = `${baseUrl}${config[api].base_url.split(BASE_URLS.sandbox)[1]}`;
  });

  // Helper to configure API credentials
  const configureApiCredentials = ({ key, idVar, secretVar, pubKeyVar }) => {
    const appId = process.env[idVar];
    const appSecret = process.env[secretVar];
    if (appId && appSecret) {
      config[key].header = {
        'x-client-id': appId,
        'x-client-secret': appSecret
      };
    }
    if (pubKeyVar && process.env[pubKeyVar]) {
      config[key].TWO_FA_PUBLIC_KEY = getPublicKeyFromPath(process.env[pubKeyVar]);
    }
  };

  // Apply credentials for each API
  [
    { key: PAYMENT_API_KEY,      idVar: 'PAYMENTS_APP_ID', secretVar: 'PAYMENTS_APP_SECRET' },
    { key: PAYOUT_API_KEY,       idVar: 'PAYOUTS_APP_ID',  secretVar: 'PAYOUTS_APP_SECRET', pubKeyVar: 'TWO_FA_PUBLIC_KEY_PEM_PATH' },
    { key: VERIFICATION_API_KEY, idVar: 'SECUREID_APP_ID', secretVar: 'SECUREID_APP_SECRET', pubKeyVar: 'TWO_FA_PUBLIC_KEY_PEM_PATH' }
  ].forEach(configureApiCredentials);

  return config;
}