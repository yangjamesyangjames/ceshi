import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const WIKI_TOKEN = "VjdSweNXciLQkRkz1juc5eHNnce";
const OUTPUT_FILE = "knowledge.js";

function runLarkCli(args) {
  const output = execFileSync("lark-cli", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 5,
  });
  return JSON.parse(output);
}

function normalizeText(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(" ").trim();
  if (typeof value === "object") {
    return normalizeText(value.text || value.link || value.url || value.name || "");
  }
  return "";
}

function findColumn(headers, names) {
  return headers.findIndex((header) => names.includes(header));
}

function valuesToRules(values) {
  if (!Array.isArray(values) || values.length < 2) return [];
  const headers = values[0].map(normalizeText);
  const imageIndex = findColumn(headers, ["图", "图片", "图片链接", "image"]);
  const contentIndex = findColumn(headers, ["意见内容", "审核意见", "反馈意见", "content", "opinion"]);
  const leaderIndex = findColumn(headers, ["姓名", "领导姓名", "提出人", "leader", "name"]);

  return values
    .slice(1)
    .map((row) => {
      const image = imageIndex >= 0 ? normalizeText(row[imageIndex]) : "";
      return {
        image,
        content: contentIndex >= 0 ? normalizeText(row[contentIndex]) : "",
        leader: leaderIndex >= 0 ? normalizeText(row[leaderIndex]) : "",
      };
    })
    .filter((rule) => rule.content);
}

const node = runLarkCli([
  "api",
  "GET",
  "/open-apis/wiki/v2/spaces/get_node",
  "--params",
  JSON.stringify({ token: WIKI_TOKEN }),
  "--as",
  "user",
]);

const spreadsheetToken = node.data?.node?.obj_token;
if (!spreadsheetToken || node.data?.node?.obj_type !== "sheet") {
  throw new Error("Wiki link does not point to a spreadsheet.");
}

const info = runLarkCli(["sheets", "+info", "--spreadsheet-token", spreadsheetToken, "--as", "user"]);
const sheetId = info.data?.sheets?.sheets?.[0]?.sheet_id;
if (!sheetId) throw new Error("No sheet found in spreadsheet.");

const sheet = runLarkCli([
  "sheets",
  "+read",
  "--spreadsheet-token",
  spreadsheetToken,
  "--sheet-id",
  sheetId,
  "--range",
  "A:C",
  "--as",
  "user",
]);

const values = sheet.data?.valueRange?.values || [];
const rules = valuesToRules(values);
const generatedAt = new Date().toISOString();

writeFileSync(
  OUTPUT_FILE,
  `window.FEISHU_KNOWLEDGE_RULES = ${JSON.stringify(rules, null, 2)};\nwindow.FEISHU_KNOWLEDGE_SYNCED_AT = ${JSON.stringify(generatedAt)};\n`,
);

console.log(`Synced ${rules.length} rules from Feishu spreadsheet.`);
