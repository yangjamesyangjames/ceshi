const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return json({ error: "Only POST is supported" }, 405);
    }

    if (!env.OPENAI_API_KEY) {
      return json({ error: "Missing OPENAI_API_KEY" }, 500);
    }

    try {
      const payload = await request.json();
      const report = await reviewDesign(payload, env);
      return json(report);
    } catch (error) {
      return json({ error: error.message }, 500);
    }
  },
};

async function reviewDesign(payload, env) {
  const brief = String(payload.brief || "").trim();
  const rules = Array.isArray(payload.rules) ? payload.rules.slice(0, 80) : [];
  const images = Array.isArray(payload.images) ? payload.images.filter(isDataImage).slice(0, 4) : [];

  if (!images.length) {
    throw new Error("No design images provided");
  }

  const model = env.OPENAI_MODEL || "gpt-4.1";
  const userContent = [
    {
      type: "input_text",
      text: [
        `审核目标：${brief || "未填写，按常规设计稿审核维度检查。"}`,
        "",
        "知识库意见：",
        JSON.stringify(rules, null, 2),
        "",
        "请结合上传图片和知识库意见审核设计稿。不要只做关键词匹配，要基于画面证据判断是否命中每条历史意见。",
        "重点判断：视觉颜色是否单调、文案与模块是否呼应、IP/任务形象是否需要品牌符号补充、品牌露出、信息层级、促销利益点、合规风险。",
        "每条 findings 必须包含：观察到的画面证据 + 对应风险 + 建议修改方式。",
      ].join("\n"),
    },
    ...images.map((image) => ({
      type: "input_image",
      image_url: image,
      detail: "high",
    })),
  ];

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: [
                "你是一个资深电商/活动设计稿审核助手。",
                "必须优先参考知识库里的领导意见，但不要机械关键词匹配，要根据图片实际画面判断是否命中。",
                "只返回 JSON，不要返回 Markdown。",
                "JSON 字段：result pass 或 adjust；score 0-100；findings 字符串数组；suggestions 字符串数组；references 数组，每项含 leader 和 content。",
                "findings 要具体指出画面问题和修改方向，避免空泛建议。",
                "如果知识库意见命中，请说明为什么命中；如果没有命中，不要硬套。",
                "references 只放真正相关的知识库意见。",
              ].join("\n"),
            },
          ],
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      max_output_tokens: 1200,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI API HTTP ${response.status}`);
  }

  return normalizeReport(parseResponseText(data), rules);
}

function parseResponseText(data) {
  const text = data.output_text || collectOutputText(data);
  if (!text) throw new Error("OpenAI response has no text output");
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

function collectOutputText(data) {
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text" && part.text)
    .map((part) => part.text)
    .join("\n");
}

function normalizeReport(report, rules) {
  const findings = Array.isArray(report.findings) && report.findings.length
    ? report.findings.map(String)
    : ["未识别到明确问题，请人工复核设计稿。"];
  const suggestions = Array.isArray(report.suggestions) && report.suggestions.length
    ? report.suggestions.map(String)
    : ["按审核意见逐项调整，并将新的判断标准沉淀进知识库。"];
  const references = Array.isArray(report.references) ? report.references : [];
  const score = Number.isFinite(Number(report.score)) ? Math.round(Number(report.score)) : 72;

  return {
    result: report.result === "pass" ? "pass" : "adjust",
    score: Math.max(0, Math.min(100, score)),
    findings,
    suggestions,
    references: references
      .map((reference) => ({
        leader: String(reference.leader || reference.name || "知识库"),
        content: String(reference.content || reference.opinion || ""),
      }))
      .filter((reference) => reference.content)
      .slice(0, 6),
    knowledgeCount: rules.length,
  };
}

function isDataImage(value) {
  return typeof value === "string" && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(value);
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
