/**
 * SUBUR MUJUR TANI - Biteship Webhook
 *
 * IMPORTANT:
 * This endpoint is deliberately validation-safe.
 * Biteship can install/validate a webhook by sending:
 *   POST + Content-Type: application/json + empty body
 * The response MUST be HTTP 200 with "ok".
 *
 * Public URL:
 *   /api/biteship-webhook
 *
 * Netlify function:
 *   /.netlify/functions/biteship-webhook
 */

function response(statusCode, body, contentType = "text/plain; charset=utf-8") {
  return {
    statusCode,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    },
    body
  };
}

function getHeader(headers, name) {
  const wanted = String(name || "").toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() === wanted) return String(value ?? "");
  }
  return "";
}

function getBody(event) {
  let body = event && event.body != null ? String(event.body) : "";

  if (event && event.isBase64Encoded && body) {
    try {
      body = Buffer.from(body, "base64").toString("utf8");
    } catch (error) {
      console.error("Webhook base64 decode error:", error);
      body = "";
    }
  }

  return body.trim();
}

function hasEventPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  return Boolean(
    payload.event ||
    payload.type ||
    payload.name ||
    payload.data ||
    payload.id ||
    payload.order_id ||
    payload.waybill_id ||
    payload.tracking_id ||
    payload.status ||
    payload.order_status
  );
}

exports.handler = async function handler(event) {
  const method = String(event?.httpMethod || event?.requestContext?.http?.method || "GET").toUpperCase();

  // Health check / CORS preflight.
  if (method === "GET" || method === "OPTIONS") {
    return response(200, "ok");
  }

  // Biteship sends POST for webhook installation validation.
  if (method !== "POST") {
    return response(405, "Method Not Allowed");
  }

  const rawBody = getBody(event);
  const contentType = getHeader(event.headers, "content-type");

  console.log("[Biteship] request", {
    method,
    contentType,
    bodyLength: rawBody.length
  });

  // ------------------------------------------------------------
  // INSTALLATION VALIDATION
  // ------------------------------------------------------------
  // Empty body MUST be accepted with exactly HTTP 200 + "ok".
  if (!rawBody || rawBody === "{}" || rawBody === "null") {
    console.log("[Biteship] validation -> 200 ok");
    return response(200, "ok");
  }

  // ------------------------------------------------------------
  // Parse normal webhook JSON.
  // Invalid/non-event payloads are acknowledged with 200 so that
  // Biteship installation cannot fail because of body formatting.
  // ------------------------------------------------------------
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    console.error("[Biteship] invalid JSON:", error);
    return response(200, "ok");
  }

  if (!hasEventPayload(payload)) {
    console.log("[Biteship] non-event validation payload -> 200 ok");
    return response(200, "ok");
  }

  // Optional signature verification for REAL events only.
  const signatureKey = String(process.env.BITESHIP_WEBHOOK_SIGNATURE_KEY || "").trim();
  const signatureSecret = String(process.env.BITESHIP_WEBHOOK_SIGNATURE_SECRET || "").trim();

  if (signatureKey || signatureSecret) {
    if (!signatureKey || !signatureSecret) {
      return response(
        500,
        JSON.stringify({ success: false, message: "Webhook signature configuration is incomplete." }),
        "application/json; charset=utf-8"
      );
    }

    const receivedSignature = getHeader(event.headers, signatureKey);
    if (!receivedSignature || receivedSignature !== signatureSecret) {
      return response(
        401,
        JSON.stringify({ success: false, message: "Invalid webhook signature." }),
        "application/json; charset=utf-8"
      );
    }
  }

  // ------------------------------------------------------------
  // REAL EVENT
  // ------------------------------------------------------------
  try {
    const { processWebhookPayload } = require("./biteship-webhook-processor");
    const result = await processWebhookPayload(rawBody);

    return response(
      200,
      JSON.stringify({ success: true, received: true, result }),
      "application/json; charset=utf-8"
    );
  } catch (error) {
    console.error("[Biteship] processor error:", error);

    // Biteship has successfully delivered the event to this endpoint.
    // A processing/Firebase error must not turn the webhook delivery
    // into a failed HTTP response.
    return response(
      200,
      JSON.stringify({
        success: true,
        received: true,
        processed: false,
        message: "Webhook diterima."
      }),
      "application/json; charset=utf-8"
    );
  }
};
