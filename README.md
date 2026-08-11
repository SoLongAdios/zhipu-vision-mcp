# zhipu-vision-mcp

基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io) 的**多服务商视觉模型服务器**。通过单个工具 `analyze_image` 识别/理解图片，内置**自动故障转移**：某个模型限流/失败时自动切换下一个候选。任何支持 MCP 的客户端（Reasonix、Claude Desktop、Cursor、VS Code 等）都可以直接注册使用。

同时随仓库附带一个 Reasonix **skill**（`skills/image-analyze/`），让 agent 用自然语言即可触发图片识别/OCR。

## ✨ 特性

- 🔁 **多模型自动故障转移**：按优先级依次尝试候选模型，429（限流）/404（模型不存在）/5xx/网络错误/空回答自动切换下一个；401 则跳过该 provider 的全部候选
- 🖼️ **三种图片输入**：本地文件绝对路径、http(s) URL、base64 data URI（`data:image/...;base64,...`）
- 🧩 **零框架依赖**：仅依赖 `@modelcontextprotocol/sdk`，Node ≥ 20.6 即可运行
- 🔐 **密钥安全**：API key 只从环境变量 / `.env` 读取，代码零硬编码
- 🧠 **Reasonix skill 配套**：`image-analyze` skill 把"识别这张图片""图片 OCR"等自然语言指令直接路由到 `analyze_image`

默认候选链（按优先级）：

```
glm-4.6v-flash → glm-4.1v-thinking-flash → glm-4v-flash → mimo:mimo-v2.5 → mimo:mimo-v2-omni
```

> `glm-4.6v-flash` / `glm-4.1v-thinking-flash` / `glm-4v-flash` 为智谱免费视觉模型；`mimo-v2.5` / `mimo-v2-omni` 为小米 mimo 多模态模型（需 `MIMO_API_KEY`）。

## 🔧 工具

| 工具 | 说明 |
| --- | --- |
| `analyze_image` | 识别/分析一张图片，返回模型的文字回答（限流/失败自动切换下一个候选模型） |

### analyze_image 参数

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `image` | ✅ | 图片输入，支持三种形式：本地文件绝对路径（如 `C:/Users/xx/a.png`）、http(s) 图片 URL、base64 data URI（`data:image/...;base64,...`） |
| `question` | ❌ | 对图片的提问，如"这张图里有什么""识别图片中的文字"。默认：请描述这张图片 |
| `model` | ❌ | 手动指定模型（可选）。格式 `provider:model`，如 `glm-4.1v-thinking-flash`（缺省 provider=`zhipu`）、`mimo:mimo-v2.5`。指定后**不自动切换**，直接使用该模型 |

返回的 `structuredContent` 包含 `model` 字段（实际使用的 `provider/model`，便于确认是否发生了切换）。

支持图片格式：png / jpg / jpeg / gif / webp / bmp / svg / ico。

## ⚙️ 故障转移机制

- 按 `VISION_MODEL_CHAIN` 优先级依次尝试；成功即返回。
- **429（限流）/ 404（模型不存在）/ 5xx（服务端错误）/ 网络错误 / 空回答** → 自动切换下一个候选。
- **401（key 无效）** → 跳过该 provider 的全部候选（key 无效换模型也没用），继续尝试其他 provider。
- **其他 4xx（如 400 图片/内容问题）** → 不切换，直接返回错误。
- 全部候选失败 → 返回聚合错误，列出每个候选的失败原因，便于排查。

## 📦 快速开始

### 环境要求

- Node.js ≥ 20.6（自带全局 `fetch` 与 `--env-file`，无需额外 HTTP/环境变量依赖）
- 一个或多个视觉模型 API key（智谱必选；小米 mimo 可选）

### 安装与运行

```bash
git clone <你的仓库地址>
cd zhipu-vision-mcp

npm install          # 安装依赖
cp .env.example .env # 复制环境变量模板
# 编辑 .env，填入 ZHIPU_API_KEY（及可选的 MIMO_API_KEY）

npm run build        # 编译 TypeScript → dist/
npm start            # 启动（node --env-file=.env dist/index.js）
```

