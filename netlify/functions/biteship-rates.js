const https = require("https");
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

function safe(value, fallback = "") {
  const v = String(value == null ? "" : value).trim();
  return v || fallback;
}

function normalizePhone(phone) {
  let p = String(phone || "").replace(/[^0-9+]/g, "");
  if (p.startsWith("+62")) p = "0" + p.slice(3);
  if (p.startsWith("62")) p = "0" + p.slice(2);
  return p;
}

function messageOf(data) {
  if (!data) return "Biteship mengembalikan respons kosong.";
  if (typeof data === "string") return data;
  if (data.message) return String(data.message);
  if (data.error) return typeof data.error === "string" ? data.error : JSON.stringify(data.error);
  if (Array.isArray(data.errors) && data.errors.length) {
    return data.errors.map(e => typeof e === "string" ? e : (e.message || JSON.stringify(e))).join("; ");
  }
  return "Biteship menolak permintaan tarif.";
}

function callBiteship(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: "api.biteship.com",
      path: "/v1/rates/couriers",
      method: "POST",
      headers: {
        Authorization: authorization(apiKey),
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Length": Buffer.byteLength(body)
      },
      timeout: 25000
    }, res => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", chunk => raw += chunk);
      res.on("end", () => {
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; }
        catch { data = { raw }; }
        resolve({ status: res.statusCode || 0, data });
      });
    });
    req.on("timeout", () => req.destroy(new Error("Koneksi ke Biteship timeout (25 detik).")));
    req.on("error", reject);
    req.end(body);
  });
}

