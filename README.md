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

The library is configured using environment variables in your project's configuration. Here's how to configure it:

```javascript
{
  "cashfree": {
    "command": "node",
    "args": ["/path/to/index.js"],
    "env": {
      "PAYMENTS_APP_ID": "YOUR_PG_CLIENT_ID",
      "PAYMENTS_APP_SECRET": "YOUR_PG_CLIENT_SECRET",
      "PAYOUTS_APP_ID": "YOUR_PAYOUTS_CLIENT_ID",
      "PAYOUTS_APP_SECRET": "YOUR_PAYOUTS_CLIENT_SECRET",
      "VRS_APP_ID": "YOUR_VRS_CLIENT_ID",
      "VRS_APP_SECRET": "YOUR_VRS_CLIENT_SECRET",
      "TOOLS": "pg,payouts,vrs",
      "ENV": "sandbox"
    }
  }
}
```

### Configuration Options

#### API Credentials
Configure your API credentials for each service:

Payment Gateway:
- `PAYMENTS_APP_ID`: Your Payment Gateway client ID
- `PAYMENTS_APP_SECRET`: Your Payment Gateway client secret

Payouts:
- `PAYOUTS_APP_ID`: Your Payouts client ID
- `PAYOUTS_APP_SECRET`: Your Payouts client secret

Verification (VRS):
- `VRS_APP_ID`: Your VRS client ID
- `VRS_APP_SECRET`: Your VRS client secret

#### Tools Configuration
- `TOOLS`: Comma-separated list of tools to enable (e.g. "pg,payouts,vrs")
Available options:
  - `pg`: Payment Gateway APIs
  - `payouts`: Payouts APIs
  - `vrs`: Verification APIs

#### Environment
- `ENV`: Set to "production" for production environment, "sandbox" for sandbox (default: "sandbox")

## Available Modules

The library supports the following Cashfree modules:

- **PG** - Payment Gateway APIs
- **Payouts** - Payouts APIs
- **VRS** - Verification APIs

Enable them by including them in the TOOLS environment variable.

## Environment

By default, the library connects to Cashfree's sandbox environment. For production use, set ENV to "production".

## Documentation

For detailed API documentation, visit the [Cashfree API Documentation](https://docs.cashfree.com/reference/).

## License

MIT

## Support

For support, contact Cashfree support at care@cashfree.com or raise an issue in the GitHub repository.