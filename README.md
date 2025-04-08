# Cashfree MCP Library

A modern JavaScript/TypeScript library for integrating with Cashfree's payment services using the Model Context Protocol (MCP).

## Overview

The Cashfree MCP library provides a simple and efficient way to interact with Cashfree's various payment APIs including Payment Gateway, Payouts, and Verification services. It abstracts away the complexity of API calls and provides a clean interface for your applications.

## Features

- MCP 

## Installation

```bash
npm install cashfree-mcp
```

## Requirements

- Node.js 14.x or higher
- A Cashfree account with API credentials

## Configuration

Create a `.env.json` file in your project root (or copy from the provided `.env.sample.json`):

```json
{
  "McpTools": {
    "PG": true,
    "PO": false,
    "VRS": false
  },
  "Cashfree Payment Gateway APIs - 2025-01-01": {
    "base_url": "https://api.cashfree.com/pg",
    "header": {
      "x-client-id": {
        "API_KEY": "YOUR_CLIENT_ID_HERE"
      },
      "x-client-secret": {
        "API_KEY": "YOUR_CLIENT_SECRET_HERE"
      }
    }
  }
}
```

## Usage



## Available Modules

The library supports the following Cashfree modules:

- **PG** - Payment Gateway APIs

Enable or disable them in your `.env.json` configuration.

## Environment

By default, the library connects to Cashfree's sandbox environment. For production use, initialize with the production server URL change in .env.json


## Documentation

For detailed API documentation, visit the [Cashfree API Documentation](https://docs.cashfree.com/reference/).

## License

MIT

## Support

For support, contact Cashfree support at care@cashfree.com or raise an issue in the GitHub repository.