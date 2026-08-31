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

function callBiteship(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: "api.biteship.com",
      path: "/v1/orders",
      method: "POST",
      headers: {
        Authorization: authorization(apiKey),
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Length": Buffer.byteLength(body)
      },
      timeout: 30000
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
    req.on("timeout", () => req.destroy(new Error("Koneksi ke Biteship timeout (30 detik).")));
    req.on("error", reject);
    req.end(body);
  });
}

function messageOf(data) {
  if (!data) return "Biteship mengembalikan respons kosong.";
  if (typeof data === "string") return data;
  if (data.message) return String(data.message);
  if (data.error) return typeof data.error === "string" ? data.error : JSON.stringify(data.error);
  if (Array.isArray(data.errors) && data.errors.length) {
    return data.errors.map(e => typeof e === "string" ? e : (e.message || JSON.stringify(e))).join("; ");
  }
  return "Biteship menolak pembuatan order COD.";
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
    const token = String(input.idToken || "").trim();
    if (!orderId) return json(400, { success: false, message: "orderId wajib diisi." });

    const { apiKey } = assertProductionConfig();
    if (!apiKey) return json(500, { success: false, message: "BITESHIP_API_KEY belum diisi di Netlify." });

    const admin = getFirebaseAdmin();
    await verifyAdminToken(admin, token);
    const db = admin.database();
    const orderRef = db.ref("pesanan/" + orderId);
    const snap = await orderRef.once("value");
    const order = snap.val();

    if (!order) return json(404, { success: false, message: "Pesanan tidak ditemukan." });
    const isCOD = String(order.metodePembayaran || "").toUpperCase() === "COD";
    const paymentMethod = safe(order.metodePembayaran, "Transfer");
    if (String(order.status || "") !== "Dikemas") {
      return json(400, { success: false, message: "Pesanan harus berstatus Dikemas sebelum pengiriman dibuat." });
    }
    if (order.biteshipOrderId || order.resi) {
      return json(409, {
        success: false,
        message: "Pesanan ini sudah memiliki pengiriman Biteship/nomor resi.",
        biteshipOrderId: order.biteshipOrderId || null,
        resi: order.resi || null
      });
    }

    const originPostalCode = safe(process.env.BITESHIP_ORIGIN_POSTAL_CODE);
    const originName = safe(process.env.BITESHIP_ORIGIN_CONTACT_NAME);
    const originPhone = normalizePhone(process.env.BITESHIP_ORIGIN_CONTACT_PHONE);
    const originEmail = safe(process.env.BITESHIP_ORIGIN_CONTACT_EMAIL);
    const originAddress = safe(process.env.BITESHIP_ORIGIN_ADDRESS);
    const organization = safe(process.env.BITESHIP_ORIGIN_ORGANIZATION);

    if (!/^\d{5}$/.test(originPostalCode)) {
      return json(500, { success: false, message: "BITESHIP_ORIGIN_POSTAL_CODE harus 5 digit." });
    }
    if (!originPhone || !originAddress) {
      return json(500, { success: false, message: "BITESHIP_ORIGIN_CONTACT_PHONE dan BITESHIP_ORIGIN_ADDRESS wajib diisi di Netlify." });
    }
    if (!organization) {
      return json(500, { success: false, message: "BITESHIP_ORIGIN_ORGANIZATION wajib diisi di Netlify." });
    }
    // COD memakai fitur penagihan Biteship. Pembayaran transfer/non-COD
    // sudah lunas, sehingga field COD sengaja tidak dikirim ke Biteship.
    const codType = String.fromCharCode(55) + "_days";

    const courierCompany = safe(order.kurirKode || order.kurir).toLowerCase();
    const courierType = safe(order.layananKode);

    // Scheduled pickup is optional and applies to any courier/service only when
    // the selected Biteship service accepts it. The API remains the authority.
    const pickupScheduled = input.pickupScheduled === true;
    const pickupDate = safe(input.pickupDate);
    const pickupTime = safe(input.pickupTime);
    let pickupTimeISO = "";
    if (pickupScheduled) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate) || !/^\d{2}:\d{2}$/.test(pickupTime)) {
        return json(400, { success:false, message:"Tanggal dan jam pickup terjadwal belum valid." });
      }
      const candidate = new Date(`${pickupDate}T${pickupTime}:00+07:00`);
      if (!Number.isFinite(candidate.getTime()) || candidate.getTime() <= Date.now()) {
        return json(400, { success:false, message:"Jadwal pickup harus berada di masa depan." });
      }
      pickupTimeISO = candidate.toISOString();
    }
    if (!courierCompany || !courierType) {
      return json(400, { success: false, message: "Kurir atau layanan belum dipilih di Admin. Hitung tarif lalu pilih layanan terlebih dahulu." });
    }

    // Lock singkat untuk mencegah dua klik Admin membuat dua order Biteship.
    // Lock tidak dibuka sampai request selesai; jika request gagal, dilepas.
    const lockRef = orderRef.child("biteshipCreateLock");
    const lockNow = Date.now();
    const lockResult = await lockRef.transaction(current => {
      if (current && Number(current.until || 0) > lockNow) return;
      return { until: lockNow + 120000, at: new Date(lockNow).toISOString() };
    });
    if (!lockResult.committed) {
      return json(409, { success: false, message: "Pembuatan pengiriman sedang diproses. Tunggu sampai selesai sebelum mencoba lagi." });
    }

    const destinationPhone = normalizePhone(order.whatsapp);
    const destinationAddress = [
      safe(order.alamat),
      order.rt ? "RT " + safe(order.rt) : "",
      order.rw ? "RW " + safe(order.rw) : "",
      order.desa ? "Desa/Kel. " + safe(order.desa) : "",
      order.kecamatan ? "Kec. " + safe(order.kecamatan) : "",
      order.kabupaten ? safe(order.kabupaten) : "",
      order.provinsi ? safe(order.provinsi) : ""
    ].filter(Boolean).join(", ");

    if (!safe(order.nama) || !destinationPhone || !destinationAddress || !/^\d{5}$/.test(safe(order.kodePos))) {
      return json(400, { success: false, message: "Data tujuan belum lengkap. Nama, WhatsApp, alamat, dan kode pos wajib valid." });
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

    const totalOrder = Math.max(1, Math.round(Number(order.total || 0)));
    if (isCOD && totalOrder < 1000) {
      return json(400, { success: false, message: "Nilai COD minimal Rp1.000." });
    }
    if (isCOD && totalOrder > 15000000) {
      return json(400, { success: false, message: "Nilai COD maksimal Rp15.000.000 per paket." });
    }

    const payload = {
      shipper_contact_name: originName,
      shipper_contact_phone: originPhone,
      shipper_contact_email: originEmail || undefined,
      shipper_organization: organization,
      origin_contact_name: originName,
      origin_contact_phone: originPhone,
      origin_contact_email: originEmail || undefined,
      origin_address: originAddress,
      origin_postal_code: Number(originPostalCode),
      destination_contact_name: safe(order.nama),
      destination_contact_phone: destinationPhone,
      destination_address: destinationAddress,
      destination_postal_code: Number(order.kodePos),
      courier_company: courierCompany,
      courier_type: courierType,
      delivery_type: pickupScheduled ? "scheduled" : "now",
      ...(pickupScheduled ? { pickup_time: pickupTimeISO } : {}),
      order_note: `Pesanan ${safe(order.invoice, orderId)} - ${isCOD ? "COD" : paymentMethod}`,
      metadata: {
        local_order_id: orderId,
        invoice: safe(order.invoice),
        payment_method: isCOD ? "COD" : paymentMethod
      },
      reference_id: safe(order.invoice, orderId),
      items
    };

    // Hanya pesanan COD yang mengirim parameter cash-on-delivery ke Biteship.
    // Pesanan transfer/BCA/BRI/e-wallet yang sudah lunas diproses sebagai prepaid.
    if (isCOD) {
      payload.destination_cash_on_delivery = totalOrder;
      payload.destination_cash_on_delivery_type = codType;
    }

    // Instant courier membutuhkan koordinat asal dan tujuan. Reguler/Cargo tetap boleh memakai postal code.
    const originLat = Number(process.env.BITESHIP_ORIGIN_LATITUDE);
    const originLng = Number(process.env.BITESHIP_ORIGIN_LONGITUDE);
    const destinationLat = Number(order.destinationLatitude);
    const destinationLng = Number(order.destinationLongitude);
    const isInstant = ["instant","same_day","on_demand","instant_delivery"].some(x => String(order.shippingCategory || "").toLowerCase().includes(x))
      || /lalamove|paxel|grab|gosend|borzo/.test(courierCompany);
    if (isInstant) {
      if (!Number.isFinite(originLat) || !Number.isFinite(originLng) || !Number.isFinite(destinationLat) || !Number.isFinite(destinationLng)) {
        await lockRef.remove().catch(() => {});
        return json(400, { success:false, message:"Pengiriman Instant/Kendaraan membutuhkan koordinat asal dan tujuan. Pastikan pelanggan menekan Gunakan Lokasi Saya dan koordinat toko sudah diatur di Netlify." });
      }
      payload.origin_coordinate = { latitude: originLat, longitude: originLng };
      payload.destination_coordinate = { latitude: destinationLat, longitude: destinationLng };
    }

    // JSON.stringify menghapus properti undefined, tetapi kita tetap bersihkan agar payload rapi.
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    const result = await callBiteship(apiKey, payload);
    if (result.status < 200 || result.status >= 300 || result.data?.success === false) {
      await lockRef.remove().catch(() => {});
      return json(result.status || 502, {
        success: false,
        message: messageOf(result.data),
        biteship_status: result.status,
        biteship_code: result.data?.code || null,
        biteship_error: result.data?.error || null
      });
    }

    const data = result.data || {};
    const courier = data.courier || {};
    const waybill = safe(courier.waybill_id);
    const trackingId = safe(courier.tracking_id);
    const status = safe(data.status, "confirmed");
    const now = new Date().toLocaleString("id-ID");

    await orderRef.update({
      status: "Buat Pengiriman",
      statusKategori: "Buat Pengiriman",
      statusPengiriman: status,
      statusPembayaran: isCOD ? "COD - Menunggu Penagihan" : "Lunas",
      biteshipOrderId: safe(data.id),
      biteshipTrackingId: trackingId,
      resi: waybill,
      biteshipCourier: safe(courier.company, courierCompany),
      biteshipCourierType: safe(courier.type, courierType),
      biteshipTrackingUrl: safe(courier.link),
      biteshipCOD: isCOD ? totalOrder : 0,
      biteshipCODType: isCOD ? safe(payload.destination_cash_on_delivery_type) : "",
      biteshipShippingPrice: Number(order.ongkir || 0),
      biteshipDeliveryType: pickupScheduled ? "scheduled" : "now",
      biteshipPickupTime: pickupScheduled ? pickupTimeISO : "",
      biteshipCreatedAt: now,
      statusTerakhirDiperbarui: now,
      biteshipCreateLock: null
    });

    if (order.invoice) {
      const trackRef = db.ref("pelacakan/" + order.invoice);
      const trackSnap = await trackRef.once("value");
      const track = trackSnap.val() || {};
      const history = Array.isArray(track.riwayatStatus) ? track.riwayatStatus : [];
      history.push({ status: "Buat Pengiriman", waktu: now });
      await trackRef.update({
        invoice: order.invoice,
        nama: order.nama || "",
        total: Number(order.total || 0),
        status: "Buat Pengiriman",
        statusKategori: "Buat Pengiriman",
        resi: waybill || track.resi || "",
        kurir: safe(courier.company, courierCompany),
        biteshipOrderId: safe(data.id),
        biteshipTrackingUrl: safe(courier.link),
        whatsappLast4: String(order.whatsapp || "").replace(/\D/g, "").slice(-4),
        updatedAt: now,
        riwayatStatus: history.slice(-20)
      });
    }

    return json(200, {
      success: true,
      message: isCOD ? "Order COD Biteship berhasil dibuat." : "Order Biteship berhasil dibuat untuk pesanan yang sudah lunas.",
      orderId,
      biteshipOrderId: safe(data.id),
      waybill_id: waybill,
      tracking_id: trackingId,
      courier_company: safe(courier.company, courierCompany),
      courier_type: safe(courier.type, courierType),
      status,
      delivery_type: pickupScheduled ? "scheduled" : "now",
      pickup_time: pickupScheduled ? pickupTimeISO : ""
    });
  } catch (err) {
    console.error("create-biteship-order:", err);
    try {
      if (typeof orderRef !== "undefined" && orderRef) await orderRef.child("biteshipCreateLock").remove();
    } catch (_) {}
    return json(500, { success: false, message: err.message || "Gagal membuat order Biteship." });
  }
};
