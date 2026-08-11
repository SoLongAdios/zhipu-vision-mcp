# zhipu-vision-mcp

一个基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io) 的服务器，封装**多服务商视觉模型**，通过单个工具 `analyze_image` 识别/理解图片，支持**自动故障转移**（某个模型限流/失败时自动切换下一个候选）。任何支持 MCP 的客户端（Reasonix、Claude Desktop、Cursor 等）都可以直接注册使用。

默认候选链（按优先级）：

```
glm-4.6v-flash → glm-4.1v-thinking-flash → glm-4v-flash → mimo:mimo-v2.5 → mimo:mimo-v2-omni
```

## 工具

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

## 故障转移机制

- 按 `VISION_MODEL_CHAIN` 优先级依次尝试；成功即返回。
- **429（限流）/ 404（模型不存在）/ 5xx（服务端错误）/ 网络错误 / 空回答** → 自动切换下一个候选。
- **401（key 无效）** → 跳过该 provider 的全部候选（key 无效换模型也没用），继续尝试其他 provider。
- **其他 4xx（如 400 图片/内容问题）** → 不切换，直接返回错误。
- 全部候选失败 → 返回聚合错误，列出每个候选的失败原因，便于排查。

## 环境变量

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

> `glm-4.6v-flash` / `glm-4.1v-thinking-flash` / `glm-4v-flash` 均为智谱免费视觉模型；`mimo-v2.5` / `mimo-v2-omni` 为小米 mimo 多模态模型（需 `MIMO_API_KEY`）。

## 本地开发

```bash
npm install          # 安装依赖
cp .env.example .env # 首次使用：复制模板并填入 API key
npm run build        # 编译 TypeScript → dist/
npm start            # 启动（node --env-file=.env dist/index.js）
```

冒烟测试（需要先 build 并生成测试图片）：

```bash
node make-test-png.mjs  # 生成 64x64 红色测试图 test-red.png
node test-client.mjs    # 以 MCP client 连接 server，依次用 本地路径/base64/URL 调用 analyze_image
```

## 在 MCP 客户端中注册（stdio）

以 Claude Desktop / Reasonix 的 MCP 配置为例：

```json
{
  "mcpServers": {
    "zhipu-vision": {
      "command": "node",
      "args": ["--env-file=<项目绝对路径>/.env", "<项目绝对路径>/dist/index.js"],
      "env": {
        "ZHIPU_API_KEY": "你的智谱 API key",
        "MIMO_API_KEY": "你的小米 mimo API key（可选）"
      }
    }
  }
}
```

> 提示：`--env-file` 与 `env` 可二选一；`env` 中注入的变量优先级高于 `.env` 文件。

## 常见问题

- **429 该模型当前访问量过大**：免费模型（`glm-4.6v-flash` 等）高峰期会限流。已实现自动故障转移，429 会自动尝试下一个候选模型；若全部候选都失败，说明各服务商当前均受限，稍后重试即可。
- **401**：对应 provider 的 API key 无效（`ZHIPU_API_KEY` 或 `MIMO_API_KEY`），请检查 key 是否复制完整。
- **404 模型不存在**：模型名拼写有误，请核对 `VISION_MODEL_CHAIN` / `ZHIPU_MODEL`。
- **本地图片读取失败**：确认传的是绝对路径，且扩展名受支持。
