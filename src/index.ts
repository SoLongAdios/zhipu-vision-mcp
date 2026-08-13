/**
 * zhipu-vision-mcp — MCP server 调用多服务商视觉模型识别/分析图片，支持故障转移。
 *
 * 工具：
 *   analyze_image(image, question?, model?)
 *     - image: 本地文件路径 / http(s) 图片 URL / base64 data URI
 *     - question: 对图片的提问（可选，默认"请描述这张图片"）
 *     - model: 手动指定模型（可选，如 "glm-4.1v-thinking-flash"、"mimo:mimo-v2.5"、"kimi:kimi-k3"；
 *       指定后不自动切换；缺省按候选链自动故障转移）
 *
 * 环境变量：
 *   ZHIPU_API_KEY    智谱 API key（默认免费模型）
 *   ZHIPU_MODEL      默认候选模型（VISION_MODEL_CHAIN 未设置时使用，默认 glm-4.6v-flash）
 *   ZHIPU_BASE_URL   默认 https://open.bigmodel.cn/api/paas/v4
 *   MIMO_API_KEY     小米 mimo API key（可选，收费兜底，候选链用到 mimo 时才需要）
 *   MIMO_BASE_URL    默认 https://api.xiaomimimo.com/v1（OpenAI 兼容端点）
 *   KIMI_API_KEY     月之暗面 kimi API key（可选，收费候选）
 *   KIMI_BASE_URL    默认 https://api.moonshot.cn/v1（OpenAI 兼容端点）
 *   OPENAI_API_KEY   OpenAI GPT API key（可选，收费候选）
 *   OPENAI_BASE_URL  默认 https://api.openai.com/v1（OpenAI 兼容端点）
 *   QWEN_API_KEY     阿里百炼 qwen API key（可选，收费候选；新版百炼空间可用 QWEN_BASE_URL 覆盖为 maas 端点）
 *   QWEN_BASE_URL    默认 https://dashscope.aliyuncs.com/compatible-mode/v1（OpenAI 兼容端点）
 *   GEMINI_API_KEY   Google Gemini API key（可选，收费候选）
 *   GEMINI_BASE_URL  默认 https://generativelanguage.googleapis.com/v1beta/openai（OpenAI 兼容端点）
 *   SILICONFLOW_API_KEY  硅基流动 API key（可选，开源视觉模型聚合，收费候选）
 *   SILICONFLOW_BASE_URL 默认 https://api.siliconflow.cn/v1（OpenAI 兼容端点）
 *   VISION_MODEL_CHAIN  逗号分隔的候选模型链，按优先级依次尝试（429/404/5xx/网络错误自动切换），
 *                    条目格式 "provider:model"，provider 缺省为 zhipu，
 *                    如 "glm-4.6v-flash,glm-4.1v-thinking-flash,mimo:mimo-v2.5,kimi:kimi-k3"
 *                    未配置 key 的 provider 候选会被自动跳过（不影响启动）
 *   VISION_TIMEOUT_MS  单次请求超时毫秒，默认 60000
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import path from "node:path";

// ---------- provider 配置 ----------
interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  keyEnv: string;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  zhipu: {
    baseUrl: (process.env.ZHIPU_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4").replace(/\/+$/, ""),
    apiKey: process.env.ZHIPU_API_KEY ?? "",
    keyEnv: "ZHIPU_API_KEY",
  },
  mimo: {
    baseUrl: (process.env.MIMO_BASE_URL ?? "https://api.xiaomimimo.com/v1").replace(/\/+$/, ""),
    apiKey: process.env.MIMO_API_KEY ?? "",
    keyEnv: "MIMO_API_KEY",
  },
  kimi: {
    baseUrl: (process.env.KIMI_BASE_URL ?? "https://api.moonshot.cn/v1").replace(/\/+$/, ""),
    apiKey: process.env.KIMI_API_KEY ?? "",
    keyEnv: "KIMI_API_KEY",
  },
  openai: {
    baseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
    apiKey: process.env.OPENAI_API_KEY ?? "",
    keyEnv: "OPENAI_API_KEY",
  },
  qwen: {
    baseUrl: (process.env.QWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, ""),
    apiKey: process.env.QWEN_API_KEY ?? "",
    keyEnv: "QWEN_API_KEY",
  },
  gemini: {
    baseUrl: (process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, ""),
    apiKey: process.env.GEMINI_API_KEY ?? "",
    keyEnv: "GEMINI_API_KEY",
  },
  siliconflow: {
    baseUrl: (process.env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1").replace(/\/+$/, ""),
    apiKey: process.env.SILICONFLOW_API_KEY ?? "",
    keyEnv: "SILICONFLOW_API_KEY",
  },
};

// ---------- 候选模型链 ----------
interface ModelCandidate {
  provider: string;
  model: string;
}

/** 解析 "provider:model" 或 "model"（provider 缺省为 zhipu） */
function parseCandidate(spec: string): ModelCandidate {
  const s = spec.trim();
  const i = s.indexOf(":");
  if (i > 0 && PROVIDERS[s.slice(0, i).trim()]) {
    return { provider: s.slice(0, i).trim(), model: s.slice(i + 1).trim() };
  }
  return { provider: "zhipu", model: s };
}

