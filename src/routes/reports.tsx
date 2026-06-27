import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, FileText, AlertTriangle } from "lucide-react";
import { useCampScope } from "@/lib/session";
import {
  useCompanies,
  useCamps,
  useProjects,
  useManagers,
  useReportDailyDistribution,
  useReportBySupplier,
  useReportByLocation,
  useReportRequestComparison,
  useReportDuplicateEligibility,
} from "@/lib/hooks";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
  head: () => ({ meta: [{ title: "Reports — MyMeals" }] }),
});

type TabId = "daily" | "supplier" | "location" | "comparison" | "duplicate";

const TABS: { id: TabId; n: number; title: string; desc: string }[] = [
  { id: "daily", n: 1, title: "Daily Transaction", desc: "Meal distribution per worker for a selected date" },
  { id: "supplier", n: 2, title: "Reports by Supplier", desc: "Distribution-point meals by supplier, pivoted by date" },
  { id: "location", n: 3, title: "Reports by Location", desc: "Daily meal distribution for a camp / location" },
  { id: "comparison", n: 4, title: "Request Comparison", desc: "Food estimations vs the previous day (variance)" },
  { id: "duplicate", n: 5, title: "Duplicate / Eligibility", desc: "Invalid check-ins, duplicate scans and rule exceptions" },
];

const todayIso = new Date().toISOString().slice(0, 10);
const monthAgoIso = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);

