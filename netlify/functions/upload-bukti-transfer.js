const { getStore } = require("@netlify/blobs");
const crypto = require("node:crypto");

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function safeSegment(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "pembeli";
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const contentType = String(event.headers["content-type"] || event.headers["Content-Type"] || "");
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
      return json({ error: "Upload harus menggunakan multipart/form-data." }, 415);
    }

    const body = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "", "utf8");

    // Netlify Functions menyediakan request body mentah. Parsing multipart manual
    // dihindari dengan memakai Request/FormData dari runtime Node 18+.
    const request = new Request("https://local.upload/", {
      method: "POST",
      headers: { "content-type": contentType },
      body
    });
    const form = await request.formData();
    const file = form.get("file");
    const paymentId = String(form.get("paymentId") || "").trim();
    const namaPembeli = safeSegment(form.get("namaPembeli"));

    if (!paymentId || paymentId.length > 120) return json({ error: "ID pembayaran tidak valid." }, 400);
    if (!(file instanceof File)) return json({ error: "File bukti transfer tidak ditemukan." }, 400);
    if (!ALLOWED.has(file.type)) return json({ error: "Bukti transfer harus JPG, PNG, atau WEBP." }, 400);
    if (file.size > MAX_BYTES) return json({ error: "Ukuran bukti transfer maksimal 5 MB." }, 400);

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const key = `bukti-pembayaran/${paymentId}-${Date.now()}-${crypto.randomUUID()}-${namaPembeli}.${ext}`;
    const store = getStore("smt-bukti-pembayaran");
    await store.set(key, file, {
      metadata: {
        paymentId,
        namaPembeli,
        contentType: file.type,
        size: String(file.size),
        uploadedAt: new Date().toISOString()
      }
    });

    const url = `/.netlify/functions/bukti-transfer?key=${encodeURIComponent(key)}`;
    return json({ ok: true, key, url });
  } catch (error) {
    console.error("upload-bukti-transfer:", error);
    return json({ error: "Server gagal menyimpan bukti transfer." }, 500);
  }
};
