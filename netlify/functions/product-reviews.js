const { getFirebaseAdmin } = require('./firebaseAdmin');

function json(statusCode, body){
  return {
    statusCode,
    headers: {
      'Content-Type':'application/json',
      'Cache-Control':'no-store, no-cache, must-revalidate'
    },
    body: JSON.stringify(body)
  };
}

function normalizeName(value){
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'GET') return json(405, {success:false, message:'Method harus GET.'});

  try {
    const productId = String(event.queryStringParameters?.productId || '').trim();
    const productName = normalizeName(event.queryStringParameters?.productName || '');
    if (!productId && !productName) {
      return json(400, {success:false, message:'Produk tidak ditentukan.'});
    }

    const admin = getFirebaseAdmin();
    const snap = await admin.database().ref('ulasan').once('value');
    const data = snap.val() || {};
    const result = {};

    Object.entries(data).forEach(([id, raw]) => {
      if (!raw || typeof raw !== 'object') return;
      const reviewId = String(raw.productId || '').trim();
      const reviewName = normalizeName(raw.productName || '');
      const belongs = (productId && reviewId === productId) ||
        (productName && reviewName === productName);
      if (!belongs) return;

      // Never expose reviewToken/orderId through the public fallback endpoint.
      result[id] = {
        nama: String(raw.nama || 'Pelanggan'),
        productId: reviewId,
        productName: String(raw.productName || ''),
        rating: Math.max(1, Math.min(5, Number(raw.rating) || 5)),
        isi: String(raw.isi || ''),
        foto: String(raw.foto || ''),
        waktu: Number(raw.waktu || 0),
        tanggal: String(raw.tanggal || ''),
        dibuatOlehAdmin: !!raw.dibuatOlehAdmin
      };
    });

    return json(200, {success:true, data:result});
  } catch (e) {
    console.error('product-reviews:', e);
    return json(500, {success:false, message:e.message || 'Gagal memuat ulasan produk.'});
  }
};