const inputCls =
  "px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function ReportsPage() {
  const scope = useCampScope();
  const { data: companies = [] } = useCompanies();
  const { data: campsAll = [] } = useCamps();
  const { data: projectsAll = [] } = useProjects();
  const { data: allSuppliers = [] } = useManagers();

  const [tab, setTab] = useState<TabId>("daily");
  const [company, setCompany] = useState("all");
  const [date, setDate] = useState(todayIso);
  const [from, setFrom] = useState(monthAgoIso);
  const [to, setTo] = useState(todayIso);
  const [camp, setCamp] = useState("all");
  const [supplier, setSupplier] = useState("all");

  const companyParam = company === "all" ? undefined : company;
  const campParam = camp === "all" ? undefined : camp;
  const supplierParam = supplier === "all" ? undefined : supplier;

  // Parent company → sibling lists (camps / suppliers) filtered by it.
  const camps = useMemo(() => {
    let cs = scope ? campsAll.filter((c) => scope.includes(c.code)) : campsAll;
    if (companyParam) cs = cs.filter((c) => c.companyCode === company);
    return cs;
  }, [campsAll, scope, company, companyParam]);
  // Projects are scanning sites too — their code lives in Scan.campCode, so the
  // report `campCode` filter accepts a project code directly (no scope filter,
  // mirroring the Devices picker).
  const projects = useMemo(
    () => (companyParam ? projectsAll.filter((p) => p.companyCode === company) : projectsAll),
    [projectsAll, company, companyParam],
  );
  const suppliers = useMemo(
    () => (companyParam ? allSuppliers.filter((s) => s.companyCode === company) : allSuppliers),
    [allSuppliers, company, companyParam],
  );

  function onCompany(v: string) {
    setCompany(v);
    setCamp("all");
    setSupplier("all");
  }

  const daily = useReportDailyDistribution({ date, companyCode: companyParam, campCode: campParam });
  const bySupplier = useReportBySupplier({ from, to, companyCode: companyParam, campCode: campParam, supplierId: supplierParam });
  const byLocation = useReportByLocation({ from, to, companyCode: companyParam, campCode: campParam });
  const comparison = useReportRequestComparison({ from, to, companyCode: companyParam, supplierId: supplierParam });
  const duplicate = useReportDuplicateEligibility({ from, to, companyCode: companyParam, campCode: campParam });

  // Build a [headers, ...rows] matrix for the Excel export per tab.
  const exportMatrix = useMemo<(string | number)[][]>(() => {
    if (tab === "daily") {
      const rows = daily.data?.rows ?? [];
      return [
        ["Company", "Employee ID", "Employee Name", "Breakfast", "Lunch", "Dinner"],
        ...rows.map((r) => [r.company, r.employeeId, r.name, r.breakfast || "—", r.lunch || "—", r.dinner || "—"]),
      ];
    }
    if (tab === "supplier") {
      const d = bySupplier.data;
      if (!d) return [];
      const nm = new Map(d.camps.map((c) => [c.code, c.name]));
      const rows = supplierStackedRows(d);
      return [
        ["Date", "Distribution Point", "Breakfast", "Lunch", "Dinner", "Total"],
        ...rows.map((r) => [r.date, `${r.code} — ${nm.get(r.code) ?? ""}`, r.breakfast, r.lunch, r.dinner, r.total]),
      ];
    }
    if (tab === "location") {
      const rows = byLocation.data?.rows ?? [];
      return [
        ["Date", "Location", "Breakfast", "Lunch", "Dinner"],
        ...rows.map((r) => [r.date, `${r.location} — ${r.locationName}`, r.breakfast, r.lunch, r.dinner]),
      ];
    }
    if (tab === "comparison") {
      const rows = comparison.data?.rows ?? [];
      return [
        ["Date", "Supplier", "Site", "Meal", "Requested Yesterday", "Requested Today", "Variance", "% Change"],
        ...rows.map((r) => [
          r.date, r.supplier, r.site, r.meal,
          r.requestedYesterday ?? "—", r.requestedToday,
          r.variance ?? "—", r.pctChange === null ? "—" : `${r.pctChange}%`,
        ]),
      ];
    }
    const rows = duplicate.data?.rows ?? [];
    return [
      ["Worker ID", "Actual Location", "Scan Location", "Status", "Reason", "Meal", "Date", "Scan Time"],
      ...rows.map((r) => [r.workerId, r.actualLocation, r.scanLocation, r.status, r.reason, r.meal, r.date, r.time]),
    ];
  }, [tab, daily.data, bySupplier.data, byLocation.data, comparison.data, duplicate.data]);

  const companyLabel = company === "all" ? "All companies" : companies.find((c) => c.code === company)?.name ?? company;
  const campLabel =
    camp === "all"
      ? null
      : [...projects, ...camps].find((s) => s.code === camp)?.name ?? camp;

  // Headline KPI cards rendered at the top of the styled PDF, per report.
  const summaryCards = useMemo<{ label: string; value: string }[]>(() => {
    if (tab === "daily") {
      const rows = daily.data?.rows ?? [];
      const cnt = (k: "breakfast" | "lunch" | "dinner") => rows.filter((r) => r[k]).length;
      return [
        { label: "Employees", value: String(rows.length) },
        { label: "Breakfast", value: String(cnt("breakfast")) },
        { label: "Lunch", value: String(cnt("lunch")) },
        { label: "Dinner", value: String(cnt("dinner")) },
      ];
    }
    if (tab === "supplier") {
      const rows = bySupplier.data ? supplierStackedRows(bySupplier.data) : [];
      const sum = (k: "breakfast" | "lunch" | "dinner" | "total") =>
        rows.reduce((a, r) => a + (r[k] || 0), 0);
      return [
        { label: "Breakfast", value: String(sum("breakfast")) },
        { label: "Lunch", value: String(sum("lunch")) },
        { label: "Dinner", value: String(sum("dinner")) },
        { label: "Total Meals", value: String(sum("total")) },
      ];
    }
    if (tab === "location") {
      const rows = byLocation.data?.rows ?? [];
      const sum = (k: "breakfast" | "lunch" | "dinner") => rows.reduce((a, r) => a + (r[k] || 0), 0);
      return [
        { label: "Days", value: String(new Set(rows.map((r) => r.date)).size) },
        { label: "Breakfast", value: String(sum("breakfast")) },
        { label: "Lunch", value: String(sum("lunch")) },
        { label: "Dinner", value: String(sum("dinner")) },
      ];
    }
    if (tab === "comparison") {
      const rows = comparison.data?.rows ?? [];
      const today = rows.reduce((a, r) => a + (r.requestedToday || 0), 0);
      const yest = rows.reduce((a, r) => a + (r.requestedYesterday || 0), 0);
      return [
        { label: "Line Items", value: String(rows.length) },
        { label: "Requested Today", value: String(today) },
        { label: "Req. Yesterday", value: String(yest) },
        { label: "Net Variance", value: `${today - yest > 0 ? "+" : ""}${today - yest}` },
      ];
    }
    const rows = duplicate.data?.rows ?? [];
    const dup = rows.filter((r) => r.severity === "duplicate").length;
    return [
      { label: "Exceptions", value: String(rows.length) },
      { label: "Duplicates", value: String(dup) },
      { label: "Not Eligible", value: String(rows.length - dup) },
    ];
  }, [tab, daily.data, bySupplier.data, byLocation.data, comparison.data, duplicate.data]);

  function exportExcel() {
    if (exportMatrix.length === 0) return;
    const ws = XLSX.utils.aoa_to_sheet(exportMatrix);
    const wb = XLSX.utils.book_new();
    const meta = TABS.find((t) => t.id === tab)!;
    XLSX.utils.book_append_sheet(wb, ws, meta.title.slice(0, 28));
    const range = tab === "daily" ? date : `${from}_to_${to}`;
    XLSX.writeFile(wb, `${meta.title.replace(/\s+/g, "_")}_${range}.xlsx`);
  }

  async function exportPdf() {
    if (exportMatrix.length <= 1) return;
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const meta = TABS.find((t) => t.id === tab)!;
    const landscape = exportMatrix[0].length > 6;
    const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 26;
    // NB: jsPDF's built-in Helvetica is WinAnsi — it can't render "→" (prints
    // garbage), so use an en dash for the range separator.
    const rangeLabel = tab === "daily" ? fmtDate(date) : `${fmtDate(from)} – ${fmtDate(to)}`;
    const generated = new Date().toLocaleString(undefined, {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const initials = (companyLabel.match(/\b[A-Za-z]/g) || []).slice(0, 2).join("").toUpperCase() || "CO";

    // Palette
    type RGB = [number, number, number];
    const navy: RGB = [30, 58, 138];
    const slate900: RGB = [15, 23, 42];
    const slate500: RGB = [100, 116, 139];
    const slate400: RGB = [148, 163, 184];
    const slate200: RGB = [226, 232, 240];
    const slate100: RGB = [241, 245, 249];
    const slate50: RGB = [248, 250, 252];
    const white: RGB = [255, 255, 255];
    const indigo: RGB = [79, 70, 229];
    const green: RGB = [22, 163, 74];
    const red: RGB = [220, 38, 38];
    const amber: RGB = [217, 119, 6];
    const violet: RGB = [124, 58, 237];
    const blue: RGB = [37, 99, 235];

    // Card theme + icon by metric label.
    type IconKind = "people" | "sun" | "dome" | "moon" | "bars";
    const themeFor = (label: string): { color: RGB; tint: RGB; icon: IconKind } => {
      const l = label.toLowerCase();
      if (l.includes("employee")) return { color: blue, tint: [239, 246, 255], icon: "people" };
      if (l.includes("breakfast")) return { color: green, tint: [240, 253, 244], icon: "sun" };
      if (l.includes("lunch")) return { color: amber, tint: [255, 251, 235], icon: "dome" };
      if (l.includes("dinner")) return { color: violet, tint: [245, 243, 255], icon: "moon" };
      if (l.includes("not eligible")) return { color: red, tint: [254, 242, 242], icon: "bars" };
      if (l.includes("duplicate")) return { color: amber, tint: [255, 251, 235], icon: "bars" };
      return { color: indigo, tint: [238, 242, 255], icon: "bars" };
    };

    // ── Vector icon helpers (no font glyphs — drawn with primitives) ──
    const glyph = (kind: IconKind, cx: number, cy: number, bg: RGB) => {
      doc.setFillColor(...white);
      doc.setDrawColor(...white);
      if (kind === "people") {
        doc.circle(cx - 3.2, cy - 2.4, 2.1, "F");
        doc.circle(cx + 3.2, cy - 2.4, 2.1, "F");
        doc.roundedRect(cx - 5.6, cy + 0.6, 4.8, 4.4, 1.6, 1.6, "F");
        doc.roundedRect(cx + 0.8, cy + 0.6, 4.8, 4.4, 1.6, 1.6, "F");
      } else if (kind === "sun") {
        doc.circle(cx, cy, 2.6, "F");
        doc.setLineWidth(1.1);
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI / 4) * i;
          doc.line(cx + Math.cos(a) * 4.2, cy + Math.sin(a) * 4.2, cx + Math.cos(a) * 6, cy + Math.sin(a) * 6);
        }
      } else if (kind === "dome") {
        doc.circle(cx, cy + 1, 4.3, "F");
        doc.setFillColor(...bg);
        doc.rect(cx - 6, cy + 1, 12, 6, "F"); // cut to a half-dome
        doc.setFillColor(...white);
        doc.roundedRect(cx - 6, cy + 1.2, 12, 1.8, 0.9, 0.9, "F"); // base
        doc.circle(cx, cy - 3.4, 0.9, "F"); // knob
      } else if (kind === "moon") {
        doc.circle(cx, cy, 4.4, "F");
        doc.setFillColor(...bg);
        doc.circle(cx + 2.5, cy - 1.2, 3.6, "F"); // carve crescent
      } else {
        doc.roundedRect(cx - 4.5, cy + 1.6, 9, 1.7, 0.8, 0.8, "F");
        doc.roundedRect(cx - 4.5, cy - 1.1, 6.5, 1.7, 0.8, 0.8, "F");
        doc.roundedRect(cx - 4.5, cy - 3.8, 4, 1.7, 0.8, 0.8, "F");
      }
    };
    // Brand logo: utensils on a navy disc.
    const drawLogo = (cx: number, cy: number, r: number) => {
      doc.setFillColor(...navy);
      doc.circle(cx, cy, r, "F");
      doc.setDrawColor(...white);
      doc.setFillColor(...white);
      doc.setLineWidth(1.1);
      const fx = cx - 3.6;
      doc.line(fx, cy - 5, fx, cy + 5); // fork handle
      doc.line(fx - 2, cy - 5, fx - 2, cy - 1.5);
      doc.line(fx + 2, cy - 5, fx + 2, cy - 1.5);
      doc.line(fx - 2, cy - 1.5, fx + 2, cy - 1.5);
      doc.ellipse(cx + 3.8, cy - 2.4, 1.7, 2.7, "F"); // spoon bowl
      doc.line(cx + 3.8, cy - 0.2, cx + 3.8, cy + 5); // spoon handle
    };
    // Tiny inline icons for the subtitle.
    const miniCal = (x: number, y: number) => {
      doc.setDrawColor(...slate400);
      doc.setLineWidth(0.7);
      doc.roundedRect(x, y, 7, 6.5, 1, 1, "S");
      doc.line(x, y + 2.2, x + 7, y + 2.2);
      doc.line(x + 2, y - 1, x + 2, y + 0.6);
      doc.line(x + 5, y - 1, x + 5, y + 0.6);
    };
    const miniBuilding = (x: number, y: number) => {
      doc.setDrawColor(...slate400);
      doc.setFillColor(...slate400);
      doc.setLineWidth(0.7);
      doc.roundedRect(x, y - 1, 7, 8, 0.6, 0.6, "S");
      doc.rect(x + 1.4, y + 0.8, 1.2, 1.2, "F");
      doc.rect(x + 4.2, y + 0.8, 1.2, 1.2, "F");
      doc.rect(x + 1.4, y + 3.4, 1.2, 1.2, "F");
      doc.rect(x + 4.2, y + 3.4, 1.2, 1.2, "F");
    };

    const siteLabel = campLabel ?? "All locations";

    // ── Top header (logo, title, subtitle, company chip) — repeats per page ──
    const drawHeader = () => {
      // Logo badge + title
      drawLogo(margin + 15, 50, 15);
      const titleX = margin + 38;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.setTextColor(...navy);
      doc.text(meta.title.toUpperCase(), titleX, 47);

      // Subtitle: [cal] date   [bldg] site
      const sy = 62;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...slate500);
      miniCal(titleX, sy - 6);
      doc.text(rangeLabel, titleX + 11, sy);
      let nx = titleX + 11 + doc.getTextWidth(rangeLabel) + 12;
      miniBuilding(nx, sy - 6);
      doc.text(siteLabel, nx + 11, sy);

      // Company chip, right-aligned: [II] Company Name
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      const labelW = doc.getTextWidth(companyLabel);
      const chipH = 30;
      const chipW = 7 + 22 + 8 + labelW + 12;
      const chipX = pageW - margin - chipW;
      const chipY = 35;
      doc.setFillColor(...slate50);
      doc.setDrawColor(...slate200);
      doc.setLineWidth(0.8);
      doc.roundedRect(chipX, chipY, chipW, chipH, 7, 7, "FD");
      doc.setFillColor(...white);
      doc.setDrawColor(...slate200);
      doc.roundedRect(chipX + 7, chipY + 4, 22, 22, 4, 4, "FD");
      doc.setTextColor(...indigo);
      doc.setFontSize(8);
      doc.text(initials, chipX + 7 + 11, chipY + 18, { align: "center" });
      doc.setTextColor(...slate900);
      doc.setFontSize(9);
      doc.text(companyLabel, chipX + 7 + 22 + 8, chipY + 19);
    };

    // ── KPI cards (page 1 only) — icon disc, label, big coloured value ──
    const cardsTop = 84;
    const cardsH = 88;
    const drawCards = () => {
      const n = summaryCards.length;
      if (!n) return;
      const gap = 12;
      const contentW = pageW - margin * 2;
      const cardW = (contentW - gap * (n - 1)) / n;
      summaryCards.forEach((c, i) => {
        const x = margin + i * (cardW + gap);
        const cx = x + cardW / 2;
        const t = themeFor(c.label);
        doc.setFillColor(...t.tint);
        doc.setDrawColor(...slate200);
        doc.setLineWidth(0.8);
        doc.roundedRect(x, cardsTop, cardW, cardsH, 8, 8, "FD");
        // icon disc
        doc.setFillColor(...t.color);
        doc.circle(cx, cardsTop + 23, 13, "F");
        glyph(t.icon, cx, cardsTop + 23, t.color);
        // label
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...slate500);
        doc.text(c.label.toUpperCase(), cx, cardsTop + 52, { align: "center" });
        // value
        doc.setFont("helvetica", "bold");
        doc.setFontSize(20);
        doc.setTextColor(...t.color);
        doc.text(c.value, cx, cardsTop + 75, { align: "center" });
      });
    };

    const head = [exportMatrix[0].map(String)];
    const body = exportMatrix.slice(1).map((r) => r.map((c) => String(c)));

    // Centre the numeric columns (header + value) per report.
    const numCols: Record<string, number[]> = {
      daily: [], supplier: [2, 3, 4, 5], location: [2, 3, 4], comparison: [4, 5, 6, 7], duplicate: [],
    };
    const centerSet = new Set(numCols[tab] ?? []);
    const columnStyles: Record<number, any> = {};
    centerSet.forEach((i) => (columnStyles[i] = { halign: "center" }));

    drawHeader();
    drawCards();

    autoTable(doc, {
      head,
      body,
      theme: "plain",
      startY: cardsTop + cardsH + 18,
      margin: { top: 92, bottom: 40, left: margin, right: margin },
      styles: {
        font: "helvetica", fontSize: 9, textColor: [51, 65, 85],
        cellPadding: { top: 10, right: 8, bottom: 10, left: 8 }, overflow: "linebreak", valign: "middle",
      },
      headStyles: {
        fillColor: navy, textColor: white, fontStyle: "bold", fontSize: 8,
        cellPadding: { top: 9, right: 8, bottom: 9, left: 8 },
      },
      alternateRowStyles: { fillColor: slate50 },
      columnStyles,
      didParseCell: (d: any) => {
        // Force centre on numeric columns for BOTH header and body (columnStyles
        // alone wasn't reliably centring the navy header text).
        if (centerSet.has(d.column.index)) d.cell.styles.halign = "center";
        if (d.section !== "body") return;
        // Duplicate report — colour the Status column by severity.
        if (tab === "duplicate" && d.column.index === 3) {
          const s = String(d.cell.raw).toLowerCase();
          d.cell.styles.textColor = s.includes("duplicate") ? amber : red;
          d.cell.styles.fontStyle = "bold";
        }
        // Comparison report — colour Variance / % Change by sign.
        if (tab === "comparison" && (d.column.index === 6 || d.column.index === 7)) {
          const v = parseFloat(String(d.cell.raw));
          if (!Number.isNaN(v) && v !== 0) d.cell.styles.textColor = v > 0 ? green : red;
        }
      },
      didDrawCell: (d: any) => {
        // Thin horizontal separators between body rows (no vertical grid lines).
        if (d.section !== "body") return;
        const x2 = d.cell.x + d.cell.width;
        const yB = d.cell.y + d.cell.height;
        doc.setDrawColor(...slate100);
        doc.setLineWidth(0.6);
        doc.line(d.cell.x, yB, x2, yB);
      },
      didDrawPage: (d: any) => {
        // Header repeats on every page; cards only on the first.
        if (d.pageNumber > 1) drawHeader();
        // ── Footer ──
        doc.setDrawColor(...blue);
        doc.setLineWidth(0.8);
        doc.line(margin, pageH - 30, pageW - margin, pageH - 30);
        // small doc icon
        doc.setDrawColor(...slate400);
        doc.setLineWidth(0.7);
        doc.roundedRect(margin, pageH - 24, 8, 9, 1, 1, "S");
        doc.line(margin + 2, pageH - 21, margin + 6, pageH - 21);
        doc.line(margin + 2, pageH - 19, margin + 6, pageH - 19);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...slate400);
        doc.text(`Generated on: ${generated}`, margin + 13, pageH - 17);
        doc.text("CONFIDENTIAL REPORT  •  MYMEALS", pageW / 2, pageH - 17, { align: "center" });
      },
    });

    // Page "X of Y" — written after all pages exist.
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...slate400);
      doc.text(`PAGE ${i} OF ${total}`, pageW - margin, pageH - 17, { align: "right" });
    }

    const range = tab === "daily" ? date : `${from}_to_${to}`;
    doc.save(`${meta.title.replace(/\s+/g, "_")}_${range}.pdf`);
  }

  const showDate = tab === "daily";
  const showRange = !showDate;
  const showCamp = tab === "daily" || tab === "location" || tab === "duplicate";
  const showSupplier = tab === "supplier" || tab === "comparison";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Integrated Reports Suite</div>
          <h1 className="font-display text-2xl font-bold tracking-tight mt-1">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Transactional performance and volume metrics under the selected Company filter.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportPdf}
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold hover:bg-secondary/80"
          >
            <FileText className="size-4" /> Download PDF
          </button>
          <button
            onClick={exportExcel}
            className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shadow-glow hover:opacity-95"
          >
            <Download className="size-4" /> Export Excel
          </button>
        </div>
      </div>

      {/* Report tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`text-left rounded-xl border px-4 py-3 transition w-[calc(50%-0.25rem)] sm:w-auto sm:min-w-[170px] ${
              tab === t.id
                ? "border-primary/40 bg-primary/10"
                : "border-border bg-card hover:border-primary/30"
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className={`grid size-5 place-items-center rounded-md text-[11px] ${tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{t.n}</span>
              {t.title}
            </div>
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.desc}</div>
          </button>
        ))}
      </div>

      {/* Filter bar — Company is the parent; the rest are siblings. */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-end gap-3">
        <Labeled label="Company">
          <select value={company} onChange={(e) => onCompany(e.target.value)} className={inputCls}>
            <option value="all">All companies</option>
            {companies.map((co) => (
              <option key={co.id} value={co.code}>{co.code} — {co.name}</option>
            ))}
          </select>
        </Labeled>
        {showDate && (
          <Labeled label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </Labeled>
        )}
        {showRange && (
          <>
            <Labeled label="From">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
            </Labeled>
            <Labeled label="To">
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
            </Labeled>
          </>
        )}
        {showCamp && (
          <Labeled label={tab === "location" ? "Location" : "Camp / Project"}>
            <select value={camp} onChange={(e) => setCamp(e.target.value)} className={inputCls}>
              <option value="all">All locations</option>
              {projects.length > 0 && (
                <optgroup label="Projects">
                  {projects.map((p) => (
                    <option key={`p-${p.id}`} value={p.code}>{p.code} — {p.name}</option>
                  ))}
                </optgroup>
              )}
              {camps.length > 0 && (
                <optgroup label="Camp Locations">
                  {camps.map((c) => (
                    <option key={`c-${c.id}`} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </Labeled>
        )}
        {showSupplier && (
          <Labeled label="Supplier">
            <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputCls}>
              <option value="all">All suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Labeled>
        )}
      </div>

      {/* Report body */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-card">
        {tab === "daily" && <DailyTable rows={daily.data?.rows ?? []} loading={daily.isLoading} />}
        {tab === "supplier" && <SupplierStacked data={bySupplier.data} loading={bySupplier.isLoading} />}
        {tab === "location" && <LocationTable rows={byLocation.data?.rows ?? []} loading={byLocation.isLoading} />}
        {tab === "comparison" && <ComparisonTable rows={comparison.data?.rows ?? []} loading={comparison.isLoading} />}
        {tab === "duplicate" && <DuplicateTable rows={duplicate.data?.rows ?? []} loading={duplicate.isLoading} from={from} to={to} />}
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground mb-1 block">{label}</span>
      {children}
    </label>
  );
}

const thL = "text-left px-4 py-3 font-medium";
const thR = "text-right px-4 py-3 font-medium";
const tdL = "px-4 py-2.5";
const tdR = "px-4 py-2.5 text-right tabular-nums";

function Empty({ cols, msg }: { cols: number; msg: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-12 text-center text-muted-foreground text-sm">{msg}</td>
    </tr>
  );
}

// ── Report 1 ─────────────────────────────────────────────────────────────
function DailyTable({ rows, loading }: { rows: import("@/lib/hooks").DailyDistRow[]; loading: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className={thL}>Company</th>
            <th className={thL}>Employee ID</th>
            <th className={thL}>Employee Name</th>
            <th className={thL}>Breakfast</th>
            <th className={thL}>Lunch</th>
            <th className={thL}>Dinner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.employeeId}-${i}`} className="border-t border-border hover:bg-secondary/30">
              <td className={tdL}>{r.company || "—"}</td>
              <td className={`${tdL} font-mono text-xs`}>{r.employeeId}</td>
              <td className={tdL}>{r.name}</td>
              <td className={tdL}>{r.breakfast || "—"}</td>
              <td className={tdL}>{r.lunch || "—"}</td>
              <td className={tdL}>{r.dinner || "—"}</td>
            </tr>
          ))}
          {rows.length === 0 && <Empty cols={6} msg={loading ? "Loading…" : "No meals distributed on this date."} />}
        </tbody>
      </table>
    </div>
  );
}

// ── Report 2 (stacked: one row per Date × distribution point) ─────────────
function supplierStackedRows(d: import("@/lib/hooks").BySupplierData) {
  return d.rows.flatMap((r) =>
    Object.entries(r.perCamp)
      .map(([code, cell]) => ({ date: r.date, code, ...cell, total: cell.breakfast + cell.lunch + cell.dinner }))
      .filter((x) => x.total > 0),
  );
}
function SupplierStacked({ data, loading }: { data: import("@/lib/hooks").BySupplierData | undefined; loading: boolean }) {
  const campName = new Map((data?.camps ?? []).map((c) => [c.code, c.name]));
  const rows = data ? supplierStackedRows(data) : [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className={thL}>Date</th>
            <th className={thL}>Distribution Point</th>
            <th className={thR}>Breakfast</th>
            <th className={thR}>Lunch</th>
            <th className={thR}>Dinner</th>
            <th className={thR}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.date}-${r.code}-${i}`} className="border-t border-border hover:bg-secondary/30">
              <td className={`${tdL} whitespace-nowrap`}>{fmtDate(r.date)}</td>
              <td className={tdL}>
                <span className="rounded-md bg-primary/10 text-primary text-xs font-medium px-2 py-0.5">{r.code}</span>
                <span className="text-muted-foreground text-xs ml-2">{campName.get(r.code)}</span>
              </td>
              <td className={tdR}>{r.breakfast}</td>
              <td className={tdR}>{r.lunch}</td>
              <td className={tdR}>{r.dinner}</td>
              <td className={`${tdR} font-semibold`}>{r.total}</td>
            </tr>
          ))}
          {rows.length === 0 && <Empty cols={6} msg={loading ? "Loading…" : "No served meals in this range."} />}
        </tbody>
      </table>
    </div>
  );
}

