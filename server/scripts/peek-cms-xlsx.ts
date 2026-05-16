// Peek at the CMS Sample Data spreadsheet.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";

const file = resolve(process.cwd(), "..", "references", "CMS Sample Data.xlsx");
const buf = readFileSync(file);
const wb = XLSX.read(buf, { type: "buffer" });

console.log("Sheets:", wb.SheetNames);
for (const sheet of wb.SheetNames) {
  const ws = wb.Sheets[sheet];
  const json = XLSX.utils.sheet_to_json(ws, { defval: null });
  console.log(`\n--- ${sheet} (${json.length} rows) ---`);
  console.log("First row keys:", json[0] ? Object.keys(json[0]) : "(empty)");
  console.log("First 3 rows:");
  console.log(JSON.stringify(json.slice(0, 3), null, 2));
}
