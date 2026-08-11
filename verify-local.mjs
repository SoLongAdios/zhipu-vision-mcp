// 单请求验证：本地文件路径 → analyze_image（避免并发触发限流）
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--env-file=.env", path.join(__dirname, "dist/index.js")],
  cwd: __dirname,
  env: { ...process.env },
});
const client = new Client({ name: "verify-local", version: "1.0.0" });
await client.connect(transport);
const r = await client.callTool({
  name: "analyze_image",
  arguments: { image: "test-red.png", question: "这张图片是什么颜色？只回答颜色名。" },
});
console.log(JSON.stringify(r, null, 2));
await client.close();
process.exit(r.isError ? 1 : 0);
