import path from 'node:path';
export function config(overrides: Partial<Config> = {}): Config {
  const production = process.env.NODE_ENV === 'production';
  if (
    production &&
    (!process.env.DATABASE_URL || !process.env.COOKIE_SECRET || !process.env.APP_ORIGIN)
  )
    throw new Error('Produção exige DATABASE_URL, COOKIE_SECRET e APP_ORIGIN.');
  if (production && (process.env.COOKIE_SECRET?.length ?? 0) < 32)
    throw new Error('COOKIE_SECRET deve ter pelo menos 32 caracteres.');
  return {
    production,
    workerEnabled: process.env.WORKER_ENABLED !== 'false',
    port: Number(process.env.PORT ?? 3001),
    origin: process.env.APP_ORIGIN ?? 'http://localhost:5174',
    dataDir: path.resolve(process.env.DATA_DIR ?? '../../.data'),
    databaseUrl: process.env.DATABASE_URL,
    cookieSecret: process.env.COOKIE_SECRET ?? 'local-development-only-cookie-secret-32chars',
    smtpHost: process.env.SMTP_HOST,
    smtpPort: Number(process.env.SMTP_PORT ?? 1025),
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    mailFrom: process.env.MAIL_FROM ?? 'Atelier Desk <atelier@localhost>',
    s3Endpoint: process.env.S3_ENDPOINT,
    s3Region: process.env.S3_REGION ?? 'us-east-1',
    s3Bucket: process.env.S3_BUCKET ?? 'atelier-assets',
    s3AccessKey: process.env.S3_ACCESS_KEY,
    s3SecretKey: process.env.S3_SECRET_KEY,
    clamavHost: process.env.CLAMAV_HOST,
    clamavPort: Number(process.env.CLAMAV_PORT ?? 3310),
    ...overrides,
  };
}
export type Config = {
  production: boolean;
  workerEnabled: boolean;
  port: number;
  origin: string;
  dataDir: string;
  databaseUrl?: string;
  cookieSecret: string;
  smtpHost?: string;
  smtpPort: number;
  smtpUser?: string;
  smtpPass?: string;
  mailFrom: string;
  s3Endpoint?: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  clamavHost?: string;
  clamavPort: number;
};
