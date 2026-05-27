import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
  console.warn('[Plaid] PLAID_CLIENT_ID or PLAID_SECRET not set — bank features disabled');
}

const configuration = new Configuration({
  basePath: PlaidEnvironments[(process.env.PLAID_ENV || 'sandbox') as keyof typeof PlaidEnvironments],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID || '',
      'PLAID-SECRET': process.env.PLAID_SECRET || '',
    },
  },
});

export const plaidClient = new PlaidApi(configuration);
export const plaidEnabled = !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
