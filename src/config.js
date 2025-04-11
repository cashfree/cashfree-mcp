import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default configuration that will be overridden by environment variables
const defaultConfig = {
  'Cashfree Payment Gateway APIs - 2025-01-01': {
    base_url: 'https://sandbox.cashfree.com/pg',
    header: {}
  },
  'Cashfree Payout APIs - 2024-01-01': {
    header: {}
  },
  'Cashfree Verification API\'s. - 2023-12-18': {
    header: {}
  }
};

export function readConfig() {
  const config = JSON.parse(JSON.stringify(defaultConfig));
  
  // Set base_url based on environment
  if (process.env.ENV === 'production') {
    config['Cashfree Payment Gateway APIs - 2025-01-01'].base_url = 'https://api.cashfree.com/pg';
  }

  // Configure Payment Gateway API credentials
  if (process.env.PAYMENTS_APP_ID && process.env.PAYMENTS_APP_SECRET) {
    config['Cashfree Payment Gateway APIs - 2025-01-01'].header = {
      'x-client-id': process.env.PAYMENTS_APP_ID,
      'x-client-secret': process.env.PAYMENTS_APP_SECRET
    };
  }

  // Configure Payouts API credentials
  if (process.env.PAYOUTS_APP_ID && process.env.PAYOUTS_APP_SECRET) {
    config['Cashfree Payout APIs - 2024-01-01'].header = {
      'x-client-id': process.env.PAYOUTS_APP_ID,
      'x-client-secret': process.env.PAYOUTS_APP_SECRET
    };
  }

  // Configure VRS/SecureID API credentials
  if (process.env.VRS_APP_ID && process.env.VRS_APP_SECRET) {
    config['Cashfree Verification API\'s. - 2023-12-18'].header = {
      'x-client-id': process.env.VRS_APP_ID,
      'x-client-secret': process.env.VRS_APP_SECRET
    };
  }

  return config;
}