function buildChain(): ModelCandidate[] {
  const raw = (process.env.VISION_MODEL_CHAIN ?? "").trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(parseCandidate);
  }
  // 向后兼容：仅 ZHIPU_MODEL
  return [{ provider: "zhipu", model: process.env.ZHIPU_MODEL ?? "glm-4.6v-flash" }];
}

const CHAIN = buildChain();
const TIMEOUT_MS = Number(process.env.VISION_TIMEOUT_MS ?? 60000);

// 启动校验：至少一个候选可用（provider 存在且有 key），否则退出
{
  const problems: string[] = [];
  for (const c of CHAIN) {
    const p = PROVIDERS[c.provider];
    if (!p) problems.push(`候选「${c.provider}:${c.model}」的 provider「${c.provider}」未配置（可选：${Object.keys(PROVIDERS).join(", ")}）`);
    else if (!p.apiKey) problems.push(`候选「${c.provider}:${c.model}」缺少 API key（${p.keyEnv}）`);
  }
  if (CHAIN.length === 0) problems.push("候选模型链为空（请设置 VISION_MODEL_CHAIN 或 ZHIPU_MODEL）");
  if (problems.length === CHAIN.length && CHAIN.length > 0) {
    console.error("[zhipu-vision-mcp] 错误：所有候选模型均不可用：\n  - " + problems.join("\n  - "));
    process.exit(1);
  }
}

// ---------- 图片输入处理 ----------
const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/**
 * 将用户输入的图片（本地路径 / URL / data URI）统一解析为可传给视觉 API 的 url 字段。
 * - data URI 直接透传
 * - http(s) URL 直接透传
 * - 本地路径：读取文件并编码为 data:image/<mime>;base64,...
 */
async function resolveImageUrl(image: string): Promise<string> {
  const trimmed = image.trim();
  if (trimmed.startsWith("data:")) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const abs = path.resolve(trimmed);
  const ext = path.extname(abs).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    throw new Error(
      `不支持的图片类型：${ext || "(无扩展名)"}（支持 png/jpg/jpeg/gif/webp/bmp/svg/ico）。` +
        "也可以传 http(s) URL 或 data:image/...;base64,... 格式的 data URI。"
    );
  }
  let buf: Buffer;
  try {
    buf = await readFile(abs);
  } catch (err) {
    throw new Error(`无法读取本地图片文件 "${abs}"：${(err as NodeJS.ErrnoException).message}`);
  }
  if (buf.length === 0) {
    throw new Error(`图片文件为空："${abs}"`);
  }
  return `data:${mime};base64,${buf.toString("base64")}`;
}

// ---------- 视觉 API 调用（OpenAI 兼容，多 provider） ----------
class ApiError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

interface VisionResult {
  answer: string;
  usage?: Record<string, unknown>;
  provider: string;
  model: string;
}

/** 调用单个 provider 的 chat/completions，失败时抛 ApiError（status=0 表示网络/超时/空回答） */
async function callModel(
  providerName: string,
  p: ProviderConfig,
  model: string,
  imageUrl: string,
  question: string
): Promise<VisionResult> {
  const body = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: question },
        ],
      },
    ],
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${p.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    const msg =
      err instanceof Error && err.name === "AbortError"
        ? `请求超时（${TIMEOUT_MS}ms）`
        : `无法连接（${p.baseUrl}）：${(err as Error).message}`;
    throw new ApiError(msg, 0, true);
  } finally {
    clearTimeout(timer);
  }

  const data: any = await res.json().catch(() => null);

  if (!res.ok) {
    const apiMsg = data?.error?.message ?? data?.message ?? `HTTP ${res.status} ${res.statusText}`;
    // 429 限流 / 404 模型不存在 / 5xx 服务端错误 / 401 key 无效 —— 均可尝试切换
    const retryable = res.status === 429 || res.status === 404 || res.status >= 500;
    throw new ApiError(`HTTP ${res.status}: ${apiMsg}`, res.status, retryable);
  }

  const raw = data?.choices?.[0]?.message?.content;
  const answer = Array.isArray(raw)
    ? raw.map((c: any) => (typeof c === "string" ? c : c?.text ?? "")).join("")
    : typeof raw === "string"
      ? raw
      : "";
  if (!answer.trim()) {
    throw new ApiError("模型返回了空回答，请重试或更换图片。", 0, true);
  }
  return { answer, usage: data?.usage, provider: providerName, model };
}

