import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import type { Config } from './config';
export async function sendMail(settings: Config, to: string, subject: string, text: string) {
  if (settings.smtpHost) {
    const transport = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpPort === 465,
      auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPass } : undefined,
    });
    await transport.sendMail({ from: settings.mailFrom, to, subject, text });
  } else {
    if (settings.production) throw new Error('SMTP não configurado.');
    const directory = path.join(settings.dataDir, 'mail');
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, crypto.randomUUID() + '.json'),
      JSON.stringify({ to, subject, text, createdAt: new Date().toISOString() }, null, 2),
      { mode: 0o600 },
    );
  }
}
