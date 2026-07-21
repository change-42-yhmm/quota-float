import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = process.cwd();
const outputDir = path.join(root, "outputs", "2026-07-14-dark-theme-feedback");
await fs.mkdir(outputDir, { recursive: true });

const headers = [
  "Time", "Problem Version", "Work Category", "Problem Type", "User Feedback",
  "Fix / Feature Plan", "Solved in Current Version", "Resolution Status", "Notes / Evidence", "Manual QA",
];

const rows = [
  ["2026-07-10", "0.1.3 Windows", "Bug Fix", "Window & Interaction", "Expanded card can lose visible rounded corners near the desktop edge.", "Compute expansion against current monitor bounds; open left/up when required and retain a 4 px transparent safe inset.", "Implemented; pending user confirmation", "Pending device confirmation", "Repeat screenshots are needed from the safe-inset build.", "Re-test right-edge and bottom-right docking on the packaged app."],
  ["2026-07-10", "0.1.3 Windows/macOS", "Bug Fix", "UI & Visual", "White edges or slight clipping can appear around the transparent card or orb.", "Use low-contrast strokes, background clipping, disabled resizing, and safe-inset geometry.", "Implemented; pending user confirmation", "Pending device confirmation", "Inspect against light and dark wallpapers.", "Check orb/card states at 100%, 125%, and 150% scale where available."],
  ["2026-07-10", "0.1.3 macOS", "Bug Fix", "Platform Compatibility", "macOS renders white square corners in transparent space outside rounded UI.", "Enable macOS private API, transparent window background, and safe inset.", "Implemented; pending macOS confirmation", "Pending macOS device confirmation", "Requires a Mac runtime test; CI build alone cannot validate rendering.", "Capture expanded and collapsed states on light and dark wallpapers."],
  ["2026-07-14", "0.1.5 Windows/macOS", "New Feature", "UI & Visual", "The visual tuner needs a dark preview for reviewing shared card and orb states.", "Add Light / Dark toggle and a theme=dark screenshot parameter. Scope dark tokens to the designer preview so production defaults do not change.", "Implemented; pending visual review", "Ready for QA", "Covers card, error, weekly fallback, and orb preview routes.", "Run npm.cmd run build; inspect designer preview and screenshot routes in both themes."],
  ["2026-07-14", "0.1.5 Windows/macOS", "New Feature", "Monetization Configuration", "No public donation link, QR code, or payment configuration was found.", "Record donation entry as pending configuration. Do not show an in-app control until a public destination and supported payment method are supplied.", "Awaiting configuration", "Blocked by missing destination", "Needed: public URL or QR image, payment method, display language, and regional/compliance copy.", "When configured, verify opening/scanning and include it in privacy and release review."],
];

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Feedback Tracker");
const guide = workbook.worksheets.add("Instructions");
sheet.showGridLines = false;
guide.showGridLines = false;

sheet.getRange("A1:J1").merge();
sheet.getRange("A1").values = [["Quota Float — User Feedback Tracker"]];
sheet.getRange("A1:J1").format = { fill: "#17324D", font: { bold: true, color: "#FFFFFF", size: 18 }, rowHeight: 34 };
sheet.getRange("A2:J3").merge();
sheet.getRange("A2").values = [["Scope: tool fixes, regression follow-up, and feature upgrades. This edition records the dark preview work and keeps donation support explicitly pending until a real public destination is configured."]];
sheet.getRange("A2:J3").format = { fill: "#FFF4D6", font: { bold: true, color: "#7C4A03" }, wrapText: true, rowHeight: 26 };
sheet.getRange("A5:J5").values = [headers];
sheet.getRange("A6:J10").values = rows;
sheet.getRange("A5:J5").format = { fill: "#24557A", font: { bold: true, color: "#FFFFFF" }, wrapText: true, rowHeight: 38 };
sheet.getRange("A6:J10").format = { fill: "#F8FAFC", font: { color: "#243447", size: 10 }, wrapText: true, rowHeight: 100, borders: { insideHorizontal: { style: "thin", color: "#D8E2EA" } } };
sheet.getRange("A6:A10").format.numberFormat = "yyyy-mm-dd";
[14, 22, 18, 28, 47, 62, 30, 29, 52, 52].forEach((width, index) => sheet.getRangeByIndexes(0, index, 10, 1).format.columnWidth = width);
sheet.freezePanes.freezeRows(5);
sheet.tables.add("A5:J10", true, "FeedbackTracker");
sheet.getRange("C6:C150").dataValidation = { rule: { type: "list", values: ["Bug Fix", "New Feature"] } };
sheet.getRange("H6:H150").dataValidation = { rule: { type: "list", values: ["Ready for QA", "Pending device confirmation", "Pending macOS device confirmation", "Blocked by missing destination"] } };
sheet.getRange("H6:H150").conditionalFormats.add("containsText", { text: "Ready for QA", format: { fill: "#DCFCE7", font: { bold: true, color: "#166534" } } });
sheet.getRange("H6:H150").conditionalFormats.add("containsText", { text: "Pending", format: { fill: "#FEF3C7", font: { bold: true, color: "#92400E" } } });
sheet.getRange("H6:H150").conditionalFormats.add("containsText", { text: "Blocked", format: { fill: "#FEE2E2", font: { bold: true, color: "#991B1B" } } });

guide.getRange("A1:B6").values = [
  ["Field", "Rule"],
  ["Work Category", "Use Bug Fix or New Feature."],
  ["Resolution Status", "Use a pending state until a device test or external configuration is available."],
  ["Donation entry", "Do not add a UI control before a public URL or QR image, payment method, language, and compliance copy are confirmed."],
  ["Visual QA", "Review card, error, weekly fallback, and orb in Light and Dark designer preview."],
  ["Scope", "Keep builds, packaging, and release workflow outside this tracker."],
];
guide.getRange("A1:B1").format = { fill: "#24557A", font: { bold: true, color: "#FFFFFF" } };
guide.getRange("A2:B6").format = { fill: "#F8FAFC", wrapText: true, borders: { insideHorizontal: { style: "thin", color: "#D8E2EA" } } };
guide.getRange("A1:A6").format.columnWidth = 28;
guide.getRange("B1:B6").format.columnWidth = 95;
guide.getRange("A1:B6").format.rowHeight = 40;

const inspection = await workbook.inspect({ kind: "table", sheetId: "Feedback Tracker", range: "A1:J10", include: "values,formulas", tableMaxRows: 10, tableMaxCols: 10 });
console.log(inspection.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 50 }, summary: "formula error scan" });
console.log(errors.ndjson);
const preview = await workbook.render({ sheetName: "Feedback Tracker", range: "A1:J10", scale: 0.8, format: "png" });
await fs.writeFile(path.join(outputDir, "feedback-tracker-preview.png"), new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, "quota-float-feedback-tracker-2026-07-14.xlsx"));
