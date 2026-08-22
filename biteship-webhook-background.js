const { processWebhookPayload } = require("./biteship-webhook-processor");

function response(statusCode, body = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}

function headerValue(headers, name) {
  const target = String(name || "").toLowerCase();
  for (const [k, v] of Object.entries(headers || {})) {
    if (String(k).toLowerCase() === target) return String(v || "");
  }
  return "";
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

const crypto = require("crypto");

exports.handler = async event => {
  if (event.httpMethod !== "POST") {
    return response(405, { success: false, message: "Method harus POST." });
  }

  const internalSecret = String(process.env.BITESHIP_WEBHOOK_SIGNATURE_SECRET || "").trim();
  const receivedInternalSecret = headerValue(event.headers, "x-smt-webhook-internal");

  if (!internalSecret || !safeEqual(receivedInternalSecret, internalSecret)) {
    return response(401, { success: false, message: "Unauthorized." });
  }

  try {
    const result = await processWebhookPayload(String(event.body || ""));
    return response(200, result);
  } catch (err) {
    console.error("biteship-webhook-background:", err);
    return response(500, {
      success: false,
      message: err.message || "Webhook gagal diproses."
    });
  }
};
