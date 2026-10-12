import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { ADMIN_ROLES } from '@kaarx/shared';
import { env } from '../config/env';

const input = z
  .object({
    ADMIN_EMAIL: z.email(),
    ADMIN_PASSWORD: z.string().min(12),
    ADMIN_NAME: z.string().trim().min(2).max(80),
    ADMIN_ROLE: z.enum(ADMIN_ROLES).default('super_admin'),
  })
  .parse(process.env);

async function main(): Promise<void> {
  const ds = new DataSource({
    type: 'postgres',
    url: env.DATABASE_URL,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  });
  await ds.initialize();
  try {
    const passwordHash = await argon2.hash(input.ADMIN_PASSWORD);
    const rows: { id: string }[] = await ds.query(
      `insert into admin_users (email, password_hash, full_name, role)
       values ($1, $2, $3, $4::admin_role)
       on conflict ((lower(email))) do update
         set password_hash = excluded.password_hash,
             full_name = excluded.full_name,
             role = excluded.role,
             status = 'active'
       returning id`,
      [input.ADMIN_EMAIL, passwordHash, input.ADMIN_NAME, input.ADMIN_ROLE],
    );
    console.log(
      `Admin ${input.ADMIN_EMAIL} is ready (${input.ADMIN_ROLE}, id ${rows[0]?.id ?? 'unknown'})`,
    );
  } finally {
    await ds.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
