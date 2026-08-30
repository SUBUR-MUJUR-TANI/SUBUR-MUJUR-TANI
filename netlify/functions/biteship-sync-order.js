const { getFirebaseAdmin } = require("./firebaseAdmin");
const { assertProductionConfig, authorization, requireAdminEmail } = require("./biteship-client");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function safe(v, fallback = "") {
  const s = String(v == null ? "" : v).trim();
  return s || fallback;
}

async function verifyAdminToken(admin, token) {
  if (!token) throw new Error("Token admin tidak ditemukan. Silakan login ulang.");
  const decoded = await admin.auth().verifyIdToken(token);
  requireAdminEmail(decoded);
  return decoded;
}

function normalizeStatus(raw, currentStatus, isCOD) {
  const status = String(raw || "").toLowerCase().trim();
  const map = {
    confirmed: "Buat Pengiriman",
    scheduled: "Buat Pengiriman",
    allocated: "Dikirim",
    picking_up: "Dikirim",
    picked: "Dikirim",
    dropping_off: "Dikirim",
    delivered: "Selesai",
    cancelled: "Dibatalkan",
    rejected: "Dibatalkan",
    disposed: "Dibatalkan",
    on_hold: "Ditahan",
    courier_not_found: "Ditahan",
    return_in_transit: "Dikembalikan",
    returned: "Dikembalikan"
  };
  return map[status] || currentStatus || "Dikemas";
}

async function getBiteshipOrder(apiKey, orderId) {
  const response = await fetch(`https://api.biteship.com/v1/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: { Authorization: authorization(apiKey), Accept: "application/json", "Content-Type": "application/json" }
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { raw }; }
  if (!response.ok || data.success === false) {
    throw new Error(data.message || data.error || `Biteship GET Order gagal (HTTP ${response.status}).`);
  }
  return data;
}

async function syncOne(db, localId, tokenVerified = true) {
  const ref = db.ref("pesanan/" + localId);
  const snap = await ref.once("value");
  const order = snap.val();
  if (!order) throw new Error("Pesanan tidak ditemukan.");
  const biteshipOrderId = safe(order.biteshipOrderId);
  if (!biteshipOrderId) throw new Error("Pesanan belum memiliki Biteship Order ID.");

  const { apiKey } = assertProductionConfig();
  if (!apiKey) throw new Error("BITESHIP_API_KEY belum diisi di Netlify.");
  const data = await getBiteshipOrder(apiKey, biteshipOrderId);
  const courier = data.courier || {};
  const rawStatus = safe(data.status || data.order_status);
  const isCOD = String(order.metodePembayaran || "").toUpperCase() === "COD";
  const nextStatus = normalizeStatus(rawStatus, order.status, isCOD);
  const now = new Date().toLocaleString("id-ID");
  const waybill = safe(courier.waybill_id);
  const trackingId = safe(courier.tracking_id);
  const trackingUrl = safe(courier.link);
  const company = safe(courier.company);
  const type = safe(courier.type);

  const updates = {
    status: nextStatus,
    statusKategori: nextStatus,
    statusPengiriman: rawStatus || order.statusPengiriman || "",
    statusTerakhirDiperbarui: now,
    biteshipLastSyncAt: now,
    biteshipLastSyncSource: "GET /v1/orders"
  };
  if (waybill) updates.resi = waybill;
  if (trackingId) updates.biteshipTrackingId = trackingId;
  if (trackingUrl) updates.biteshipTrackingUrl = trackingUrl;
  if (company) updates.biteshipCourier = company;
  if (type) updates.biteshipCourierType = type;
  if (data.price != null && Number(data.price) >= 0) updates.biteshipShippingPrice = Number(data.price);
  if (isCOD && rawStatus.toLowerCase() === "delivered") {
    updates.statusPembayaran = "COD - Menunggu Pencairan";
    updates.codDeliveredAt = now;
  }
  await ref.update(updates);

  if (order.invoice) {
    const trackRef = db.ref("pelacakan/" + order.invoice);
    const trackSnap = await trackRef.once("value");
    const track = trackSnap.val() || {};
    const history = Array.isArray(track.riwayatStatus) ? track.riwayatStatus : [];
    const oldRaw = String(order.statusPengiriman || "");
    if (rawStatus && rawStatus !== oldRaw) {
      history.push({ status: nextStatus, waktu: now, sumber: "Biteship API", biteshipStatus: rawStatus });
    }
    await trackRef.update({
      invoice: order.invoice,
      nama: order.nama || "",
      total: Number(order.total || 0),
      status: nextStatus,
      statusKategori: nextStatus,
      resi: waybill || order.resi || track.resi || "",
      kurir: company || order.biteshipCourier || order.kurirKode || "",
      biteshipOrderId,
      biteshipTrackingUrl: trackingUrl || order.biteshipTrackingUrl || "",
      updatedAt: now,
      riwayatStatus: history.slice(-20)
    });
  }

  return {
    localOrderId: localId,
    biteshipOrderId,
    biteshipStatus: rawStatus,
    status: nextStatus,
    resi: waybill || order.resi || "",
    courier: company || order.biteshipCourier || "",
    trackingUrl: trackingUrl || order.biteshipTrackingUrl || ""
  };
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { success:false, message:"Method harus POST." });
  try {
    const input = JSON.parse(event.body || "{}");
    const orderId = safe(input.orderId);
    const token = safe(input.idToken);
    const admin = getFirebaseAdmin();
    await verifyAdminToken(admin, token);
    if (!orderId) return json(400, { success:false, message:"orderId wajib diisi." });
    const result = await syncOne(admin.database(), orderId);
    return json(200, { success:true, result });
  } catch (e) {
    console.error("biteship-sync-order:", e);
    return json(500, { success:false, message:e.message || "Gagal sinkronisasi Biteship." });
  }
};
