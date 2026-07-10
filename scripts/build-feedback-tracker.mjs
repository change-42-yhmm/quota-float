import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = process.cwd();
const outputName = process.env.FEEDBACK_TRACKER_NAME ?? "user-feedback-tracker-bilingual.xlsx";
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();

const cnRows = [
  ["时间", "问题版本", "问题类型", "用户反馈", "修复方案", "当前版本是否解决", "验证状态"],
  [
    "2026-07-10",
    "0.1.3 Windows",
    "窗口定位 / 边缘裁切",
    "Win 版本右侧有三个角没显示全，展开卡片靠近桌面右侧时会被屏幕边缘裁切。",
    "展开时根据当前显示器可见范围自动调整窗口位置，靠右时向左修正，靠底部时向上修正，确保 320x320 卡片完整可见。",
    "是",
    "自动测试通过，待 Windows 桌面包实机验收",
  ],
  [
    "2026-07-10",
    "0.1.3 Windows",
    "交互 / 展开方向",
    "软件默认向右展开；悬浮球拖到桌面右边后展开内容显示不出来，而且悬浮球不能视觉贴到最右边。",
    "不再固定向右展开；右侧空间不足时保留悬浮球右边缘并向左展开，底部空间不足时保留下边缘并向上展开。窗口会先移动到正确锚点再渲染展开卡片，避免从原左上角向右长大。悬浮球去掉 10px 内边距式留白，填满 100x100 窗口。",
    "是",
    "自动测试通过，待右侧和右下角拖拽验收",
  ],
  [
    "2026-07-10",
    "0.1.3 Windows",
    "视觉 / 透明窗口白边",
    "多名用户反馈悬浮球或展开卡片周围有白边。",
    "降低白色边框对比度，改为低对比外描边和轻内描边，增加 background-clip，并禁用用户手动调整窗口尺寸以减少透明窗口边缘伪影。",
    "是",
    "自动测试通过，待浅色和深色壁纸下实机验收",
  ],
];

const enRows = [
  ["Time", "Problem Version", "Problem Type", "User Feedback", "Fix", "Solved In Current Version", "Verification Status"],
  [
    "2026-07-10",
    "0.1.3 Windows",
    "Window positioning / edge clipping",
    "On Windows, three right-side corners can be partially hidden when the expanded card is near the desktop edge.",
    "Clamp the window inside the current monitor before showing the 320x320 card. Near the right edge it shifts left; near the bottom edge it shifts upward.",
    "Yes",
    "Automated tests passed; pending packaged Windows smoke test",
  ],
  [
    "2026-07-10",
    "0.1.3 Windows",
    "Interaction / expansion direction",
    "The widget expands to the right by default. When the orb is dragged to the desktop right edge, the expanded card can render off-screen, and the orb cannot visually reach the far right edge.",
    "Expansion is no longer direction-fixed. When right-side space is insufficient, the expanded card keeps the orb's right edge and opens left; when bottom-side space is insufficient, it keeps the bottom edge and opens upward. The window moves to the correct anchor before rendering the expanded card to avoid growing off-screen from the old top-left position. The collapsed orb fills its 100x100 window instead of using a 10px inner margin.",
    "Yes",
    "Automated tests passed; pending right-edge and bottom-right drag verification",
  ],
  [
    "2026-07-10",
    "0.1.3 Windows",
    "Visual polish / transparent-window white edge",
    "Several users report white edges around the floating orb or expanded card.",
    "Reduce high-contrast white borders, switch to subtle low-contrast strokes and inner strokes, add background clipping, and disable manual window resizing to reduce transparent-window edge artifacts.",
    "Yes",
    "Automated tests passed; pending smoke test on light and dark wallpapers",
  ],
];

function buildSheet(name, rows, widths) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  sheet.getRangeByIndexes(0, 0, rows.length, rows[0].length).values = rows;
  sheet.getRangeByIndexes(0, 0, 1, rows[0].length).format = {
    fill: "#1F4E79",
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
  };
  sheet.getRangeByIndexes(1, 0, rows.length - 1, rows[0].length).format = {
    fill: "#F7FAFC",
    font: { color: "#1F2937" },
    wrapText: true,
    borders: {
      insideHorizontal: { style: "thin", color: "#D9E2EC" },
      top: { style: "thin", color: "#B9C7D6" },
      bottom: { style: "thin", color: "#B9C7D6" },
    },
  };
  sheet.getRangeByIndexes(0, 0, rows.length, 1).format.numberFormat = "yyyy-mm-dd";
  for (let index = 0; index < widths.length; index += 1) {
    sheet.getRangeByIndexes(0, index, rows.length, 1).format.columnWidth = widths[index];
  }
  sheet.getRangeByIndexes(0, 0, rows.length, rows[0].length).format.rowHeight = 72;
  sheet.getRangeByIndexes(0, 0, 1, rows[0].length).format.rowHeight = 34;
  sheet.freezePanes.freezeRows(1);
  sheet.tables.add(`A1:G${rows.length}`, true, name.includes("中文") ? "ChineseFeedbackTable" : "EnglishFeedbackTable");
  return sheet;
}

buildSheet("中文反馈跟踪", cnRows, [14, 18, 22, 44, 58, 18, 30]);
buildSheet("Feedback Tracker EN", enRows, [14, 20, 28, 56, 66, 22, 34]);

const cnInspect = await workbook.inspect({
  kind: "table",
  sheetId: "中文反馈跟踪",
  range: "A1:G4",
  include: "values",
  tableMaxRows: 5,
  tableMaxCols: 7,
});
console.log(cnInspect.ndjson);

const errorScan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan",
});
console.log(errorScan.ndjson);

const cnPreview = await workbook.render({ sheetName: "中文反馈跟踪", range: "A1:G4", scale: 1, format: "png" });
await fs.writeFile(path.join(outputDir, "feedback-tracker-cn.png"), new Uint8Array(await cnPreview.arrayBuffer()));
const enPreview = await workbook.render({ sheetName: "Feedback Tracker EN", range: "A1:G4", scale: 1, format: "png" });
await fs.writeFile(path.join(outputDir, "feedback-tracker-en.png"), new Uint8Array(await enPreview.arrayBuffer()));

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(path.join(outputDir, outputName));
