# Cashfree MCP Library

A modern JavaScript/TypeScript library for integrating with [Cashfree](https://www.cashfree.com/) payment services using the Model Context Protocol (MCP).

---

## Overview

The Cashfree MCP library provides a simple and efficient way to interact with Cashfree's Payment Gateway, Payouts, and Verification APIs. It abstracts away the complexity of API calls and provides a clean, extensible interface for your applications.

---

## Features

- MCP

---

## Installation

### Clone the Repository

```bash
git clone https://github.com/cashfree/cashfree-mcp.git
cd cashfree-mcp
```

### Install Dependencies

```bash
npm install
```

---

## Requirements

- Node.js 14.x or higher
- A Cashfree account with valid API credentials

---

## Configuration

The library is configured using environment variables. Below is an example configuration (e.g., for use with a process manager or `.env` file):

```json
{
  "cashfree": {
    "command": "node",
    "args": ["/path/to/index.js"],
    "env": {
      "PAYMENTS_APP_ID": "YOUR_PG_CLIENT_ID",
      "PAYMENTS_APP_SECRET": "YOUR_PG_CLIENT_SECRET",
      "PAYOUTS_APP_ID": "YOUR_PAYOUTS_CLIENT_ID",
      "PAYOUTS_APP_SECRET": "YOUR_PAYOUTS_CLIENT_SECRET",
      "TWO_FA_PUBLIC_KEY_PEM_PATH": "/path/to/public_key.pem",
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

Set the following environment variables for each service:

**Payment Gateway:**
- `PAYMENTS_APP_ID`: Your Payment Gateway client ID
- `PAYMENTS_APP_SECRET`: Your Payment Gateway client secret

**Payouts:**
- `PAYOUTS_APP_ID`: Your Payouts client ID
- `PAYOUTS_APP_SECRET`: Your Payouts client secret
- `TWO_FA_PUBLIC_KEY_PEM_PATH`: Path to your 2FA public key (required only if 2FA is enabled)

**Verification (VRS):**
- `VRS_APP_ID`: Your VRS client ID
- `VRS_APP_SECRET`: Your VRS client secret
- `TWO_FA_PUBLIC_KEY_PEM_PATH`: Path to your 2FA public key (required only if 2FA is enabled)

#### Tools Configuration

- `TOOLS`: Comma-separated list of modules to enable. Available options:
  - `pg`: Payment Gateway APIs
  - `payouts`: Payouts APIs
  - `vrs`: Verification APIs

#### Environment

- `ENV`: Set to `"production"` for production environment, `"sandbox"` for sandbox (default: `"sandbox"`)

---

## Supported Modules

- **PG** - Payment Gateway APIs
- **Payouts** - Payouts APIs
- **VRS** - Verification APIs

Enable modules by including them in the `TOOLS` environment variable.

---

## Environment

By default, the library connects to Cashfree's sandbox environment. For production use, set `ENV` to `"production"`.

---

## Documentation

For detailed API documentation, visit the [Cashfree API Documentation](https://docs.cashfree.com/reference/).

---

## License

## Support

For support, contact [care@cashfree.com](mailto:care@cashfree.com) or raise an issue in the [GitHub repository](https://github.com/cashfree/cashfree-mcp).

---