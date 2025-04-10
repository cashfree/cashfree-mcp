import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default configuration that will be overridden by CLI flags
const defaultConfig = {
  'Cashfree Payment Gateway APIs - 2025-01-01': {
    base_url: 'https://sandbox.cashfree.com/pg',
    header: {}
  }
};

export function readConfig() {
  // Return a copy of default config that will be modified by CLI flags
  return JSON.parse(JSON.stringify(defaultConfig));
}