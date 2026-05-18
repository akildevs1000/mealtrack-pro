// Server-side rendering of the frontend's ReportPreview component. We import
// the same React component the browser uses, render it with renderToStaticMarkup
// (no hydration markers), then wrap with a minimal HTML shell that Puppeteer
// will print. REPORT_CSS is embedded inline because the printed page has no
// network access to fetch it.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportPreview, REPORT_CSS } from "../ssr/ReportPreview.js";
import type {
  ReportType,
  ReportFilters,
  ReportData,
} from "../ssr/report-preview-types.js";

export type RenderInput = {
  type: ReportType;
  filters: ReportFilters;
  scopeLabel: string;
  data: ReportData;
};

export function renderReportHtml(input: RenderInput): string {
  const body = renderToStaticMarkup(
    React.createElement(ReportPreview, {
      type: input.type,
      filters: input.filters,
      scopeLabel: input.scopeLabel,
      data: input.data,
    }),
  );

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${input.type}</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    ${REPORT_CSS}
    .mo-report-wrap { background: #ffffff; padding: 0; border-radius: 0; }
    .mo-report {
      box-shadow: none;
      margin: 0 auto;
      width: 297mm !important;
      height: 210mm !important;
      min-height: 210mm !important;
      max-height: 210mm !important;
      overflow: hidden !important;
    }
    .mo-report + .mo-report { margin-top: 0; }
    .mo-report tbody tr { page-break-inside: avoid; break-inside: avoid; }
  </style>
</head>
<body>${body}</body>
</html>`;
}
