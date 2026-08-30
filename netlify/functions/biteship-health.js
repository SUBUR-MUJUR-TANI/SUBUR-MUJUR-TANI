const { getApiKey, getEnvironment, isTestKey } = require('./biteship-client');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async event => {
  if (event.httpMethod !== 'GET') return json(405, { success: false, message: 'Method harus GET.' });

  const apiKey = getApiKey();
  const env = getEnvironment();
  const originPostalCode = String(process.env.BITESHIP_ORIGIN_POSTAL_CODE || '').trim();
  const originPhone = String(process.env.BITESHIP_ORIGIN_CONTACT_PHONE || '').trim();
  const originAddress = String(process.env.BITESHIP_ORIGIN_ADDRESS || '').trim();
  const organization = String(process.env.BITESHIP_ORIGIN_ORGANIZATION || '').trim();
  const adminEmails = String(process.env.BITESHIP_ADMIN_EMAILS || '').split(',').map(x => x.trim()).filter(Boolean);
  const firebaseReady = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (
    process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
  ));
  const productionKeyOk = env === 'production' && Boolean(apiKey) && !isTestKey(apiKey);

  const checks = {
    biteship_api_key: Boolean(apiKey),
    production_key: productionKeyOk,
    origin_postal_code: /^\d{5}$/.test(originPostalCode),
    origin_contact_phone: Boolean(originPhone),
    origin_address: Boolean(originAddress),
    origin_organization: Boolean(organization),
    admin_allowlist: env === 'production' ? adminEmails.length > 0 : true,
    firebase_admin: firebaseReady
  };

  const ready = env === 'production' && Object.values(checks).every(Boolean);
  return json(ready ? 200 : 503, {
    success: ready,
    environment: env,
    checks,
    message: ready
      ? 'Biteship Production configuration siap.'
      : 'Konfigurasi Biteship belum siap untuk Production. Jangan membuat pengiriman nyata sebelum semua check bernilai true.'
  });
};
