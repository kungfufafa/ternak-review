# Ternak Review — TAP. SCAN. REVIEW.

Kit fisik **10×10 cm**: cetak QR + chip NTAG215, satu URL dinamis (`/r/ID`). Tamu tap atau scan — langsung ke halaman **Tulis Review** Google Maps tempat yang dipilih saat aktivasi.

Hanya **satu login: admin**. Sales/rekanan mengaktifkan kit tanpa akun. End user tidak pakai sistem — mereka cuma isi Google Review.

## Peran

| Siapa | Login? | Yang mereka lakukan |
|------|--------|---------------------|
| **Admin** | Ya (email + password) | Generate stok, lihat semua unit, tempat, scan, dan tag partner opsional |
| **Sales / rekanan** | Tidak | Scan kartu, pilih listing Google Maps. Boleh isi nama untuk tracking, boleh dikosongkan |
| **End user** | Tidak | Tap NFC atau scan QR yang sudah aktif → Google Review |

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

Lokal memakai SQLite (`DATABASE_URL=file:./data/dev.db`) — tidak perlu Postgres. Sesuaikan `AUTH_SECRET`.

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

Push dan pull request ke `main` menjalankan GitHub Actions: **typecheck**, **smoke** (SQLite stub, tanpa Google API), **build Node**, **build Cloudflare**. Job `CI` hijau hanya jika semua lolos.

Lokal, **sebelum commit/push**:

```bash
npm run ci
```

Hook git (`.githooks`) ikut: `pre-commit` menjalankan typecheck, `pre-push` menjalankan `npm run ci`. Aktif setelah `npm install`. Lewati sekali dengan `git commit --no-verify` / `git push --no-verify`. Smoke Places live: `SMOKE_LIVE_PLACES=1 npm run smoke`.

## Alur uji cepat

1. Buka `/login` — buat admin pertama (hanya sekali), lalu masuk dashboard.
2. Buka `/admin/stock` — generate kartu. Cetak wajah 10×10 (QR = `/r/ID`). Tulis URL yang sama ke NTAG215 di `/admin/stock/nfc` dengan HP.
3. Buka `/activate` (atau `/r/{publicId}`) — **pilih listing Google Maps** (lokasi terdekat atau ketik untuk mencari di Maps — nama tidak diketik manual). Nama sales **opsional**. Prefill tag: `/activate?id=UNIT&ref=andi`.
4. Tap atau scan ulang `/r/{publicId}` → redirect ke Google writereview (atau stub place ID di lokal).
5. Di dashboard admin, unit + tag partner (jika diisi) dan jumlah scan tersimpan.

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
npx wrangler secret put APP_URL
npx wrangler secret put GOOGLE_MAPS_API_KEY   # opsional
npm run deploy:cf

# VPS / Docker (SQLite di volume)
# Isi .env (APP_URL HTTPS, AUTH_SECRET, DATABASE_URL=file:./data/prod.db)
docker compose up -d --build
# atau tanpa Docker:
npm run build:node && node .output/server/index.mjs
```

Cek setelah nyala: `GET /health` — field `target` adalah `cloudflare` atau `node`.

### Ganti host (jaga-jaga)

1. Backup dulu: `npm run db:backup` (VPS) atau `npm run db:backup:d1` (Cloudflare).
2. Restore ke target yang akan hidup (D1 ← SQL, atau copy file SQLite ke volume VPS).
3. Deploy target itu.
4. Arahkan DNS domain yang sama (TTL pendek). `APP_URL` **tidak** berubah — kartu NFC/QR tetap valid.
5. Matikan writer lama. Jangan dua writer.

### Catatan produksi

- Schema tetap SQLite (`sqlite-core`). Jangan port ke Postgres untuk jalur ini.
- Set `AUTH_SECRET` (acak, minimal 32 karakter) dan `IP_HASH_SALT` kuat. Jangan pakai nilai contoh.
- Wajibkan HTTPS; cookie session memakai flag `Secure` jika `APP_URL` HTTPS atau `NODE_ENV=production`.
- Isi `GOOGLE_MAPS_API_KEY`, enable **Places API (New)**. Di Cloudflare, batasi key ke Places API (New) + kuota — IP Worker tidak tetap.
- Aktivasi hanya menyimpan `place_id` resmi Google. QR dan NTAG215 mengarah ke `/r/{id}`, lalu ke `writereview?placeid=…` listing itu.
- Set `APP_URL` HTTPS final **sebelum** cetak dan tulis chip. URL di kertas/chip tidak ikut pindah domain; yang dinamis hanya tujuan Google.
- Hosting redirect (`/r/*`) harus uptime tinggi — ini jalur kritis produk.
- Password admin baru memakai PBKDF2 (iterasi lebih rendah di Cloudflare agar muat CPU free). Hash `scrypt:` lama tetap diverifikasi di VPS.
