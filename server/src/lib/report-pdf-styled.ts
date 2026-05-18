// Renders ReportPreview HTML in a headless Chromium and returns the printed
// PDF as a Buffer. A single Browser instance is reused across runs because
// launching Chromium is expensive (~1s).

import puppeteer, { type Browser } from "puppeteer";
import { renderReportHtml, type RenderInput } from "./report-html.js";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browserPromise;
}

export async function buildStyledPdfBuffer(input: RenderInput): Promise<Buffer> {
  const html = renderReportHtml(input);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // setContent waits for "load" by default; printing happens against the
    // fully-rendered DOM. `domcontentloaded` would suffice since there are no
    // external assets, but `load` is safer.
    await page.setContent(html, { waitUntil: "load" });
    const buffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
    });
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}
