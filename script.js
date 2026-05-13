const STORAGE_KEY = "design-review-assistant-v1";
const CONFIG_KEY = "design-review-assistant-config-v1";

const state = {
  rules: [],
  history: [],
  draftImages: [],
  ruleImages: [],
  feishuEndpoint: "",
  aiReviewEndpoint: "",
  analysisTimer: null,
  analysisStepTimer: null,
  uploadTimer: null,
};

const views = {
  reviewView: "设计稿审核",
  knowledgeView: "知识库",
  historyView: "审核历史",
};

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const sampleRules = [
  {
    id: createId(),
    leader: "市场 VP",
    content: "活动类设计稿第一屏要先看到用户利益点，标题、价格、行动按钮之间需要有明确层级，不能让装饰元素抢走注意力。",
    images: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: createId(),
    leader: "品牌总监",
    content: "品牌资产需要在视觉中心区域形成记忆点，Logo、品牌色和核心产品图至少有两个元素被明确识别。",
    images: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: createId(),
    leader: "法务与客户方",
    content: "绝对化表达、功效承诺、价格对比和数据结论都要有依据。没有证明材料时应改成更稳妥的描述。",
    images: [],
    createdAt: new Date().toISOString(),
  },
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function saveState() {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ rules: state.rules, history: state.history }),
    );
  } catch {
    // Some in-app browsers restrict localStorage on file:// pages. Keep the UI usable.
  }
}

function saveConfig() {
  try {
    window.localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({
        feishuEndpoint: state.feishuEndpoint,
        aiReviewEndpoint: state.aiReviewEndpoint,
      }),
    );
  } catch {
    // Keep the app usable if storage is unavailable.
  }
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.rules = Array.isArray(saved.rules) ? saved.rules : [];
    state.history = Array.isArray(saved.history) ? saved.history : [];
  } catch {
    state.rules = [];
    state.history = [];
  }
}

function loadConfig() {
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.feishuEndpoint = typeof saved.feishuEndpoint === "string" ? saved.feishuEndpoint : "";
    state.aiReviewEndpoint = typeof saved.aiReviewEndpoint === "string" ? saved.aiReviewEndpoint : "";
  } catch {
    state.feishuEndpoint = "";
    state.aiReviewEndpoint = "";
  }
}

function switchView(viewId) {
  $$(".view").forEach((view) => view.classList.toggle("is-visible", view.id === viewId));
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === viewId));
}

function showElement(selector) {
  $(selector).classList.remove("is-hidden");
}

