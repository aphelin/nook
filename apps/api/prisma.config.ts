import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Optional here: `prisma generate` (run in image builds) needs no database.
    // Commands that do need one (migrate, db) fail clearly if it is missing.
    url: process.env.DATABASE_URL,
  },
});
