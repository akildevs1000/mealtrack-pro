// SMTP delivery via nodemailer. Transport is built per-send from the singleton
// MailConfig DB row so credential changes take effect without a restart.

import nodemailer from "nodemailer";
import { prisma } from "./prisma.js";

export type MailAttachment = { filename: string; content: Buffer };

export type SendResult = { ok: boolean; detail: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;

export async function sendReportEmail(opts: {
  to: string[];
  subject: string;
  text: string;
  attachments: MailAttachment[];
}): Promise<SendResult> {
  const cfg = await p.mailConfig.findUnique({ where: { id: "default" } });
  if (!cfg) return { ok: false, detail: "No SMTP server configured" };
  if (opts.to.length === 0) return { ok: false, detail: "No recipient email addresses" };

  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    // Implicit TLS on 465; STARTTLS otherwise.
    secure: cfg.secure,
    auth: { user: cfg.username, pass: cfg.password },
  });

  try {
    const info = await transport.sendMail({
      from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
      to: opts.to.join(", "),
      subject: opts.subject,
      text: opts.text,
      attachments: opts.attachments.map((a) => ({ filename: a.filename, content: a.content })),
    });
    return { ok: true, detail: `Emailed ${opts.to.length} recipient(s) — ${info.messageId}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "SMTP send failed" };
  } finally {
    transport.close();
  }
}
