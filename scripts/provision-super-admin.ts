import dotenv from 'dotenv';
dotenv.config();

import { provisionInitialSuperAdmin } from '../server/services/provisionSuperAdmin.ts';

async function main() {
  console.log('Starting idempotent Super Admin provisioning for Dharanidhar University Student Hub...');
  const result = await provisionInitialSuperAdmin('cli-script');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Provisioning failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
