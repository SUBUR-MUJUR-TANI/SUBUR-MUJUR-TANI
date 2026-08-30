# SUBUR MUJUR TANI — Production Deployment

Project ini sudah disiapkan untuk Biteship Production. API testing dan production memakai endpoint Biteship yang sama; environment ditentukan oleh API key. API key sandbox diawali `biteship_test.` dan tidak boleh dipakai ketika `BITESHIP_ENV=production`.

## 1. Netlify Environment Variables

Wajib:

- `BITESHIP_ENV=production`
- `BITESHIP_API_KEY=<API KEY PRODUCTION/LIVE Biteship>`
- `BITESHIP_ADMIN_EMAILS=<email admin Firebase yang diizinkan, pisahkan dengan koma>`
- `BITESHIP_ORIGIN_POSTAL_CODE=<kode pos toko 5 digit>`
- `BITESHIP_ORIGIN_CONTACT_NAME=<nama kontak toko>`
- `BITESHIP_ORIGIN_CONTACT_PHONE=<nomor HP toko>`
- `BITESHIP_ORIGIN_ADDRESS=<alamat lengkap toko>`
- `BITESHIP_ORIGIN_ORGANIZATION=<nama usaha/toko>`
- `FIREBASE_SERVICE_ACCOUNT_JSON=<service account JSON>`

Jika menggunakan Instant/Kendaraan:

- `BITESHIP_ORIGIN_LATITUDE=<latitude toko>`
- `BITESHIP_ORIGIN_LONGITUDE=<longitude toko>`

Opsional tetapi disarankan:

- `BITESHIP_ORIGIN_CONTACT_EMAIL=<email toko>`
- `FIREBASE_DATABASE_URL=<URL Realtime Database>`
- `BITESHIP_WEBHOOK_SIGNATURE_KEY=<nama header signature dari Biteship>`
- `BITESHIP_WEBHOOK_SIGNATURE_SECRET=<nilai secret signature dari Biteship>`

## 2. Verifikasi konfigurasi

Setelah deploy, buka:

`/api/biteship-health`

Response HTTP 200 dengan `success: true` berarti konfigurasi Production dasar sudah lengkap. Endpoint ini tidak pernah mengembalikan API key.

## 3. Webhook Production

Gunakan:

`https://DOMAIN-NETLIFY-ANDA/api/biteship-webhook`

Pasang webhook Production di dashboard Biteship, bukan webhook Testing. Event yang digunakan:

- `order.status`
- `order.waybill_id`
- `order.price`

## 4. Sebelum membuat order nyata

1. Pastikan API key Biteship sudah berstatus Production/Live.
2. Jangan gunakan key `biteship_test.*`.
3. Pastikan alamat dan kode pos asal benar.
4. Pastikan `BITESHIP_ADMIN_EMAILS` berisi email admin yang benar.
5. Pastikan webhook menunjuk ke domain Netlify Production.
6. Buat satu pesanan kecil sebagai smoke test nyata setelah saldo/akun Biteship siap.

## 5. Perubahan keamanan yang sudah diterapkan

- Semua request Biteship memakai format header `Authorization: Bearer <API_KEY>`.
- Production otomatis menolak API key sandbox `biteship_test.*`.
- Operasi admin membuat, menghitung tarif khusus Admin, sinkronisasi, tracking Admin, dan pembatalan pengiriman memakai allow-list `BITESHIP_ADMIN_EMAILS`.
- API key tetap hanya berada di Netlify Environment Variables; tidak ditanam di HTML/JavaScript browser.
- Endpoint health hanya melaporkan status konfigurasi tanpa membocorkan secret.
