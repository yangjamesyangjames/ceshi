const FEISHU_TOKEN_URL = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "GET") {
      return json({ error: "Only GET is supported" }, 405);
    }

    const required = ["FEISHU_APP_ID", "FEISHU_APP_SECRET", "FEISHU_SPREADSHEET_TOKEN"];
    const missing = required.filter((key) => !env[key]);
    if (missing.length) {
      return json({ error: `Missing env: ${missing.join(", ")}` }, 500);
    }

    try {
      const tenantAccessToken = await getTenantAccessToken(env);
      const range = env.FEISHU_RANGE || "Sheet1!A:C";
      const values = await getSheetValues(env.FEISHU_SPREADSHEET_TOKEN, range, tenantAccessToken);
      const rules = valuesToRules(values);
      return json({ rules });
    } catch (error) {
      return json({ error: error.message }, 500);
    }
  },
};

async function getTenantAccessToken(env) {
  const response = await fetch(FEISHU_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: env.FEISHU_APP_ID,
      app_secret: env.FEISHU_APP_SECRET,
    }),
  });
  const data = await response.json();
  if (!response.ok || data.code !== 0) {
    throw new Error(data.msg || "Failed to get tenant_access_token");
  }
  return data.tenant_access_token;
}

async function getSheetValues(spreadsheetToken, range, tenantAccessToken) {
  const encodedRange = encodeURIComponent(range);
  const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${encodedRange}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${tenantAccessToken}` },
  });
  const data = await response.json();
  if (!response.ok || data.code !== 0) {
    throw new Error(data.msg || "Failed to read spreadsheet values");
  }
  return data.data?.valueRange?.values || [];
}

function valuesToRules(values) {
  if (!Array.isArray(values) || values.length < 2) return [];
  const headers = values[0].map(normalizeText);
  const imageIndex = findColumn(headers, ["图", "图片", "图片链接", "image"]);
  const contentIndex = findColumn(headers, ["意见内容", "审核意见", "反馈意见", "content", "opinion"]);
  const leaderIndex = findColumn(headers, ["姓名", "领导姓名", "提出人", "leader", "name"]);

  return values
    .slice(1)
    .map((row) => ({
      image: normalizeText(getCell(row, imageIndex)),
      content: normalizeText(getCell(row, contentIndex)),
      leader: normalizeText(getCell(row, leaderIndex)),
    }))
    .filter((rule) => rule.content);
}

function findColumn(headers, names) {
  return headers.findIndex((header) => names.includes(header));
}

function getCell(row, index) {
  return index >= 0 ? row[index] : "";
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

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
