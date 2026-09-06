# Ternak Review WhatsApp Gateway

Gateway ini berjalan sebagai proses Node 22 terpisah dari aplikasi TanStack/Cloudflare. Gateway hanya membuat koneksi keluar ke aplikasi, menyimpan sesi Baileys dan antrean pesan dalam SQLite persisten, lalu mengambil pekerjaan melalui polling.

Untuk uji lokal **tanpa nomor WhatsApp**, dari root repo: `npm run gateway:stub`.
Stub memakai endpoint poll/report yang sama; pesan tidak dikirim ke HP.

Jalankan gateway sungguhan dari folder ini setelah memasang dependency:

```bash
npm install
APP_URL=https://review.example.com \
WHATSAPP_GATEWAY_TOKEN="$WHATSAPP_GATEWAY_TOKEN" \
WHATSAPP_GATEWAY_DB=/var/lib/ternak-review/whatsapp.db \
npm start
```

Simpan volume database gateway. Jangan menjalankan dua worker dengan nomor yang sama. Pairing dilakukan dari `/admin/whatsapp` pada aplikasi. QR tidak ditulis ke log dan kedaluwarsa dari status aplikasi setelah satu menit.

`SUBMITTED` berarti Baileys menerima permintaan relay. Status `DELIVERED` hanya dilaporkan ketika event receipt tersedia. Kegagalan setelah pemanggilan WhatsApp diberi status `UNCERTAIN` dan perlu retry manual dari detail kartu untuk menghindari pengiriman ganda.
