import { readFileSync } from "node:fs";
export function databaseTls(env: NodeJS.ProcessEnv = process.env) {
  const encoded = env.PGSSL_CA_BASE64;
  const ca = encoded ? Buffer.from(encoded, "base64").toString("utf8") : env.PGSSLROOTCERT ? readFileSync(env.PGSSLROOTCERT, "utf8") : null;
  if (!ca) return {};
  if (ca.length > 32768 || !ca.includes("-----BEGIN CERTIFICATE-----")) throw new Error("DATABASE_TLS_CONFIG");
  // node-postgres connection-string SSL flags override an explicit CA object.
  const url = new URL(env.DATABASE_URL!);
  if (["sslmode", "sslcert", "sslkey", "sslrootcert"].some(key => url.searchParams.has(key))) throw new Error("DATABASE_TLS_CONFIG");
  return { ssl: { ca, rejectUnauthorized: true } };
}
