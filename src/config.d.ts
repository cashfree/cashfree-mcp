export interface ApiConfig {
    base_url?: string;
    header: {
        'x-client-id'?: string;
        'x-client-secret'?: string;
    };
}

export interface Config {
    'Cashfree Payment Gateway APIs - 2025-01-01': ApiConfig;
    'Cashfree Payout APIs - 2024-01-01': ApiConfig;
    'Cashfree Verification API\'s. - 2023-12-18': ApiConfig;
}

export declare function readConfig(): Config;