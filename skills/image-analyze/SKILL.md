---
name: image-analyze
description: 识别/理解/分析图片：把本地路径、URL 或 base64 图片交给视觉 MCP analyze_image 回答（多模型自动故障转移：智谱 GLM-4.6V-Flash → GLM-4.1V-Thinking-Flash → GLM-4V-Flash → 小米 mimo-v2.5 / mimo-v2-omni；覆盖"识别这张图片""看图回答""图片 OCR"等）
---

# 图片识别（image-analyze）

当用户要求**识别/理解/分析图片**——例如"识别这张图片""图片里有什么""看图回答""描述图片内容""提取/识别图片中的文字（OCR）"——时，调用视觉 MCP 工具 **`analyze_image`**（由 `zhipu-vision` MCP server 提供）。该工具内置**多模型自动故障转移**：按优先级依次尝试 `glm-4.6v-flash → glm-4.1v-thinking-flash → glm-4v-flash → mimo:mimo-v2.5 → mimo:mimo-v2-omni`，限流/失败自动切换下一个，无需手动干预。

## 调用方式

工具参数：

- `image`（必填）：图片输入，三种形式任选其一：
  - 本地文件**绝对路径**（如 `C:/Users/xx/a.png`）
  - http(s) 图片 URL
  - base64 data URI（`data:image/...;base64,...`）
- `question`（可选）：对图片的提问；用户未指定时默认"请描述这张图片"。可以代用户补充更有针对性的问题（如"识别图中的文字""图中有几个物体""图片是什么场景"），以提升回答质量。
- `model`（可选）：手动指定模型，格式 `provider:model`（如 `glm-4.1v-thinking-flash`、`mimo:mimo-v2.5`）；指定后不自动切换。仅在用户明确要求用某个模型时使用。

## 注意事项

- 支持格式：png / jpg / jpeg / gif / webp / bmp / svg / ico；其他格式需先转换为支持的格式。
- 用户给出的是相对路径或文件名时，先解析为绝对路径再传入。
- 返回的 `structuredContent.model` 是实际使用的 `provider/model`，可据此向用户说明用的哪个模型（如发生切换）。
- 若返回 `isError: true`，说明**所有候选模型都失败**，把错误信息转述给用户并给出处理建议：
  - **429（该模型当前访问量过大）**：免费模型限流（可能多个免费候选同时受限），提示用户稍后重试；若持续，可建议改用付费模型（如 `glm-4.6v`）；
  - **401**：对应 provider 的 API key 无效，请检查 `ZHIPU_API_KEY` / `MIMO_API_KEY`；
  - **404（模型不存在）**：`VISION_MODEL_CHAIN` 中模型名拼写有误。
- 一次调用分析一张图片；多张图片可多次调用 `analyze_image`。
