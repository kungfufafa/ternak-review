# Ternak Review — TAP. SCAN. REVIEW.

Kit fisik **10×10 cm**: cetak QR + chip NTAG215, satu URL dinamis (`/r/ID`). Default-nya tamu tap atau scan lalu langsung ke halaman **Tulis Review** Google Maps tempat yang dipilih saat aktivasi.

Admin dapat mengganti nama paket dan batas bintang intersep di **Pengaturan paket** (`/admin/packages`). Paket default (nama awal Basic) tetap langsung membuka Google Review Maps. Paket dengan akses WhatsApp owner (nama awal Plus) dan feedback anonim melalui gateway WhatsApp platform (nama awal Pro) memakai batas intersep masing-masing, dari bintang 1 sampai 5. Batas awalnya bintang 3 ke bawah; misalnya diubah menjadi 2, bintang 1–2 masuk jalur feedback kartu dan bintang 3–5 menuju Google Review. Pengaturan berlaku langsung untuk semua kartu dalam paket, termasuk kartu aktif. Jalur Google langsung tetap tersedia pada semua paket. Google Review tidak pernah dianggap berhasil hanya karena kartu dipindai.

Login admin tetap email + password. Pemegang kartu masuk lewat **OTP WhatsApp** kalau gateway Baileys admin berstatus OPEN; kalau gateway mati, opsi OTP disembunyikan dan cadangan email/password tetap ada. Kartu harus di-assign ke user dulu. Aktivasi publik: scan kartu + PIN pemegang. Kalau pemegang sudah login, tempel/scan kartu dari `/app` atau di toko — PIN dilewati, langsung pilih listing Google. Tidak perlu pilih kartu dari daftar kode. Tamu yang tap kartu aktif tetap ke Google Review / intersep — PIN hanya untuk aktivasi.

## Peran

| Siapa | Login? | Yang mereka lakukan |
|------|--------|---------------------|
| **Admin** | Ya (email + password) | Produksi, paket, user management, assign kartu, tag partner |
| **Pemegang kartu** | Ya (OTP WhatsApp jika gateway OPEN, atau email) | Dashboard `/app`: tempel/scan kartu di toko (tanpa PIN), kelola toko yang sudah terpasang |
| **Aktivasi publik** | PIN 4 digit pemegang | Scan `/r/ID` + PIN akun yang memegang kartu, lalu pilih listing Google Maps |
| **Tamu toko** | Tidak | Tap NFC atau scan QR kartu aktif → Google Review atau jalur feedback |

Afiliasi **tidak wajib**. Field partner di aktivasi opsional. Data aktivasi (tempat, waktu, scan, tag jika ada) tetap tersimpan di database kita.

## Stack

- TanStack Start (React)
- SQLite + Drizzle ORM — file lokal/VPS, Cloudflare D1 di Workers
- Cookie session (admin only)
- Google Places API (opsional di lokal — fallback stub)

## Setup lokal

1. Salin env:

```bash
cp .env.example .env.local
```

Lokal memakai SQLite (`DATABASE_URL=file:./data/dev.db`) — tidak perlu Postgres. Sesuaikan `AUTH_SECRET`, `IP_HASH_SALT`, dan `ADMIN_SETUP_TOKEN`.

Untuk aktivasi pakai listing Google Maps asli, isi `GOOGLE_MAPS_API_KEY` dan aktifkan **Places API (New)** (Autocomplete, Nearby Search, Place Details) di Google Cloud. Tanpa key, UI tetap jalan dengan daftar stub lokal.

2. Install:

```bash
npm install
```

Schema SQLite di-apply otomatis saat server/script pertama kali query DB (file `data/dev.db`). Opsional: `npm run db:push` / `npm run db:studio`.

3. Jalankan:

```bash
npm run dev
```

Buka http://localhost:3000

## CI

Push dan pull request ke `main` menjalankan GitHub Actions: **typecheck**, **smoke** (SQLite stub, tanpa Google API), **security regression**, **D1 migration replay**, **build Node**, **runtime security check**, dan **build Cloudflare**. Job `CI` hijau hanya jika semua lolos.

Lokal, **sebelum commit/push**:

```bash
npm run ci
# Opsional, verifikasi artefak server dan header HTTP seperti di CI:
npm run build:node && npm run security:runtime
```