function hideElement(selector) {
  $(selector).classList.add("is-hidden");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function readImages(fileList) {
  const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
  return Promise.all(files.map(fileToDataUrl));
}

function renderImages(container, images) {
  container.innerHTML = "";
  images.forEach((src) => {
    const node = $("#imageTemplate").content.cloneNode(true);
    node.querySelector("img").src = src;
    container.appendChild(node);
  });
}

function getRuleLeader(rule) {
  return rule.leader || rule.source || "未填写领导";
}

function getRuleContent(rule) {
  return rule.content || rule.title || "";
}

function extractKeywords(content) {
  return tokenize(content).filter((token) => token.length > 1);
}

function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[\s,，。！？!?:：;；、/\\|()[\]{}"'“”‘’.-]+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function calculateMatches({ brief }) {
  const text = `${brief}`.toLowerCase();
  const tokens = tokenize(text);

  return state.rules
    .map((rule) => {
      const ruleContent = getRuleContent(rule);
      const keywordHits = extractKeywords(ruleContent).filter((keyword) => text.includes(keyword.toLowerCase()));
      const contentTokens = tokenize(ruleContent);
      const semanticHits = contentTokens.filter((token) => tokens.includes(token));
      const score = keywordHits.length * 8 + semanticHits.length * 2;
      return { rule, keywordHits, semanticHits, score };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function buildReport(formData) {
  const matches = calculateMatches(formData);
  const penalty = matches.length * 16;
  const score = Math.max(35, Math.min(96, 92 - penalty + Math.min(matches.length * 3, 12)));
  const result = matches.length > 0 || score < 82 ? "adjust" : "pass";

  const findings = matches.length
    ? matches.map((item) => {
        const hitText = item.keywordHits.length ? `命中关键词：${item.keywordHits.join("、")}` : "根据项目描述匹配";
        return `【${getRuleLeader(item.rule)}】${hitText}。建议核对：${getRuleContent(item.rule)}`;
      })
    : [
        "没有明显命中历史意见。建议仍按品牌露出、信息层级、合规表述、交付尺寸四类做人工复核。",
      ];

  const suggestions = [
    "1. 先处理命中历史知识库的审核意见，后续可按领导或意见类型增加优先级。",
    "2. 对照参考知识逐条检查当前稿件，修改时保留前后对比图，方便后续继续沉淀。",
    "3. 如果本次审核发现新判断标准，把结论补充进知识库，下一次审核会自动复用。",
  ];

  return { matches, score, result, findings, suggestions: suggestions.join("\n") };
}

function renderReport(report) {
  hideElement("#analysisPanel");
  showElement("#reportPanel");
  $("#scoreText").textContent = `${report.score}%`;
  $("#scoreBar").value = report.score;
  const riskLevel = $("#riskLevel");
  riskLevel.className = `status-pill ${report.result}`;
  riskLevel.textContent = report.result === "pass" ? "通过" : "需调整";

  $("#priorityFindings").innerHTML = report.findings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join("");
  $("#referenceList").innerHTML = report.matches.length
    ? report.matches
        .map(
          ({ rule }) => `
            <article class="reference-card">
              <h5>${escapeHtml(getRuleLeader(rule))}</h5>
              <div class="rule-meta">
                <span class="tag">领导姓名</span>
              </div>
              <p>${escapeHtml(getRuleContent(rule))}</p>
            </article>
          `,
        )
        .join("")
    : `<p class="empty">没有匹配到具体知识条目。</p>`;
  $("#suggestionBox").textContent = report.suggestions;
}

function normalizeAiReport(payload) {
  const references = Array.isArray(payload.references) ? payload.references : [];
  const findings = Array.isArray(payload.findings) && payload.findings.length
    ? payload.findings
    : ["AI 没有返回明确审核意见，请人工复核设计稿。"];
  const suggestions = Array.isArray(payload.suggestions)
    ? payload.suggestions.join("\n")
    : String(payload.suggestions || "请根据审核意见调整设计稿。");
  const score = Number.isFinite(Number(payload.score)) ? Number(payload.score) : 72;
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    result: payload.result === "pass" ? "pass" : "adjust",
    findings,
    suggestions,
    matches: references.map((reference) => ({
      rule: {
        leader: reference.leader || reference.name || "知识库",
        content: reference.content || reference.opinion || "",
      },
    })).filter(({ rule }) => rule.content),
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseBulkRule(row) {
  const separators = ["：", ":", "\t", "，", ","];
  for (const separator of separators) {
    const index = row.indexOf(separator);
    if (index > 0) {
      return {
        leader: row.slice(0, index).trim(),
        content: row.slice(index + separator.length).trim(),
      };
    }
  }
  return { leader: "未填写领导", content: row.trim() };
}

function renderRules() {
  const rows = state.rules.length ? state.rules.map(renderRuleRow).join("") : renderDemoRuleRow();
  $("#ruleList").innerHTML = `
    <div class="rule-table-head">
      <span>图</span>
      <span>意见内容</span>
      <span>姓名</span>
      <span>管理</span>
    </div>
    <div class="rule-table-body">${rows}</div>
  `;
}

function renderRuleImageCell(rule) {
  const image = (rule.images || [])[0];
  if (image) {
    return `<figure class="table-thumb"><img src="${image}" alt="参考图片" /></figure>`;
  }
  return `<div class="table-thumb empty-thumb">无图</div>`;
}

function renderRuleRow(rule) {
  return `
    <article class="rule-row">
      <div class="rule-image-cell">${renderRuleImageCell(rule)}</div>
      <div class="rule-opinion-cell">
        <p>${escapeHtml(getRuleContent(rule))}</p>
      </div>
      <div class="rule-leader-cell">${escapeHtml(getRuleLeader(rule))}</div>
      <div class="rule-action-cell">
        <button class="danger-button small-button" data-delete-rule="${rule.id}">删除</button>
      </div>
    </article>
  `;
}

function normalizeFeishuValue(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) return value.map(normalizeFeishuValue).filter(Boolean).join(" ").trim();
  if (typeof value === "object") {
    if (value.text) return normalizeFeishuValue(value.text);
    if (value.link) return normalizeFeishuValue(value.link);
    if (value.url) return normalizeFeishuValue(value.url);
    if (value.name) return normalizeFeishuValue(value.name);
  }
  return "";
}

function normalizeFeishuRules(payload) {
  const rows = Array.isArray(payload) ? payload : payload.rules || payload.data || [];
  return rows
    .map((row) => {
      const image = normalizeFeishuValue(row.image || row.images || row["图"] || row["图片"] || row["图片链接"]);
      const content = normalizeFeishuValue(row.content || row.opinion || row["意见内容"] || row["审核意见"] || row["反馈意见"]);
      const leader = normalizeFeishuValue(row.leader || row.name || row["姓名"] || row["领导姓名"] || row["提出人"]);
      return {
        id: createId(),
        leader: leader || "未填写领导",
        content,
        images: image ? [image] : [],
        createdAt: new Date().toISOString(),
        source: "飞书表格",
      };
    })
    .filter((rule) => rule.content);
}

function mergeRules(nextRules) {
  const existingKeys = new Set(state.rules.map((rule) => `${getRuleLeader(rule)}::${getRuleContent(rule)}`));
  const uniqueRules = nextRules.filter((rule) => !existingKeys.has(`${getRuleLeader(rule)}::${getRuleContent(rule)}`));
  state.rules = [...uniqueRules, ...state.rules];
  return uniqueRules.length;
}

function loadGeneratedKnowledge() {
  const generatedRules = Array.isArray(window.FEISHU_KNOWLEDGE_RULES) ? window.FEISHU_KNOWLEDGE_RULES : [];
  if (!generatedRules.length) return;
  const rules = normalizeFeishuRules(generatedRules);
  const importedCount = mergeRules(rules);
  if (importedCount > 0) saveState();
  setFeishuStatus(`已加载飞书知识库 ${rules.length} 条，本次新增 ${importedCount} 条。`, "success");
}

function setFeishuStatus(text, status = "idle") {
  const node = $("#feishuSyncStatus");
  node.textContent = text;
  node.dataset.status = status;
}

function setAiReviewStatus(text, status = "idle") {
  const node = $("#aiReviewStatus");
  node.textContent = text;
  node.dataset.status = status;
}

function renderDemoRuleRow() {
  return `
    <article class="rule-row demo-card">
      <div class="rule-image-cell"><div class="table-thumb demo-thumb">示意图</div></div>
      <div class="rule-opinion-cell">
        <p>示意：主视觉利益点不够突出，需要先看到价格和活动机制。</p>
        <span class="empty">新增意见后，这里会替换成真实反馈列表。</span>
      </div>
      <div class="rule-leader-cell">张总</div>
      <div class="rule-action-cell"><span class="empty">--</span></div>
    </article>
  `;
}

function renderHistory() {
  $("#historyList").innerHTML = state.history.length
    ? state.history
        .map(
          (item) => `
            <article class="history-card">
              <h4>${escapeHtml(item.projectName || "设计稿审核记录")}</h4>
              <div class="rule-meta">
                <span class="tag">${escapeHtml(item.result === "pass" ? "通过" : "需调整")}</span>
                <span class="tag">审核得分：${item.score}%</span>
                <span class="tag">匹配知识：${item.matchCount} 条</span>
              </div>
              <p>${escapeHtml(item.brief || "未填写项目说明")}</p>
              <footer>
                <span class="empty">${new Date(item.createdAt).toLocaleString("zh-CN")}</span>
              </footer>
            </article>
          `,
        )
        .join("")
    : `
      <article class="history-card demo-card">
        <h4>示意：设计稿审核记录</h4>
        <div class="rule-meta">
          <span class="tag">需调整</span>
          <span class="tag">审核得分：76%</span>
          <span class="tag">匹配知识：2 条</span>
        </div>
        <p>真实审核后，这里会记录输入目标、审核结果和匹配到的知识库数量。</p>
      </article>
    `;
}

function resetRuleForm() {
  $("#ruleForm").reset();
  state.ruleImages = [];
  renderImages($("#rulePreview"), state.ruleImages);
}

function resetReview() {
  if (state.analysisTimer) {
    window.clearTimeout(state.analysisTimer);
    state.analysisTimer = null;
  }
  if (state.analysisStepTimer) {
    window.clearInterval(state.analysisStepTimer);
    state.analysisStepTimer = null;
  }
  $("#reviewForm").reset();
  state.draftImages = [];
  renderImages($("#draftPreview"), state.draftImages);
  setReviewReady(false);
  setUploadState($("#draftImages"), "idle");
  hideElement("#analysisPanel");
  hideElement("#reportPanel");
}

function setReviewReady(isReady) {
  const button = $("#reviewSubmitBtn");
  button.disabled = !isReady;
  button.classList.toggle("is-ready", isReady);
}

function setUploadState(input, stateName) {
  const zone = input.closest(".upload-zone");
  if (!zone) return;
  zone.classList.toggle("is-uploading", stateName === "uploading");
  zone.classList.toggle("is-uploaded", stateName === "uploaded");
  const label = zone.querySelector("[data-upload-label]");
  if (!label) return;
  if (stateName === "uploading") label.textContent = "上传中...";
  if (stateName === "uploaded") label.textContent = "上传完成";
  if (stateName === "idle") label.textContent = "上传设计稿";
}

function refresh() {
  renderStats();
  renderRules();
  renderHistory();
}

function renderStats() {
  $("#topRuleCount").textContent = state.rules.length;
  $("#topReviewCount").textContent = state.history.length;
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function setCopyButtonText(text) {
  const button = $("#copySuggestionBtn");
  button.textContent = text;
  window.setTimeout(() => {
    button.textContent = "复制文案";
  }, 1400);
}

function openRuleModal() {
  showElement("#ruleModal");
  window.setTimeout(() => $("#ruleLeader").focus(), 40);
}

function closeRuleModal() {
  hideElement("#ruleModal");
}

function openFeishuModal() {
  $("#feishuEndpoint").value = state.feishuEndpoint;
  showElement("#feishuModal");
  window.setTimeout(() => $("#feishuEndpoint").focus(), 40);
}

function closeFeishuModal() {
  hideElement("#feishuModal");
}

function openAiModal() {
  $("#aiReviewEndpoint").value = state.aiReviewEndpoint;
  showElement("#aiModal");
  window.setTimeout(() => $("#aiReviewEndpoint").focus(), 40);
}

function closeAiModal() {
  hideElement("#aiModal");
}

function updateAiStatus() {
  if (state.aiReviewEndpoint) {
    setAiReviewStatus("已配置视觉 AI 接口，审核时会读取上传图片并结合知识库判断。", "success");
    return;
  }
  setAiReviewStatus("未配置视觉 AI 接口时，将使用本地知识库文字匹配。", "idle");
}

async function syncFeishuRules() {
  const endpoint = state.feishuEndpoint.trim();
  if (!endpoint) {
    openFeishuModal();
    return;
  }

  const button = $("#syncFeishuBtn");
  const openButton = $("#openFeishuModalBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "同步中...";
  }
  openButton.disabled = true;
  openButton.textContent = "同步中...";
  setFeishuStatus("正在读取飞书表格...", "loading");

  try {
    const response = await fetch(endpoint, { method: "GET" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const nextRules = normalizeFeishuRules(payload);
    if (!nextRules.length) {
      setFeishuStatus("没有从飞书表格读到可用意见，请检查列名和表格内容。", "error");
      return;
    }

    const importedCount = mergeRules(nextRules);
    saveState();
    refresh();
    closeFeishuModal();
    setFeishuStatus(`已同步 ${importedCount} 条新意见，飞书表格共读取 ${nextRules.length} 条。`, "success");
  } catch (error) {
    setFeishuStatus(`同步失败：${error.message}。请检查中转接口和飞书权限。`, "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "保存并同步";
    }
    openButton.disabled = false;
    openButton.textContent = "同步飞书";
  }
}

async function requestAiReport(formData) {
  const payload = {
    brief: formData.brief,
    images: state.draftImages.slice(0, 4),
    rules: state.rules.map((rule) => ({
      leader: getRuleLeader(rule),
      content: getRuleContent(rule),
    })),
  };
  const response = await fetch(state.aiReviewEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`AI 接口返回 HTTP ${response.status}`);
  return normalizeAiReport(await response.json());
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function startAnalysis(formData) {
  if (state.analysisTimer) {
    window.clearTimeout(state.analysisTimer);
    state.analysisTimer = null;
  }
  hideElement("#reportPanel");
  showElement("#analysisPanel");

  const steps = [
    "正在读取项目背景、设计稿图片与知识库意见...",
    "正在识别画面信息、文案层级和视觉风险...",
    "正在整理可执行的修改建议...",
  ];
  let index = 0;
  $("#analysisText").textContent = steps[index];
  if (state.analysisStepTimer) {
    window.clearInterval(state.analysisStepTimer);
  }
  state.analysisStepTimer = window.setInterval(() => {
    index = (index + 1) % steps.length;
    $("#analysisText").textContent = steps[index];
  }, 420);

  try {
    const report = state.aiReviewEndpoint
      ? await requestAiReport(formData)
      : await wait(1350).then(() => buildReport(formData));
    window.clearInterval(state.analysisStepTimer);
    state.analysisStepTimer = null;
    renderReport(report);
    state.history.unshift({
      ...formData,
      score: report.score,
      result: report.result,
      matchCount: report.matches.length,
      createdAt: new Date().toISOString(),
    });
    state.history = state.history.slice(0, 30);
    saveState();
    refresh();
    state.analysisTimer = null;
  } catch (error) {
    window.clearInterval(state.analysisStepTimer);
    state.analysisStepTimer = null;
    hideElement("#analysisPanel");
    setAiReviewStatus(`AI 审核失败：${error.message}。当前可检查接口地址或临时清空配置改用本地匹配。`, "error");
  }
}

function bindEvents() {
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
  $$("[data-view-target]").forEach((button) =>
    button.addEventListener("click", () => switchView(button.dataset.viewTarget)),
  );

  $("#draftImages").addEventListener("change", async (event) => {
    setReviewReady(false);
    setUploadState(event.target, "uploading");
    state.draftImages = await readImages(event.target.files);
    renderImages($("#draftPreview"), state.draftImages);
    bounceUploadZone(event.target);
    if (state.uploadTimer) window.clearTimeout(state.uploadTimer);
    state.uploadTimer = window.setTimeout(() => {
      setUploadState(event.target, state.draftImages.length ? "uploaded" : "idle");
      setReviewReady(state.draftImages.length > 0);
    }, 650);
  });

  $("#ruleImages").addEventListener("change", async (event) => {
    state.ruleImages = await readImages(event.target.files);
    renderImages($("#rulePreview"), state.ruleImages);
    bounceUploadZone(event.target);
  });

  $("#ruleForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const rule = {
      id: createId(),
      leader: $("#ruleLeader").value.trim(),
      content: $("#ruleContent").value.trim(),
      images: state.ruleImages,
      createdAt: new Date().toISOString(),
    };
    state.rules.unshift(rule);
    saveState();
    resetRuleForm();
    closeRuleModal();
    refresh();
  });

  $("#bulkImportBtn").addEventListener("click", () => {
    const rows = $("#bulkRules").value
      .split(/\n+/)
      .map((row) => row.trim())
      .filter(Boolean);
    const rules = rows
      .map(parseBulkRule)
      .filter((rule) => rule.leader && rule.content)
      .map((rule) => ({
        id: createId(),
        leader: rule.leader,
        content: rule.content,
        images: [],
        createdAt: new Date().toISOString(),
      }));

    if (!rules.length) {
      alert("没有识别到可保存的批量意见。请按“领导姓名：意见内容”的格式每行录入一条。");
      return;
    }

    state.rules = [...rules, ...state.rules];
    $("#bulkRules").value = "";
    saveState();
    closeRuleModal();
    refresh();
  });

  $("#reviewForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.draftImages.length) return;
    const formData = {
      brief: $("#brief").value.trim(),
    };
    startAnalysis(formData);
  });

  $("#ruleList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-rule]");
    if (!button) return;
    state.rules = state.rules.filter((rule) => rule.id !== button.dataset.deleteRule);
    saveState();
    refresh();
  });

  $("#loadSampleBtn").addEventListener("click", () => {
    const existingContents = new Set(state.rules.map((rule) => getRuleContent(rule)));
    const nextRules = sampleRules.filter((rule) => !existingContents.has(rule.content));
    state.rules = [...nextRules, ...state.rules];
    saveState();
    refresh();
  });

  $("#clearHistoryBtn").addEventListener("click", () => {
    state.history = [];
    saveState();
    refresh();
  });

  $("#toggleHistoryBtn").addEventListener("click", () => switchView("historyView"));
  $("#backHomeBtn").addEventListener("click", () => switchView("knowledgeView"));

  $("#newReviewBtn").addEventListener("click", resetReview);

  $("#openRuleModalBtn").addEventListener("click", openRuleModal);
  $("#closeRuleModalBtn").addEventListener("click", closeRuleModal);
  $("#ruleModal").addEventListener("click", (event) => {
    if (event.target.id === "ruleModal") closeRuleModal();
  });

  $("#openFeishuModalBtn").addEventListener("click", () => {
    if (state.feishuEndpoint) {
      syncFeishuRules();
      return;
    }
    openFeishuModal();
  });
  $("#closeFeishuModalBtn").addEventListener("click", closeFeishuModal);
  $("#feishuModal").addEventListener("click", (event) => {
    if (event.target.id === "feishuModal") closeFeishuModal();
  });
  $("#feishuForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.feishuEndpoint = $("#feishuEndpoint").value.trim();
    saveConfig();
    syncFeishuRules();
  });

  $("#openAiModalBtn").addEventListener("click", openAiModal);
  $("#closeAiModalBtn").addEventListener("click", closeAiModal);
  $("#aiModal").addEventListener("click", (event) => {
    if (event.target.id === "aiModal") closeAiModal();
  });
  $("#aiForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.aiReviewEndpoint = $("#aiReviewEndpoint").value.trim();
    saveConfig();
    updateAiStatus();
    closeAiModal();
  });
  $("#clearAiEndpointBtn").addEventListener("click", () => {
    state.aiReviewEndpoint = "";
    $("#aiReviewEndpoint").value = "";
    saveConfig();
    updateAiStatus();
    closeAiModal();
  });

  $("#copySuggestionBtn").addEventListener("click", async () => {
    const text = $("#suggestionBox").textContent.trim();
    if (!text) {
      setCopyButtonText("暂无内容");
      return;
    }
    try {
      await copyText(text);
      setCopyButtonText("已复制");
    } catch {
      setCopyButtonText("复制失败");
    }
  });

}

function bounceUploadZone(input) {
  const zone = input.closest(".upload-zone");
  if (!zone) return;
  zone.classList.remove("is-bouncing");
  void zone.offsetWidth;
  zone.classList.add("is-bouncing");
  window.setTimeout(() => zone.classList.remove("is-bouncing"), 520);
}

bindEvents();
loadState();
loadConfig();
loadGeneratedKnowledge();
refresh();
updateAiStatus();
setReviewReady(false);
switchView("knowledgeView");
