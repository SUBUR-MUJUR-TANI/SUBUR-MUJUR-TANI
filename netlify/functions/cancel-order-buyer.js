const { getFirebaseAdmin } = require("./firebaseAdmin");
const { assertProductionConfig, authorization } = require("./biteship-client");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { success:false, message:"Method harus POST." });

  try {
    const input = JSON.parse(event.body || "{}");
    const invoice = String(input.invoice || "").trim().toUpperCase();
    const last4 = String(input.whatsappLast4 || "").replace(/\D/g, "").slice(-4);

    if (!invoice || !/^\d{4}$/.test(last4)) {
      return json(400, {success:false, message:"Nomor invoice dan 4 digit terakhir WhatsApp wajib diisi."});
    }

    const admin = getFirebaseAdmin();
    const db = admin.database();
    const snap = await db.ref("pesanan").orderByChild("invoice").equalTo(invoice).once("value");
    let orderId = "";
    let order = null;
    snap.forEach(child => {
      if (!order) { orderId = child.key; order = child.val(); }
    });
    if (!order) return json(404, {success:false, message:"Pesanan tidak ditemukan."});

    const ownerLast4 = String(order.whatsapp || "").replace(/\D/g, "").slice(-4);
    if (ownerLast4 !== last4) {
      return json(403, {success:false, message:"Verifikasi pesanan tidak cocok."});
    }

    const current = String(order.status || "").trim();
    const forbiddenLocal = ["Dikirim","Selesai","Dibatalkan","Dikembalikan"];
    if (forbiddenLocal.includes(current)) {
      return json(400, {success:false, message:`Pesanan dengan status ${current} tidak dapat dibatalkan.`});
    }

    const biteshipId = String(order.biteshipOrderId || "").trim();
    const waybill = String(order.resi || order.waybillId || order.waybill_id || "").trim();
    const biteshipStatus = String(order.statusPengiriman || "").toLowerCase().trim();

    // If a Biteship shipment exists, only cancel while it is still before pickup.
    if (biteshipId) {
      const cancellable = ["confirmed","scheduled","allocated"].includes(biteshipStatus);
      if (!cancellable) {
        return json(400, {
          success:false,
          message:"Pesanan sudah masuk proses pengiriman/diambil kurir dan tidak dapat dibatalkan dari aplikasi."
        });
      }

      const { apiKey } = assertProductionConfig();
      if (!apiKey) return json(500, {success:false, message:"BITESHIP_API_KEY belum diisi di Netlify."});

      const r = await fetch(`https://api.biteship.com/v1/orders/${encodeURIComponent(biteshipId)}/cancel`, {
        method:"POST",
        headers:{Authorization:authorization(apiKey), Accept:"application/json", "Content-Type":"application/json"}
      });
      const raw = await r.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = {raw}; }
      if (!r.ok || data.success === false) {
        throw new Error(data.message || data.error || `Biteship cancel gagal (HTTP ${r.status}).`);
      }
    }

    const now = new Date().toLocaleString("id-ID");
    const updates = {
      status:"Dibatalkan",
      statusKategori:"Dibatalkan",
      statusPengiriman: biteshipId ? "cancelled" : (order.statusPengiriman || ""),
      statusTerakhirDiperbarui: now,
      dibatalkanPada: now,
      dibatalkanOleh: "Pembeli"
    };
    await db.ref("pesanan/" + orderId).update(updates);

    if (order.invoice) {
      await db.ref("pelacakan/" + order.invoice).update({
        status:"Dibatalkan",
        statusKategori:"Dibatalkan",
        updatedAt:now,
        dibatalkanPada:now,
        dibatalkanOleh:"Pembeli"
      });
    }

    return json(200, {
      success:true,
      message:"Pesanan berhasil dibatalkan.",
      invoice: order.invoice,
      hasBiteshipShipment: !!biteshipId,
      resi: waybill || null
    });
  } catch (e) {
    console.error("buyer-cancel-order:", e);
    return json(500, {success:false, message:e.message || "Gagal membatalkan pesanan."});
  }
};
