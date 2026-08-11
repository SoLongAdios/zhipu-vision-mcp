// 只读：查询该 API key 可用的模型列表（GET /models，不产生费用）
const key = process.env.ZHIPU_API_KEY;
const res = await fetch("https://open.bigmodel.cn/api/paas/v4/models", {
  headers: { Authorization: `Bearer ${key}` },
});
console.log("status:", res.status);
const data = await res.json().catch(() => null);
if (!data || !data.data) {
  console.log(JSON.stringify(data).slice(0, 500));
} else {
  const models = data.data.map((m) => m.id ?? m.model ?? JSON.stringify(m));
  console.log("total:", models.length);
  console.log(models.join("\n"));
}