/**
 * 按候选链依次尝试，直到成功或全部失败。
 * - 429 / 404 / 5xx / 网络错误 / 空回答 → 自动切换下一个候选
 * - 401 → 该 provider 的 key 无效，跳过该 provider 的全部候选
 * - 其他 4xx（如 400 图片/内容问题）→ 不切换，直接失败
 * - model 手动指定时只尝试该模型，不做故障转移
 */
async function callVisionChain(imageUrl: string, question: string, forceModel?: string): Promise<VisionResult> {
  const candidates: ModelCandidate[] = forceModel ? [parseCandidate(forceModel)] : CHAIN;
  const invalidKeyProviders = new Set<string>();
  const failures: string[] = [];

  for (const c of candidates) {
    const p = PROVIDERS[c.provider];
    if (!p) {
      failures.push(`候选「${c.provider}:${c.model}」：provider 未配置`);
      continue;
    }
    if (!p.apiKey) {
      failures.push(`候选「${c.provider}:${c.model}」：缺少 API key（${p.keyEnv}）`);
      continue;
    }
    if (invalidKeyProviders.has(c.provider)) {
      failures.push(`候选「${c.provider}:${c.model}」：${c.provider} 的 API key 无效（401），已跳过`);
      continue;
    }
    try {
      const result = await callModel(c.provider, p, c.model, imageUrl, question);
      return result;
    } catch (err) {
      const e = err as ApiError;
      const tag = e.status === 401 ? `${c.provider} API key 无效` : `${c.provider}:${c.model} 失败`;
      failures.push(`候选「${c.provider}:${c.model}」：${tag} — ${e.message}`);
      if (e.status === 401) invalidKeyProviders.add(c.provider);
      else if (!e.retryable && !forceModel) break; // 非可切换错误（且非 401）：停止尝试
    }
  }

  throw new Error("所有候选模型均失败：\n  - " + failures.join("\n  - "));
}

// ---------- MCP server ----------
const CHAIN_DESC = CHAIN.map((c) => `${c.provider}/${c.model}`).join(" → ");

const server = new McpServer({
  name: "zhipu-vision",
  version: "1.1.0",
});

server.registerTool(
  "analyze_image",
  {
    title: "analyze_image",
    description:
      `使用视觉模型识别/分析一张图片，返回模型的文字回答。` +
      `当前候选链（按优先级自动故障转移：限流/失败自动切换下一个）：${CHAIN_DESC}。` +
      "image 支持：本地文件绝对路径、http(s) 图片 URL、或 data:image/...;base64,... 格式的 base64 data URI。",
    inputSchema: {
      image: z
        .string()
        .describe(
          "图片输入：本地文件绝对路径（如 C:/Users/xx/a.png）、http(s) 图片 URL，或 data:image/...;base64,... 的 base64 data URI"
        ),
      question: z
        .string()
        .optional()
        .describe('对图片的提问，例如"这张图里有什么""识别图片中的文字""描述图片内容"。默认：请描述这张图片'),
      model: z
        .string()
        .optional()
        .describe(
          '手动指定要使用的模型（可选）。格式 "provider:model"，如 "glm-4.6v-flash"（缺省 provider=zhipu）、"mimo:mimo-v2.5"、"kimi:kimi-k3"、"qwen:qwen-vl-max"、"gemini:gemini-2.5-flash"、"openai:gpt-4o"。指定后不自动切换。'
        ),
    },
  },
  async ({ image, question, model }) => {
    try {
      const imageUrl = await resolveImageUrl(image);
      const { answer, usage, provider, model: usedModel } = await callVisionChain(
        imageUrl,
        question ?? "请描述这张图片",
        model
      );
      return {
        content: [{ type: "text", text: answer }],
        structuredContent: {
          answer,
          model: `${provider}/${usedModel}`,
          usage: usage ?? {},
        },
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: `analyze_image 失败：${(err as Error).message}` }],
      };
    }
  }
);

// ---------- 启动 ----------
const transport = new StdioServerTransport();
await server.connect(transport);
