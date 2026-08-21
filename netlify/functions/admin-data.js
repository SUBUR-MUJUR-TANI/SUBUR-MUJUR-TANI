const { getFirebaseAdmin } = require('./firebaseAdmin');
const { JWT } = require('google-auth-library');

const ALLOWED_ROOTS = new Set(['pesanan','pembayaran','penarikan','pengembalian','pelacakan','notifikasiToko','produk','ulasan']);
const DB_SCOPES = ['https://www.googleapis.com/auth/firebase.database','https://www.googleapis.com/auth/userinfo.email'];
let googleJwt = null;
let googleTokenPromise = null;

function json(statusCode, body){
  return {
    statusCode,
    headers: {'Content-Type':'application/json','Cache-Control':'no-store'},
    body: JSON.stringify(body)
  };
}

function getServiceAccount(){
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (raw) {
    const s = JSON.parse(raw);
    return {
      email: s.client_email || s.clientEmail,
      key: String(s.private_key || s.privateKey || '').replace(/\\n/g, '\n')
    };
  }
  const email = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const key = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Firebase Admin belum dikonfigurasi. Isi FIREBASE_SERVICE_ACCOUNT_JSON di Netlify.');
  return {email, key};
}

async function getGoogleAccessToken(){
  if (googleTokenPromise) return googleTokenPromise;
  googleTokenPromise = (async () => {
    const sa = getServiceAccount();
    if (!googleJwt) googleJwt = new JWT({email: sa.email, key: sa.key, scopes: DB_SCOPES});
    const token = await googleJwt.getAccessToken();
    if (!token) throw new Error('Gagal mendapatkan Google access token untuk Firebase Database.');
    return token;
  })();
  try { return await googleTokenPromise; }
  finally { googleTokenPromise = null; }
}

function databaseUrl(){
  return String(process.env.FIREBASE_DATABASE_URL || 'https://subur-mujur-tani-6ff54-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/+$/,'');
}

function dbPath(path){
  return String(path || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

async function restRequest(path, method, body){
  const token = await getGoogleAccessToken();
  const url = databaseUrl() + '/' + dbPath(path) + '.json';
  const headers = {'Authorization': `Bearer ${token}`};
  const options = {method, headers};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!response.ok) {
    const msg = typeof data === 'string' ? data : (data?.error || data?.message || `Firebase REST HTTP ${response.status}`);
    throw new Error(String(msg));
  }
  return data;
}

async function getData(path, root){
  // Keep root collection reads bounded. REST avoids recursive DataSnapshot
  // materialization on large/deep collections and keeps Admin reads server-side.
  const token = await getGoogleAccessToken();
  const base = databaseUrl() + '/' + dbPath(path) + '.json';
  const isRoot = path === root;
  const query = isRoot ? '?orderBy=%22%24key%22&limitToLast=200' : '';
  const response = await fetch(base + query, {headers:{'Authorization':`Bearer ${token}`}});
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!response.ok) {
    const msg = typeof data === 'string' ? data : (data?.error || data?.message || `Firebase REST HTTP ${response.status}`);
    throw new Error(String(msg));
  }
  return data;
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

    const op = String(input.op || 'get').toLowerCase();
    if (op === 'get') {
      const data = await getData(path, root);
      return json(200, {success:true,data});
    }

    if (op === 'set') {
      if (input.data === undefined) return json(400, {success:false,message:'Data tidak ditemukan.'});
      const data = await restRequest(path, 'PUT', input.data);
      return json(200, {success:true,data});
    }

    if (op === 'update') {
      if (input.data === undefined || input.data === null || typeof input.data !== 'object') {
        return json(400, {success:false,message:'Data update tidak ditemukan.'});
      }
      const data = await restRequest(path, 'PATCH', input.data);
      return json(200, {success:true,data});
    }

    if (op === 'remove') {
      await restRequest(path, 'DELETE');
      return json(200, {success:true,data:null});
    }

    return json(400, {success:false,message:'Operasi database tidak diizinkan.'});
  } catch (e) {
    console.error('admin-data:', e);
    return json(500, {success:false,message:e.message || 'Gagal membaca data admin.'});
  }
};
