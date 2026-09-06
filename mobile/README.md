# Ternak Review

App Expo untuk **nulis dan menimpa** URL kartu ke stiker NTAG215, termasuk di iPhone.

Browser iOS tidak punya Web NFC. App ini development build (bukan Expo Go) yang memakai `react-native-nfc-manager`.

## Syarat

- Akun **admin** Ternak Review
- HP asli dengan NFC (simulator tidak bisa)
- **Apple Developer Program** untuk iOS, capability **Near Field Communication Tag Reading**
- Development build: `expo-dev-client`

## Jalanin

Di Mac, ganti API ke mesin lokal (HP dan laptop satu Wi-Fi):

```bash
cd mobile
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000 npx expo prebuild
npx expo run:ios --device
# atau
npx expo run:android --device
```

Produksi memakai `extra.apiUrl` di `app.json` (`https://ternakreview.com`) kecuali `EXPO_PUBLIC_API_URL` di-set.

Expo Go **tidak** bisa NFC. Setelah prebuild, buka project native di Xcode/Android Studio hanya jika perlu entitlement.

## Alur di HP

Sama dengan produksi + Tempel NFC di web:

1. Masuk admin
2. **Ke produksi** — bikin QR, lihat cetakan, hapus cetakan gudang, lanjut NFC
3. **Tempel NFC** — kamera di halaman utama (**Nyalakan kamera**). Scan mengidentifikasi kartu
4. Kotak kode + **Pakai** langsung nulis ke stiker kalau NFC nyala
5. Kartu terkunci: **Tempel HP**, pulse saat menulis, **Bukan kartu ini**
6. Setelah nulis: getar, flash kode, kamera nyala lagi, hitungan sesi / progress cetakan
7. Cetakan selesai: tentukan pemegang (buka dashboard di browser). Cetak kartu juga di web
8. **Baca stiker yang sudah ada** untuk edit/tulis ulang NTAG215

Scan kamera yang sama tidak diulang (guard `lastRaw` + publicId). Chrome Android web tetap bisa nulis dari browser.

## iOS

1. Di [developer.apple.com](https://developer.apple.com) aktifkan NFC Tag Reading untuk App ID `com.ternakreview.nfc`
2. Plugin `react-native-nfc-manager` memakai entitlement `TAG` (`includeNdefEntitlement: false`) supaya validasi App Store tidak menolak `NDEF`
3. Build ke device: `npx expo run:ios --device`

## Android

NFC native (`react-native-nfc-manager`), bukan Web NFC. Kalau NFC mati, app buka pengaturan sistem. Permission kamera + NFC sudah di `app.json`.

```bash
cd mobile
npx expo run:android --device
```