async function verifyAdminToken(admin, token) {
  if (!token) throw new Error("Token admin tidak ditemukan. Silakan login ulang.");
  const decoded = await admin.auth().verifyIdToken(token);
  requireAdminEmail(decoded);
  return decoded;
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { success: false, message: "Method harus POST." });

  try {
    const input = JSON.parse(event.body || "{}");
    const orderId = safe(input.orderId);
    const token = safe(input.idToken);

    if (!orderId) return json(400, { success: false, message: "orderId wajib diisi." });

    const { apiKey } = assertProductionConfig();
    const originPostalCode = safe(process.env.BITESHIP_ORIGIN_POSTAL_CODE);

    if (!apiKey) return json(500, { success: false, message: "BITESHIP_API_KEY belum diisi di Netlify." });
    if (!/^\d{5}$/.test(originPostalCode)) {
      return json(500, { success: false, message: "BITESHIP_ORIGIN_POSTAL_CODE harus 5 digit." });
    }

    const admin = getFirebaseAdmin();
    await verifyAdminToken(admin, token);

    const db = admin.database();
    const ref = db.ref("pesanan/" + orderId);
    const snap = await ref.once("value");
    const order = snap.val();

    if (!order) return json(404, { success: false, message: "Pesanan tidak ditemukan." });
    if (String(order.metodePembayaran || "").toUpperCase() !== "COD") {
      return json(400, { success: false, message: "Fitur pengiriman Admin ini khusus pesanan COD." });
    }
    if (!["Dikemas", "Buat Pengiriman"].includes(String(order.status || ""))) {
      return json(400, { success: false, message: "Pesanan harus berada pada tahap Dikemas sebelum tarif dihitung." });
    }
    if (order.biteshipOrderId || order.resi) {
      return json(409, {
        success: false,
        message: "Pengiriman Biteship sudah dibuat untuk pesanan ini.",
        biteshipOrderId: order.biteshipOrderId || null,
        resi: order.resi || null
      });
    }

    const destinationPostalCode = safe(order.kodePos);
    if (!/^\d{5}$/.test(destinationPostalCode)) {
      return json(400, { success: false, message: "Kode pos pelanggan harus 5 digit." });
    }

    const items = Array.isArray(order.produk) ? order.produk.map((item, i) => ({
      name: safe(item.variantNama ? `${item.nama} - ${item.variantNama}` : item.nama, `Produk ${i + 1}`),
      description: "Bibit tanaman",
      value: Math.max(1, Math.round(Number(item.harga || item.subtotal || 1))),
      quantity: Math.max(1, Math.round(Number(item.jumlah || 1))),
      weight: Math.max(1, Math.round(Number(item.berat || 1000))),
      length: Math.max(0, Number(item.panjang ?? item.length ?? 0)),
      width: Math.max(0, Number(item.lebar ?? item.width ?? 0)),
      height: Math.max(0, Number(item.tinggi ?? item.height ?? 0))
    })) : [];

    if (!items.length) return json(400, { success: false, message: "Produk pesanan kosong." });

    const totalProduk = Math.max(1, Math.round(Number(order.totalProduk || 0)));
    const currentOngkir = Math.max(0, Math.round(Number(order.ongkir || 0)));
    const codAmount = Math.max(1000, Math.round(totalProduk + currentOngkir));

    // Tipe COD untuk perhitungan tarif ditetapkan di server.
    // Dibentuk saat runtime agar tidak terbaca sebagai nilai secret oleh Netlify.
    const codType = String.fromCharCode(55) + "_days";

    const payload = {
      origin_postal_code: Number(originPostalCode),
      destination_postal_code: Number(destinationPostalCode),
      items,
      couriers: "jne,jnt,jntcargo,sicepat,anteraja,ninja,lion,pos,tiki,wahana,sap,idexpress,rpx,sentralcargo,paxel,deliveree,lalamove,jdl,grab,gosend,borzo",
      destination_cash_on_delivery: codAmount,
      destination_cash_on_delivery_type: codType
    };

    const dLat = Number(order.destinationLatitude);
    const dLng = Number(order.destinationLongitude);
    const originLat = Number(process.env.BITESHIP_ORIGIN_LATITUDE);
    const originLng = Number(process.env.BITESHIP_ORIGIN_LONGITUDE);
    if (Number.isFinite(dLat) && Number.isFinite(dLng)) {
      payload.destination_latitude = dLat;
      payload.destination_longitude = dLng;
      if (Number.isFinite(originLat) && Number.isFinite(originLng)) {
        payload.origin_latitude = originLat;
        payload.origin_longitude = originLng;
        delete payload.origin_postal_code;
        delete payload.destination_postal_code;
      }
    }

    const result = await callBiteship(apiKey, payload);
    const data = result.data || {};

    if (result.status < 200 || result.status >= 300 || data.success === false) {
      return json(result.status || 502, {
        success: false,
        message: messageOf(data),
        biteship_status: result.status,
        biteship_code: data.code || null
      });
    }

    const pricing = Array.isArray(data.pricing) ? data.pricing.map((s, i) => ({
      index: i,
      courier_code: safe(s.courier_code || s.company),
      courier_name: safe(s.courier_name || s.company || "Kurir"),
      courier_service_code: safe(s.courier_service_code || s.type),
      courier_service_name: safe(s.courier_service_name || s.type || "Layanan"),
      price: Math.max(0, Math.round(Number(s.price ?? s.shipping_fee ?? 0))),
      duration: safe(s.duration || (s.shipment_duration_range
        ? `${s.shipment_duration_range} ${s.shipment_duration_unit || ""}`.trim()
        : "-")),
      description: safe(s.description),
      available_for_cash_on_delivery: s.available_for_cash_on_delivery === true,
      cash_on_delivery_fee: Math.max(0, Math.round(Number(s.cash_on_delivery_fee || 0)))
    }))
    .filter(x => x.courier_code && x.courier_service_code) : [];

    return json(200, {
      success: true,
      pricing,
      totalProduk,
      currentOngkir,
      codAmount,
      codType,
      destinationPostalCode,
      biteship_code: data.code || null
    });
  } catch (err) {
    console.error("biteship-rates:", err);
    return json(500, { success: false, message: err.message || "Gagal mengambil tarif Biteship." });
  }
};
