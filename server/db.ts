import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Global error handler for the pool to prevent crashes on idle client errors
pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
  // Do not exit process
});

export const db = drizzle(pool, { schema });
