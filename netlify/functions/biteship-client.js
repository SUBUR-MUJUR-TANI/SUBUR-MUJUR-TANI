/** Shared Biteship production configuration.
 *
 * Biteship uses the same API hostname for sandbox and production. The
 * environment is selected by the API key, so this helper deliberately
 * blocks a sandbox key when BITESHIP_ENV=production.
 */
function getApiKey() {
  return String(process.env.BITESHIP_API_KEY || '').trim();
}

function getEnvironment() {
  return String(process.env.BITESHIP_ENV || 'production').trim().toLowerCase();
}

function isTestKey(apiKey) {
  return /^biteship_test\./i.test(String(apiKey || '').trim());
}

function assertProductionConfig() {
  const apiKey = getApiKey();
  const env = getEnvironment();

  if (!apiKey) throw new Error('BITESHIP_API_KEY belum diisi di Netlify.');
  if (!['production', 'testing'].includes(env)) {
    throw new Error('BITESHIP_ENV harus production atau testing.');
  }
  if (env === 'production' && isTestKey(apiKey)) {
    throw new Error('BITESHIP_API_KEY yang dipasang masih API key Testing (biteship_test.*). Ganti dengan API key Production/Live sebelum membuat pengiriman nyata.');
  }
  if (env === 'testing' && !isTestKey(apiKey)) {
    throw new Error('BITESHIP_ENV=testing tetapi API key bukan sandbox/testing. Gunakan key yang diawali biteship_test.');
  }

  return { apiKey, env };
}

function authorization(apiKey) {
  const value = String(apiKey || '').trim();
  return /^Bearer\s+/i.test(value) ? value : `Bearer ${value}`;
}

function requireAdminEmail(decoded) {
  const allow = String(process.env.BITESHIP_ADMIN_EMAILS || '')
    .split(',')
    .map(x => x.trim().toLowerCase())
    .filter(Boolean);

  if (!allow.length) {
    throw new Error('BITESHIP_ADMIN_EMAILS wajib diisi di Netlify untuk mengizinkan operasi pengiriman pada Production.');
  }

  const email = String(decoded?.email || '').trim().toLowerCase();
  if (!email || !allow.includes(email)) {
    throw new Error('Akun ini tidak memiliki izin melakukan operasi pengiriman Biteship.');
  }

  return decoded;
}

module.exports = {
  getApiKey,
  getEnvironment,
  isTestKey,
  assertProductionConfig,
  authorization,
  requireAdminEmail
};