Hook git (`.githooks`) ikut: `pre-commit` menjalankan typecheck, `pre-push` menjalankan `npm run ci`. Aktif setelah `npm install`. Lewati sekali dengan `git commit --no-verify` / `git push --no-verify`. Smoke Places live: `SMOKE_LIVE_PLACES=1 npm run smoke`.

## Alur uji cepat

1. Buka `/login` — buat admin pertama memakai `ADMIN_SETUP_TOKEN` dari environment (hanya sekali), lalu masuk dashboard.
2. Buka `/admin/stock` — generate kartu. Cetak wajah 10×10 (QR = `/r/ID`). Tulis URL yang sama ke NTAG215 di `/admin/stock/nfc` dengan HP.
3. Buat pemegang di `/admin/users`, catat PIN, assign kartu. Pasang di toko: tempel/scan kartu. Belum login → PIN lalu pilih Maps. Sudah login di `/app` → langsung pilih Maps, tanpa pilih kartu dari daftar. Tag sales opsional: `/activate?id=UNIT&ref=andi`.
4. Tap atau scan ulang `/r/{publicId}` → Google writereview atau jalur feedback sesuai paket (atau stub place ID di lokal).
5. Di dashboard admin, unit + tag partner (jika diisi) dan jumlah scan tersimpan.

### Tes WhatsApp tanpa nomor

Gateway Baileys butuh HP + scan QR. Untuk uji OTP, feedback, dan Log kiriman di
lokal, jalankan stub yang memakai jalur poll/report yang sama, tanpa mengirim ke
WhatsApp:

```bash
npm run dev
npm run gateway:stub
```

`/admin/whatsapp` jadi **OPEN (mode uji)**. Kode OTP tercetak di terminal stub.
Jejak ada di `/admin/logs`. Jangan jalankan stub bersamaan dengan gateway
Baileys. Stub menolak `APP_URL` non-localhost dan `NODE_ENV=production`.

## Route penting

| Path | Fungsi |
|------|--------|
| `/r/$publicId` | IN_STOCK → aktivasi, ACTIVE → Google Review, INACTIVE → status |
| `/activate` | Aktivasi publik (tanpa login) |
| `/login` | Login admin (bootstrap admin pertama jika belum ada) |
| `/dashboard` | Ringkasan, unit, tag partner |
| `/admin/stock` | Produksi: generate batch, cetak kartu 10×10, tempel NFC |
| `/admin/stock/print` | Wajah kartu 100×100 mm atau A4 isi 4 |
| `/admin/stock/nfc` | Tulis `/r/ID` ke NTAG215 |
| `/admin/packages` | Nama paket dan batas bintang intersep |
| `/admin/users` | Buat pemegang kartu, PIN, assign kartu |
| `/app` | Dashboard pemegang kartu |
| `/admin/whatsapp` | Pairing gateway, atau mode uji `npm run gateway:stub` |
| `/admin/smtp` | Email keluar: Resend (API key) atau SMTP klasik |
| `/admin/logs` | Log kiriman email dan WhatsApp (observabilitas) |
| `/health` | Health check JSON |

## Deploy (Cloudflare atau VPS)

Satu repo, satu domain, **satu yang nulis**. Pilih target saat build. Jangan Cloudflare dan VPS sama-sama nulis ke database berbeda.

```bash
# Cloudflare Workers + D1
npx wrangler login
npx wrangler d1 create ternak-review   # tempel database_id ke wrangler.jsonc
cp .dev.vars.example .dev.vars         # isi secret
npm run d1:migrate:remote
npx wrangler secret put AUTH_SECRET
npx wrangler secret put IP_HASH_SALT
npx wrangler secret put ADMIN_SETUP_TOKEN
npx wrangler secret put APP_URL
npx wrangler secret put GOOGLE_MAPS_API_KEY
npx wrangler secret put WHATSAPP_GATEWAY_TOKEN  # jika Pro/gateway diaktifkan
npm run deploy:cf

# VPS / Docker (SQLite di volume)
# Isi .env (APP_URL HTTPS, tiga secret berbeda minimal 32 karakter,
# GOOGLE_MAPS_API_KEY, DATABASE_URL=file:./data/prod.db)
docker compose up -d --build
# atau tanpa Docker:
npm run build:node && node .output/server/index.mjs
```

