// MCP client 冒烟测试：连接 zhipu-vision-mcp（stdio），用三种图片输入调用 analyze_image
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, "dist/index.js");

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--env-file=.env", serverPath],
  cwd: __dirname,
  env: { ...process.env },
});

const client = new Client({ name: "zhipu-vision-smoke-test", version: "1.0.0" });
await client.connect(transport);
console.log("[ok] connected to server");

const { tools } = await client.listTools();
console.log("[ok] tools:", tools.map((t) => t.name).join(", "));

async function run(label, args) {
  const r = await client.callTool({ name: "analyze_image", arguments: args });
  const text = r.content.map((c) => c.text ?? JSON.stringify(c)).join("\n");
  console.log(`\n--- ${label} ---`);
  console.log(text);
  if (r.isError) {
    console.log(`[FAIL] ${label}`);
    return false;
  }
  console.log(`[ok] ${label}`);
  return true;
}

let ok = true;

// 测试1：本地文件路径
ok = (await run("local file path (test-red.png)", { image: "test-red.png", question: "这张图片是什么颜色？只回答颜色名。" })) && ok;

// 测试2：base64 data URI
const b64 = readFileSync("test-red.png").toString("base64");
ok = (await run("base64 data URI", { image: `data:image/png;base64,${b64}`, question: "这张图片是什么颜色？只回答颜色名。" })) && ok;

// 测试3：http(s) URL（网络图源，失败仅提示不阻塞结论）
try {
  ok = (await run("http URL (https://picsum.photos/200)", { image: "https://picsum.photos/200", question: "这张图片大致是什么内容？一句话即可。" })) && ok;
} catch (e) {
  console.log("[warn] url test error:", e.message);
}

await client.close();
console.log(`\n=== ${ok ? "ALL PASSED" : "SOME FAILED"} ===`);
process.exit(ok ? 0 : 1);
