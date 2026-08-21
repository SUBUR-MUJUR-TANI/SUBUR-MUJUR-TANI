const https = require("https");

function callBiteship(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: "api.biteship.com",
      path: "/v1/rates/couriers",
      method: "POST",
      headers: {
        Authorization: apiKey,
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


function errorMessage(data) {
  if (!data) return "Biteship mengembalikan respons kosong.";
  if (typeof data === "string") return data;
  if (data.message) return data.message;
  if (data.error) return typeof data.error === "string" ? data.error : JSON.stringify(data.error);
  if (data.detail) return typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
  if (Array.isArray(data.errors) && data.errors.length) return data.errors.map(e => typeof e === "string" ? e : (e.message || JSON.stringify(e))).join("; ");
  return "Biteship menolak request. Lihat kode/status respons untuk detail.";
}

exports.handler = async event => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ success:false, message:"Method harus POST." }) };

  try {
    const input = JSON.parse(event.body || "{}");
    const apiKey = String(process.env.BITESHIP_API_KEY || "").trim();
    const origin = String(process.env.BITESHIP_ORIGIN_POSTAL_CODE || "").trim();
    const destination = String(input.destinationPostalCode || input.destination || "").trim();
    const courier = String(input.courier || "all").trim().toLowerCase();
    const shippingCategory = String(input.shippingCategory || "reguler").trim().toLowerCase();
    const destinationLatitude = Number(input.destinationLatitude);
    const destinationLongitude = Number(input.destinationLongitude);

    if (!apiKey) return { statusCode:500, headers, body:JSON.stringify({success:false,message:"BITESHIP_API_KEY belum tersedia di Netlify Functions."}) };
    if (!/^\d{5}$/.test(origin)) return { statusCode:500, headers, body:JSON.stringify({success:false,message:"BITESHIP_ORIGIN_POSTAL_CODE harus berupa 5 digit."}) };
    if (!/^\d{5}$/.test(destination)) return { statusCode:400, headers, body:JSON.stringify({success:false,message:"Kode pos tujuan harus 5 digit."}) };


    // Jangan memanggil /v1/couriers di setiap perhitungan ongkir.
    // Endpoint tersebut bisa lambat/time-out dan tidak diperlukan untuk
    // menghitung tarif. Gunakan daftar courier yang memang relevan dengan
    // kategori pengiriman, lalu Biteship mengembalikan tarif yang tersedia.
    const courierSets = {
      reguler: [
        "jne", "jnt", "sicepat", "anteraja", "ninja", "lion", "pos",
        "tiki", "wahana", "sap", "idexpress", "rpx", "jdl"
      ],
      cargo: [
        "jne", "sicepat", "lion", "idexpress", "sap", "sentralcargo", "deliveree"
      ],
      instant: [
        "paxel", "lalamove", "grab", "gosend", "gojek", "borzo", "deliveree"
      ]
    };

    const fallbackCouriers = new Set(Object.values(courierSets).flat());

    // Untuk REGULER/CARGO, satu request awal mengambil kedua kelompok sekaligus.
    // Ini membuat pengguna cukup menekan "Hitung Ongkir" sekali lalu bisa
    // berpindah REGULER <-> CARGO tanpa meminta tarif ulang.
    const nonInstantCouriers = Array.from(new Set([
      ...courierSets.reguler,
      ...courierSets.cargo
    ]));

    if (courier !== "all" && !fallbackCouriers.has(courier)) {
      return { statusCode:400, headers, body:JSON.stringify({
        success:false,
        message:"Kurir tidak didukung untuk kategori pengiriman ini."
      }) };
    }

    const rawItems = Array.isArray(input.items) ? input.items : [];
    const totalWeight = Math.max(1, Math.round(Number(input.weight || 0) * 1000));
    const items = rawItems.length ? rawItems.map((item, i) => ({
      name: String(item.name || `Produk ${i+1}`),
      description: String(item.description || "Bibit tanaman"),
      value: Math.max(1, Math.round(Number(item.value || 1))),
      weight: Math.max(1, Math.round(Number(item.weight || 1))),
      quantity: Math.max(1, Math.round(Number(item.quantity || 1)))
    })) : [{
      name: "Paket Bibit Tanaman",
      description: "Paket pesanan",
      value: 1,
      weight: totalWeight,
      quantity: 1
    }];

    let requestedCouriers = courier;
    if (courier === "all") {
      if (shippingCategory === "instant") {
        requestedCouriers = courierSets.instant.join(",");
      } else {
        // REGULER + CARGO sekaligus. Frontend akan mengelompokkan hasil
        // berdasarkan service_type/shipping_type/nama layanan.
        requestedCouriers = nonInstantCouriers.join(",");
      }
    }

    const payload = {
      origin_postal_code: Number(origin),
      destination_postal_code: Number(destination),
      couriers: requestedCouriers,
      items
    };
    // Biteship membutuhkan koordinat untuk Instant seperti Lalamove/Paxel/Grab/GoSend.
    // Reguler/Cargo tetap menggunakan postal code tanpa meminta GPS pelanggan.
    if (shippingCategory === "instant") {
      if (!Number.isFinite(destinationLatitude) || !Number.isFinite(destinationLongitude)) {
        return { statusCode:400, headers, body:JSON.stringify({success:false,message:"Lokasi tujuan wajib dipilih untuk pengiriman Instant/Kendaraan."}) };
      }
      const originLat = Number(process.env.BITESHIP_ORIGIN_LATITUDE);
      const originLng = Number(process.env.BITESHIP_ORIGIN_LONGITUDE);
      if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
        return { statusCode:500, headers, body:JSON.stringify({success:false,message:"BITESHIP_ORIGIN_LATITUDE dan BITESHIP_ORIGIN_LONGITUDE belum diatur di Netlify."}) };
      }
      payload.origin_latitude = originLat;
      payload.origin_longitude = originLng;
      payload.destination_latitude = destinationLatitude;
      payload.destination_longitude = destinationLongitude;
      delete payload.origin_postal_code;
      delete payload.destination_postal_code;
    }

    // Jika checkout meminta COD, sertakan nilai COD dan tipe pencairan.
    if (input.codRequested === true) {
      const codAmount = Math.round(Number(input.codAmount || 0));
      const codType = String.fromCharCode(55) + "_days";

      if (!Number.isFinite(codAmount) || codAmount < 1000) {
        return { statusCode:400, headers, body:JSON.stringify({success:false,message:"Nilai COD minimal Rp1.000."}) };
      }
      if (codAmount > 15000000) {
        return { statusCode:400, headers, body:JSON.stringify({success:false,message:"Nilai COD maksimal Rp15.000.000."}) };
      }

      payload.destination_cash_on_delivery = codAmount;
      payload.destination_cash_on_delivery_type = codType;
    }

    const result = await callBiteship(apiKey, payload);
    const data = result.data || {};
    if (result.status < 200 || result.status >= 300 || data.success === false) {
      return { statusCode: result.status || 502, headers, body: JSON.stringify({
        success:false,
        message:errorMessage(data),
        biteship_status:result.status,
        biteship_code:data.code || null,
        courier,
        origin_postal_code:Number(origin),
        destination_postal_code:Number(destination)
      }) };
    }

    const pricing = Array.isArray(data.pricing) ? data.pricing.map(s => ({
      courier_code:s.courier_code || s.company || courier,
      courier_name:s.courier_name || s.company || courier.toUpperCase(),
      courier_service_code:s.courier_service_code || s.type || "",
      courier_service_name:s.courier_service_name || "Layanan",
      price:Number(s.price ?? s.shipping_fee ?? 0),
      duration:s.duration || (s.shipment_duration_range ? `${s.shipment_duration_range} ${s.shipment_duration_unit || ""}`.trim() : "-"),
      description:s.description || "",
      shipping_type:s.shipping_type || "parcel",
      service_type:s.service_type || "",
      type:s.type || "",
      available_for_cash_on_delivery: s.available_for_cash_on_delivery === true,
      cash_on_delivery_fee: Number(s.cash_on_delivery_fee || 0),
      // Simpan field mentah yang berguna untuk klasifikasi frontend.
      company: s.company || s.courier_code || "",
      currency: s.currency || "IDR"
    })) : [];

    return { statusCode:200, headers, body:JSON.stringify({ success:true, pricing, origin:data.origin, destination:data.destination, biteship_code:data.code || null }) };
  } catch (err) {
    return { statusCode:502, headers, body:JSON.stringify({ success:false, message:`Gagal menghubungi Biteship: ${err.message || err}` }) };
  }
};