// ── Report 3 ─────────────────────────────────────────────────────────────
function LocationTable({ rows, loading }: { rows: import("@/lib/hooks").ByLocationRow[]; loading: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className={thL}>Date</th>
            <th className={thL}>Location</th>
            <th className={thR}>Breakfast</th>
            <th className={thR}>Lunch</th>
            <th className={thR}>Dinner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.date}-${r.location}-${i}`} className="border-t border-border hover:bg-secondary/30">
              <td className={`${tdL} whitespace-nowrap`}>{fmtDate(r.date)}</td>
              <td className={tdL}>
                <span className="rounded-md bg-primary/10 text-primary text-xs font-medium px-2 py-0.5">{r.location}</span>
                <span className="text-muted-foreground text-xs ml-2">{r.locationName}</span>
              </td>
              <td className={tdR}>{r.breakfast}</td>
              <td className={tdR}>{r.lunch}</td>
              <td className={tdR}>{r.dinner}</td>
            </tr>
          ))}
          {rows.length === 0 && <Empty cols={5} msg={loading ? "Loading…" : "No meals in this range."} />}
        </tbody>
      </table>
    </div>
  );
}

// ── Report 4 ─────────────────────────────────────────────────────────────
function ComparisonTable({ rows, loading }: { rows: import("@/lib/hooks").ComparisonRow[]; loading: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className={thL}>Date</th>
            <th className={thL}>Supplier</th>
            <th className={thL}>Site</th>
            <th className={thL}>Meal</th>
            <th className={thR}>Req. Yesterday</th>
            <th className={thR}>Req. Today</th>
            <th className={thR}>Variance</th>
            <th className={thR}>% Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const up = (r.variance ?? 0) > 0;
            const down = (r.variance ?? 0) < 0;
            return (
              <tr key={i} className="border-t border-border hover:bg-secondary/30">
                <td className={`${tdL} whitespace-nowrap`}>{fmtDate(r.date)}</td>
                <td className={tdL}>{r.supplier}</td>
                <td className={tdL}>{r.site}</td>
                <td className={tdL}>{r.meal}</td>
                <td className={tdR}>{r.requestedYesterday ?? "—"}</td>
                <td className={`${tdR} font-medium`}>{r.requestedToday}</td>
                <td className={`${tdR} ${up ? "text-success" : down ? "text-destructive" : ""}`}>
                  {r.variance === null ? "—" : `${r.variance > 0 ? "+" : ""}${r.variance}`}
                </td>
                <td className={`${tdR} ${up ? "text-success" : down ? "text-destructive" : ""}`}>
                  {r.pctChange === null ? "—" : `${r.pctChange > 0 ? "+" : ""}${r.pctChange}%`}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && <Empty cols={8} msg={loading ? "Loading…" : "No food estimations in this range."} />}
        </tbody>
      </table>
    </div>
  );
}

// ── Report 5 ─────────────────────────────────────────────────────────────
function DuplicateTable({ rows, loading, from, to }: { rows: import("@/lib/hooks").DuplicateRow[]; loading: boolean; from: string; to: string }) {
  return (
    <>
      <div className="px-4 py-3 border-b border-border text-xs text-muted-foreground flex items-center gap-2">
        <AlertTriangle className="size-3.5 text-warning" />
        Period: {fmtDate(from)} → {fmtDate(to)} · <span className="text-amber-500">duplicate</span> · <span className="text-destructive">not eligible</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className={thL}>Worker ID</th>
              <th className={thL}>Actual Location</th>
              <th className={thL}>Scan Location</th>
              <th className={thL}>Status</th>
              <th className={thL}>Reason</th>
              <th className={thL}>Meal</th>
              <th className={thL}>Date</th>
              <th className={thL}>Scan Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const tone =
                r.severity === "duplicate"
                  ? "bg-amber-500/10 hover:bg-amber-500/15"
                  : "bg-destructive/10 hover:bg-destructive/15";
              return (
                <tr key={i} className={`border-t border-border ${tone}`}>
                  <td className={`${tdL} font-mono text-xs`}>{r.workerId}</td>
                  <td className={tdL}>{r.actualLocation}</td>
                  <td className={tdL}>{r.scanLocation}</td>
                  <td className={tdL}>
                    <span className={`text-xs font-semibold ${r.severity === "duplicate" ? "text-amber-600 dark:text-amber-400" : "text-destructive"}`}>{r.status}</span>
                  </td>
                  <td className={`${tdL} text-muted-foreground`}>{r.reason}</td>
                  <td className={tdL}>{r.meal}</td>
                  <td className={`${tdL} whitespace-nowrap`}>{r.date}</td>
                  <td className={tdL}>{r.time}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <Empty cols={8} msg={loading ? "Loading…" : "No duplicate or ineligible scans in this range."} />}
          </tbody>
        </table>
      </div>
    </>
  );
}
