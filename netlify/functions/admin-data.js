const { getFirebaseAdmin } = require('./firebaseAdmin');

const ALLOWED_ROOTS = new Set(['pesanan','pembayaran','penarikan','pengembalian','pelacakan','notifikasiToko']);

function json(statusCode, body){
  return {
    statusCode,
    headers: {'Content-Type':'application/json','Cache-Control':'no-store'},
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, {success:false,message:'Method harus POST.'});

  try {
    const input = JSON.parse(event.body || '{}');
    const token = String(input.idToken || '').trim();
    const path = String(input.path || '').replace(/^\/+|\/+$/g, '');
    if (!token) return json(401, {success:false,message:'Sesi admin tidak ditemukan.'});

    const root = path.split('/')[0];
    if (!ALLOWED_ROOTS.has(root)) return json(400, {success:false,message:'Path admin tidak diizinkan.'});

    const admin = getFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(token);

    const allowedEmails = String(process.env.BITESHIP_ADMIN_EMAILS || process.env.ADMIN_EMAILS || '')
      .split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    if (allowedEmails.length && !allowedEmails.includes(String(decoded.email || '').toLowerCase())) {
      return json(403, {success:false,message:'Akun tidak memiliki akses admin.'});
    }

    const db = admin.database();
    const ref = db.ref(path);
    const op = String(input.op || 'get').toLowerCase();

    if (op === 'get') {
      // Jangan materialize root collection besar sekaligus dari Admin SDK.
      // Root pesanan/pembayaran dibatasi ke 500 item terakhir; child path penuh.
      const isRoot = path === root;
      const snap = (isRoot && ['pesanan','pembayaran','penarikan','pengembalian','pelacakan','notifikasiToko'].includes(root))
        ? await ref.orderByKey().limitToLast(500).once('value')
        : await ref.once('value');
      return json(200, {success:true,data:snap.val()});
    }

    if (op === 'set' || op === 'update') {
      const value = input.data;
      if (value === undefined) return json(400, {success:false,message:'Data tidak ditemukan.'});
      if (op === 'set') await ref.set(value);
      else await ref.update(value);
      const snap = await ref.once('value');
      return json(200, {success:true,data:snap.val()});
    }

    if (op === 'remove') {
      await ref.remove();
      return json(200, {success:true,data:null});
    }

    if (op === 'push') {
      const value = input.data;
      const child = ref.push();
      if (value !== undefined) await child.set(value);
      return json(200, {success:true,key:child.key,data:value === undefined ? null : value});
    }

    return json(400, {success:false,message:'Operasi database tidak diizinkan.'});
  } catch (e) {
    console.error('admin-data:', e);
    return json(500, {success:false,message:e.message || 'Gagal membaca data admin.'});
  }
};
