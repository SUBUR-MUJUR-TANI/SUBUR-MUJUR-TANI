const { getStore } = require("@netlify/blobs");

function responseText(message, status) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return responseText("Method not allowed", 405);
  try {
    const key = String(event.queryStringParameters?.key || "").trim();
    if (!key || !key.startsWith("bukti-pembayaran/")) return responseText("Bukti tidak ditemukan.", 404);
    const store = getStore("smt-bukti-pembayaran");
    const result = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!result) return responseText("Bukti transfer tidak ditemukan.", 404);
    const type = String(result.metadata?.contentType || "application/octet-stream");
    return new Response(result.data, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store, max-age=0"
      }
    });
  } catch (error) {
    console.error("bukti-transfer:", error);
    return responseText("Gagal membuka bukti transfer.", 500);
  }
};
