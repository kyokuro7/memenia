// Proxy CORS sederhana untuk AniFams (Vercel Serverless Function).
// Pakai: GET /api/proxy?url=<URL-API-yang-di-encode>
// Hanya host pada daftar ALLOWED yang diteruskan, supaya tidak bisa disalahgunakan sebagai open proxy.
const ALLOWED = new Set([
  "api.rexxgraph.my.id",
  "www.sankavollerei.web.id",
  "api.zetewstore.my.id",
  "app.kyzznekoo.my.id"
]);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type, X-apikey");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Hanya GET" });

  let target;
  try { target = new URL(req.query.url); }
  catch { return res.status(400).json({ ok: false, error: "Parameter url tidak valid" }); }
  if (target.protocol !== "https:" || !ALLOWED.has(target.hostname)) {
    return res.status(403).json({ ok: false, error: "Host tidak diizinkan" });
  }

  try {
    const headers = { "Accept": "application/json", "User-Agent": "Mozilla/5.0 (compatible; AniFams-proxy)" };
    if (req.headers["x-apikey"]) headers["X-apikey"] = req.headers["x-apikey"];
    const upstream = await fetch(target, { headers });
    const body = await upstream.text();
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    return res.status(upstream.status).send(body);
  } catch (err) {
    return res.status(502).json({ ok: false, error: "Proxy gagal: " + err.message });
  }
};
