
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function readConfig() {
  const configPath = path.join(__dirname, '../.env.json');
  const sampleConfigPath = path.join(__dirname, '../.env.sample.json');
  
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      // If .env.json doesn't exist, use sample config
      config = JSON.parse(fs.readFileSync(sampleConfigPath, 'utf8'));
    } else {
      throw error;
    }
  }
  
  return config;
}