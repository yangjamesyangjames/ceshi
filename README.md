# 设计稿审核助手

这是一个本地静态网页工具，用来沉淀设计过稿意见，并在新稿件出来后基于知识库生成审核结果。

## 打开方式

直接双击 `index.html`，或在浏览器中打开：

`/Users/yangdengqing/Desktop/审稿工具/index.html`

## 主要功能

- 知识库：录入领导姓名、意见内容和参考图片，支持单条录入和批量录入。
- 飞书同步：可通过安全中转接口读取飞书电子表格中的“图 / 意见内容 / 姓名”。
- 设计稿审核：填写项目背景并上传设计稿图片，系统会根据知识库匹配相似意见，生成审核意见、参考知识和修改建议。
- 审核历史：自动保存最近 30 次审核记录。

## 飞书电子表格接入

网页本身部署在 GitHub Pages，不能直接保存飞书 `app_secret`。需要把 `feishu-worker.js` 部署成安全中转接口，并在接口平台配置环境变量：

- `FEISHU_APP_ID`：飞书自建应用的 App ID
- `FEISHU_APP_SECRET`：飞书自建应用的 App Secret
- `FEISHU_SPREADSHEET_TOKEN`：飞书电子表格链接里的 spreadsheet token
- `FEISHU_RANGE`：读取范围，例如 `Sheet1!A:C`

电子表格第一行建议固定为：

`图 | 意见内容 | 姓名`

其中“图”可以先填写图片链接，也可以留空。中转接口部署好后，在知识库页点击“同步飞书”，填入接口地址即可同步。

## 飞书 CLI 同步

当前仓库也支持通过飞书 CLI 把电子表格同步成静态知识库文件，适合个人使用：

```bash
node sync-feishu.mjs
```

脚本会读取 Wiki 页面“设计意见”背后的电子表格，并生成 `knowledge.js`。网页打开时会自动加载 `knowledge.js` 里的意见。

更新飞书表格后，如果要发布到 GitHub Pages，执行：

```bash
node sync-feishu.mjs
git add knowledge.js
git commit -m "Sync Feishu knowledge"
git push origin main
```

## 视觉 AI 审核接入

如果要让系统真正读取上传的设计稿图片，需要把 `ai-review-worker.js` 部署成后端中转接口，并在接口平台配置环境变量：

- `OPENAI_API_KEY`：OpenAI API Key
- `OPENAI_MODEL`：可选，默认 `gpt-4.1`

部署完成后，在网页“设计稿审核”页点击“配置 AI”，填入 Worker 地址。之后点击“审核”时，网页会把上传图片、输入目标和知识库意见发送给 Worker，由视觉模型返回结构化审核报告。

不要把 `OPENAI_API_KEY` 写进 `index.html`、`script.js` 或任何会发布到 GitHub Pages 的前端文件。

## 当前版本说明

当前版本是纯前端本地工具，数据保存在浏览器 `localStorage` 中，不会上传服务器。图片会作为本地数据保存，适合做知识库原型和团队内部流程验证。

审核逻辑基于项目描述和历史意见匹配。若后续需要真正让 AI 直接识别设计稿图片内容，建议增加后端服务，并接入支持图像理解的大模型 API。
