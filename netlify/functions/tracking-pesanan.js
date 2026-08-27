const { getFirebaseAdmin } = require('./firebaseAdmin');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

const safe = v => String(v == null ? '' : v).trim();

function normalizeLocation(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value !== 'object') return String(value).trim();
  return [
    value.name,
    value.location_name,
    value.city,
    value.city_name,
    value.district,
    value.district_name,
    value.regency,
    value.province,
    value.province_name,
    value.address
  ].filter(Boolean).map(String).join(', ');
}

function findLocation(item) {
  if (!item || typeof item !== 'object') return '';
  const direct = [
    item.location,
    item.current_location,
    item.location_name,
    item.city,
    item.city_name,
    item.destination_city,
    item.hub,
    item.hub_name,
    item.transit,
    item.transit_location
  ];
  for (const v of direct) {
    const s = normalizeLocation(v);
    if (s) return s;
  }
  return '';
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map((x, i) => {
    const item = x || {};
    return {
      status: safe(item.status || item.description || item.note || 'Update'),
      waktu: safe(item.updated_at || item.datetime || item.created_at || item.date || ''),
      lokasi: findLocation(item),
      catatan: safe(item.note || item.description || item.message || ''),
      raw: item,
      _i: i
    };
  }).filter(x => x.status || x.lokasi || x.catatan);
}

async function getJson(url, apiKey) {
  const r = await fetch(url, {
    headers: { Authorization: apiKey, Accept: 'application/json', 'Content-Type': 'application/json' }
  });
  const raw = await r.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { raw }; }
  if (!r.ok || data.success === false) {
    throw new Error(data.message || data.error || `Biteship tracking gagal (HTTP ${r.status}).`);
  }
  return data;
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { success:false, message:'Method harus POST.' });

  try {
    const input = JSON.parse(event.body || '{}');
    const invoice = safe(input.invoice).toUpperCase();
    const last4 = safe(input.whatsappLast4).replace(/\D/g, '');
    if (!invoice || !/^\d{4}$/.test(last4)) {
      return json(400, { success:false, message:'Nomor invoice dan 4 digit terakhir WhatsApp wajib diisi.' });
    }

    const apiKey = safe(process.env.BITESHIP_API_KEY);
    if (!apiKey) return json(500, { success:false, message:'BITESHIP_API_KEY belum diatur di Netlify.' });

    const admin = getFirebaseAdmin();
    const db = admin.database();
    const orders = await db.ref('pesanan').once('value');
    let order = null;
    let orderId = '';
    orders.forEach(child => {
      const value = child.val() || {};
      if (safe(value.invoice).toUpperCase() === invoice) {
        order = value;
        orderId = child.key;
      }
    });
    if (!order) return json(404, { success:false, message:'Pesanan tidak ditemukan.' });

    const storedLast4 = safe(order.whatsapp).replace(/\D/g, '').slice(-4);
    if (storedLast4 !== last4) return json(403, { success:false, message:'Data verifikasi tidak cocok.' });

    const result = {
      invoice,
      status: safe(order.status || 'Menunggu Pembayaran'),
      statusPengiriman: safe(order.statusPengiriman || ''),
      resi: safe(order.resi || ''),
      kurir: safe(order.biteshipCourier || order.kurirNama || order.kurirKode || ''),
      trackingUrl: safe(order.biteshipTrackingUrl || ''),
      eta: '',
      lokasiSekarang: '',
      riwayatLokasi: [],
      orderId,
      source: 'Firebase'
    };

    // GET Order is useful for Biteship order status, ETA, driver and live link.
    if (order.biteshipOrderId) {
      try {
        const orderData = await getJson(`https://api.biteship.com/v1/orders/${encodeURIComponent(order.biteshipOrderId)}`, apiKey);
        const courier = orderData.courier || {};
        result.statusPengiriman = safe(orderData.status || result.statusPengiriman);
        result.resi = safe(courier.waybill_id || result.resi);
        result.kurir = safe(courier.company || courier.name || result.kurir);
        result.trackingUrl = safe(courier.link || result.trackingUrl);
        result.eta = safe(orderData.eta || courier.eta || orderData.estimated_arrival || '');
        const history = normalizeHistory(courier.history || orderData.history || []);
        if (history.length) result.riwayatLokasi = history;
        result.source = 'Biteship Order API';
      } catch (e) {
        result.orderApiError = e.message;
      }
    }

    // Public tracking gives the most useful transit/location history for regular couriers.
    // It is called only when a waybill and courier code are available.
    const courierCode = safe(order.kurirKode || order.kurir || '').toLowerCase();
    if (result.resi && courierCode) {
      try {
        const url = `https://api.biteship.com/v1/trackings/${encodeURIComponent(result.resi)}/couriers/${encodeURIComponent(courierCode)}`;
        const tracking = await getJson(url, apiKey);
        const history = normalizeHistory(
          tracking.history || tracking.tracking_history || tracking.data?.history || tracking.data?.tracking_history || []
        );
        if (history.length) result.riwayatLokasi = history;
        const current = tracking.current_location || tracking.location || tracking.data?.current_location || tracking.data?.location;
        result.lokasiSekarang = normalizeLocation(current) || result.riwayatLokasi.findLast?.(x => x.lokasi)?.lokasi || '';
        result.eta = safe(tracking.eta || tracking.data?.eta || result.eta);
        result.source = 'Biteship Tracking API';
      } catch (e) {
        result.publicTrackingError = e.message;
      }
    }

    // Keep a lightweight copy in Firebase so the customer can still see the last
    // successful location/status even when the courier API is temporarily unavailable.
    const trackRef = db.ref('pelacakan/' + invoice);
    const trackSnap = await trackRef.once('value');
    const oldTrack = trackSnap.val() || {};
    const updates = {
      invoice,
      nama: order.nama || oldTrack.nama || '',
      total: Number(order.total || oldTrack.total || 0),
      status: result.status,
      statusKategori: result.status,
      resi: result.resi,
      kurir: result.kurir,
      updatedAt: new Date().toLocaleString('id-ID')
    };
    if (result.trackingUrl) updates.biteshipTrackingUrl = result.trackingUrl;
    if (result.lokasiSekarang) updates.lokasiSekarang = result.lokasiSekarang;
    if (result.eta) updates.eta = result.eta;
    if (result.riwayatLokasi.length) updates.riwayatLokasi = result.riwayatLokasi.slice(-30);
    await trackRef.update(updates);

    return json(200, { success:true, data:result });
  } catch (e) {
    console.error('tracking-pesanan:', e);
    return json(500, { success:false, message:e.message || 'Gagal mengambil detail pengiriman.' });
  }
};
