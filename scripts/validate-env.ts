import { loadEnv } from './lib/env.js';

type Check = {
  name: string;
  ready: boolean;
  notes: string[];
};

const env = loadEnv();

const checks: Check[] = [
  {
    name: 'public-capability-collection',
    ready: true,
    notes: ['No secrets required.']
  },
  {
    name: 'official-login-harness',
    ready: Boolean(env.PSN_LOGIN_URL && env.PSN_EMAIL && env.PSN_PASSWORD),
    notes: [
      env.PSN_LOGIN_URL ? 'PSN_LOGIN_URL set' : 'Missing PSN_LOGIN_URL',
      env.PSN_EMAIL ? 'PSN_EMAIL set' : 'Missing PSN_EMAIL',
      env.PSN_PASSWORD ? 'PSN_PASSWORD set' : 'Missing PSN_PASSWORD',
      env.PSN_TOTP_SECRET ? 'PSN_TOTP_SECRET set (optional)' : 'PSN_TOTP_SECRET not set (optional)'
    ]
  },
  {
    name: 'static-bundle-inventory',
    ready: Boolean(env.OFFICIAL_PC_APP_BUNDLE),
    notes: [env.OFFICIAL_PC_APP_BUNDLE ? 'OFFICIAL_PC_APP_BUNDLE set' : 'Missing OFFICIAL_PC_APP_BUNDLE']
  },
  {
    name: 'network-metadata-capture',
    ready: Boolean(env.CAPTURE_INTERFACE),
    notes: [env.CAPTURE_INTERFACE ? `CAPTURE_INTERFACE=${env.CAPTURE_INTERFACE}` : 'CAPTURE_INTERFACE will default to en0']
  }
];

console.log('ps-wen environment readiness\n');
for (const check of checks) {
  console.log(`${check.ready ? '✓' : '•'} ${check.name}`);
  for (const note of check.notes) {
    console.log(`  - ${note}`);
  }
}