### 冒烟测试

```bash
node make-test-png.mjs  # 生成 64x64 红色测试图 test-red.png
node test-client.mjs    # 以 MCP client 连接 server，依次用 本地路径/base64/URL 调用 analyze_image
```

## 🌐 环境变量

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `ZHIPU_API_KEY` | ✅ | — | 智谱 API key（[open.bigmodel.cn](https://open.bigmodel.cn) 控制台获取） |
| `VISION_MODEL_CHAIN` | ❌ | 见下 | 逗号分隔的候选模型链，按优先级自动故障转移。条目格式 `provider:model`，provider 缺省为 `zhipu`。未设置时退化为 `ZHIPU_MODEL` |
| `ZHIPU_MODEL` | ❌ | `glm-4.6v-flash` | 兼容旧配置：`VISION_MODEL_CHAIN` 未设置时的默认模型 |
| `ZHIPU_BASE_URL` | ❌ | `https://open.bigmodel.cn/api/paas/v4` | 智谱 API base URL，一般无需修改 |
| `MIMO_API_KEY` | ⚠️ | — | 小米 mimo API key，候选链用到 `mimo:` 前缀模型时才需要 |
| `MIMO_BASE_URL` | ❌ | `https://api.xiaomimimo.com/v1` | 小米 mimo OpenAI 兼容端点 base URL |
| `VISION_TIMEOUT_MS` | ❌ | `60000` | 单次请求超时毫秒 |

默认候选链（未设置 `VISION_MODEL_CHAIN` 时）：

```
glm-4.6v-flash,glm-4.1v-thinking-flash,glm-4v-flash,mimo:mimo-v2.5,mimo:mimo-v2-omni
```

## 🔌 在 MCP 客户端中注册

### 方式一：本地安装（clone 后）

将仓库 clone 到本地（下文以 `<PROJECT_DIR>` 表示项目绝对路径），确保已 `npm install && npm run build`，然后在任意 MCP 客户端注册 stdio server：

```json
{
  "mcpServers": {
    "zhipu-vision": {
      "command": "node",
      "args": [
        "--env-file=<PROJECT_DIR>/.env",
        "<PROJECT_DIR>/dist/index.js"
      ]
    }
  }
}
```

> 仓库内提供了可直接修改使用的模板 `.mcp.json.example`（把 `<PROJECT_DIR>` 替换为你的项目绝对路径即可）。
>
> `--env-file` 与 `env` 可二选一；`env` 中注入的变量优先级高于 `.env` 文件：

```json
{
  "mcpServers": {
    "zhipu-vision": {
      "command": "node",
      "args": ["<PROJECT_DIR>/dist/index.js"],
      "env": {
        "ZHIPU_API_KEY": "你的智谱 API key",
        "MIMO_API_KEY": "你的小米 mimo API key（可选）"
      }
    }
  }
}
```

### 方式二：Reasonix（install_source）

在 Reasonix 中可直接通过 `install_source` 安装：

```text
install_source(source="<本地项目路径 或 本仓库 URL>", kind="mcp", transport="stdio",
               command="node", args=["--env-file=<PROJECT_DIR>/.env", "<PROJECT_DIR>/dist/index.js"])
```

### 方式三：其他客户端

- **Claude Desktop**（`claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "lm-studio-vision": {
      "command": "node",
      "args": ["<PROJECT_DIR>/dist/index.js"],
      "env": { "ZHIPU_API_KEY": "你的智谱 API key" }
    }
  }
}
```

- **Cursor / Windsurf**：Settings → MCP → Add，Name `zhipu-vision`，Type `command`，Command：`node <PROJECT_DIR>/dist/index.js`（key 通过环境变量提供）。
- **VS Code**（`%APPDATA%\Code\User\mcp.json`）：

```json
{
  "servers": {
    "zhipu-vision": {
      "type": "stdio",
      "command": "node",
      "args": ["<PROJECT_DIR>/dist/index.js"],
      "env": { "ZHIPU_API_KEY": "你的智谱 API key" }
    }
  }
}
```

## 🧠 配套 skill：image-analyze（Reasonix）

`skills/image-analyze/SKILL.md` 是一个 Reasonix skill：当用户要求**识别/理解/分析图片**（"识别这张图片""图片里有什么""看图回答""提取/识别图片中的文字（OCR）"）时，自动调用 `analyze_image` 工具。

### 安装 skill

- **方式 A（推荐，install_source）**：

```text
install_source(source="<仓库 URL 或本地路径>/skills/image-analyze", kind="skill")
```

- **方式 B（手动）**：把 `skills/image-analyze/` 目录（含 `SKILL.md`）复制到 Reasonix 的 skills 目录（如 `<workspace>/.reasonix/skills/` 或全局 skills 目录），重启后生效。

### 使用示例

装好 `zhipu-vision` MCP server + `image-analyze` skill 后，直接对 agent 说：

> 识别这张图片 `C:/Users/xx/screenshot.png` 里有什么

> 提取这张图里的文字：`https://example.com/photo.jpg`

agent 会自动调用 `analyze_image(image=..., question=...)` 并返回模型回答。

### skill 参数速查

- `image`（必填）：本地绝对路径 / http(s) URL / base64 data URI
- `question`（可选）：对图片的提问，默认"请描述这张图片"
- `model`（可选）：手动指定 `provider:model`，指定后不自动切换

### skill 常见错误处理

- **429（限流）**：免费模型高峰期受限，已自动尝试下一个候选；全部失败则提示稍后重试，可建议改用付费模型（如 `glm-4.6v`）。
- **401**：对应 provider 的 API key 无效，检查 `ZHIPU_API_KEY` / `MIMO_API_KEY`。
- **404**：`VISION_MODEL_CHAIN` 中模型名拼写有误。
- **本地图片读取失败**：确认传绝对路径且扩展名受支持。

## 📁 项目结构

```
zhipu-vision-mcp/
├── src/index.ts            # MCP server 源码（analyze_image、多 provider 故障转移）
├── dist/                   # 构建产物（npm run build 生成，不入库）
├── skills/image-analyze/   # Reasonix 配套 skill（SKILL.md）
├── .env.example            # 环境变量模板（复制为 .env 并填入 key）
├── .mcp.json.example       # MCP 注册配置模板（<PROJECT_DIR> 替换为项目绝对路径）
├── check-models.mjs        # 查询 API key 可用模型列表（只读，不产生费用）
├── make-test-png.mjs       # 生成测试图 test-red.png
├── test-client.mjs         # 冒烟测试：本地路径 / base64 / URL 三种输入
└── verify-local.mjs        # 单请求验证（本地文件路径）
```

## 🛡️ 安全说明

- **API key 只放在 `.env`**（已在 `.gitignore` 中，严禁提交）；也可通过 MCP 客户端的 `env` 注入。
- 仓库内所有代码均从环境变量读取密钥，**零硬编码**；发布版不含任何真实凭据。
- 请勿将 `.env`、`dist/`、`node_modules/` 提交到版本库（`.gitignore` 已覆盖）。
- 若误提交过密钥，请立即到对应平台控制台**吊销并重新生成** key，并清理 git 历史。

## ❓ 常见问题

- **429 该模型当前访问量过大**：免费模型（`glm-4.6v-flash` 等）高峰期会限流。已实现自动故障转移，429 会自动尝试下一个候选模型；若全部候选都失败，说明各服务商当前均受限，稍后重试即可。
- **401**：对应 provider 的 API key 无效（`ZHIPU_API_KEY` 或 `MIMO_API_KEY`），请检查 key 是否复制完整。
- **404 模型不存在**：模型名拼写有误，请核对 `VISION_MODEL_CHAIN` / `ZHIPU_MODEL`。
- **本地图片读取失败**：确认传的是绝对路径，且扩展名受支持。

## 📄 License

[MIT](./LICENSE)