Untuk paket Pro, isi `WHATSAPP_GATEWAY_TOKEN` dengan secret acak yang sama di
`.env`, lalu jalankan service `whatsapp-gateway` melalui Compose dengan profile
`whatsapp`:

```bash
docker compose --profile whatsapp up -d --build
```

Volume
`whatsapp-gateway-data` menyimpan sesi pairing Baileys; jangan menjalankan dua
gateway dengan nomor yang sama. Pairing dan statusnya tersedia di
`/admin/whatsapp`.

Email keluar diatur di `/admin/smtp`, bukan di `.env`. **Resend** (API key +
domain pengirim yang sudah verified) memakai HTTP, jadi jalan di Cloudflare
Workers. SMTP klasik (Gmail, Mailgun, dsb.) hanya untuk VPS/Node — Cloudflare
tidak bisa membuka socket SMTP.

> D1 lama yang pernah diisi memakai `scripts/d1-migrate.ts` versi sebelumnya tidak mempunyai ledger `d1_migrations`. Jangan langsung menjalankan `d1:migrate:remote` pada database itu. Export backup lalu lakukan baseline satu kali: cocokkan schema aktual, catat hanya file migrasi yang memang sudah terpasang, atau pindahkan **data saja** ke D1 baru yang lebih dulu diinisialisasi dengan migrasi resmi. Database D1 baru dapat memakai perintah di atas langsung.

Cek setelah nyala: `GET /health` — field `target` adalah `cloudflare` atau `node`.

### Ganti host (jaga-jaga)

1. Backup dulu: `npm run db:backup` (VPS) atau `npm run db:backup:d1` (Cloudflare).
2. Restore ke target yang akan hidup (D1 ← SQL, atau copy file SQLite ke volume VPS).
3. Deploy target itu.
4. Arahkan DNS domain yang sama (TTL pendek). `APP_URL` **tidak** berubah — kartu NFC/QR tetap valid.
5. Matikan writer lama. Jangan dua writer.

### Catatan produksi

- Schema tetap SQLite (`sqlite-core`). Jangan port ke Postgres untuk jalur ini.
- Set `AUTH_SECRET`, `IP_HASH_SALT`, dan `ADMIN_SETUP_TOKEN` ke tiga nilai acak berbeda, masing-masing minimal 32 karakter. Jangan pakai nilai contoh.
- Wajibkan HTTPS; cookie session memakai flag `Secure` jika `APP_URL` HTTPS atau `NODE_ENV=production`.
- Email: di Cloudflare pilih Resend di `/admin/smtp`. SMTP socket hanya VPS/Node.
- Isi `GOOGLE_MAPS_API_KEY`, enable **Places API (New)**. Production gagal health check bila key kosong dan menolak seluruh place ID development. Di Cloudflare, batasi key ke Places API (New) + kuota — IP Worker tidak tetap.
- Aktivasi hanya menyimpan `place_id` resmi Google. QR dan NTAG215 mengarah ke `/r/{id}`, lalu ke `writereview?placeid=…` listing itu.
- Set `APP_URL` HTTPS final **sebelum** cetak dan tulis chip. URL di kertas/chip tidak ikut pindah domain; yang dinamis hanya tujuan Google.
- Hosting redirect (`/r/*`) harus uptime tinggi — ini jalur kritis produk.
- Password admin baru minimal 6 karakter. Di Cloudflare PBKDF2 100.000 iterasi; di VPS/Node 600.000. Hash lama di-upgrade saat login berhasil; hash `scrypt:` lama tetap diverifikasi di VPS.
- Session admin berlaku absolut 12 jam. Login atau ganti password mencabut semua session lama.
- VPS yang berada di balik reverse proxy tepercaya boleh memakai `TRUST_PROXY=true` hanya bila proxy menimpa `X-Real-IP`/`X-Forwarded-For`. Jangan aktifkan pada port Node yang terekspos langsung.
- Click berulang dari kartu/client yang sama dideduplikasi per lima menit untuk menahan write-flood dan noise analytics.
- `npm run db:backup` memakai SQLite online backup API dan menjalankan integrity check; aman dipakai saat aplikasi hidup. Tetap lakukan restore drill berkala.
