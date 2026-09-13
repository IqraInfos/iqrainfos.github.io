# Nurul Ilmi Digital

Perpustakaan digital berbasis GitHub Pages yang mengambil koleksi PDF dari Google Drive dan menampilkannya dengan pembaca flipbook.

## Fitur

- Daftar buku dari folder Google Drive.
- Pencarian dan filter alfabet.
- Infinite scroll untuk memuat buku bertahap.
- Statistik pengunjung dan jumlah pembacaan melalui Google Sheets.
- Pembaca PDF dengan efek membalik halaman.
- Navigasi halaman, zoom, dan dukungan keyboard.
- Lazy render halaman PDF.
- Cache PDF di browser.
- Proxy streaming Cloudflare Worker dengan dukungan HTTP Range Request.
- Fallback ke Google Apps Script jika proxy sedang gagal.
- Layout responsif untuk desktop, tablet, dan mobile.

## Struktur Project

```text
.
├── Code.gs
├── cloudflare-worker.js
├── index.html
├── CNAME
└── assets/
    ├── css/
    │   └── style.css
    ├── img/
    └── js/
        └── app.js
```

## Arsitektur

```text
Browser
  |
  | Daftar buku, statistik, dan log pembacaan
  v
Google Apps Script ----> Google Drive + Google Sheets
  ^
  |
  | Fallback PDF Base64
  |
  +-- PDF.js <---- Cloudflare Worker <---- Google Drive
                    PDF streaming + Range Request
```

PDF asli tetap disimpan di Google Drive. Cloudflare Worker hanya meneruskan data PDF ke browser dan tidak menjadi tempat penyimpanan utama.

## Persiapan Google Drive

1. Buat folder khusus untuk koleksi PDF.
2. Salin ID folder dari URL Google Drive.
3. Pastikan file PDF dapat diakses oleh pembaca website:
   - `Anyone with the link`
   - Role: `Viewer`
4. Gunakan file PDF yang valid dan tidak rusak.

## Setup Google Apps Script

1. Buka [Google Apps Script](https://script.google.com/).
2. Buat project baru atau buka project yang digunakan oleh website.
3. Salin isi `Code.gs` ke editor Apps Script.
4. Sesuaikan nilai berikut:

```javascript
const SPREADSHEET_ID = "ID_GOOGLE_SHEETS";
const folderId = "ID_FOLDER_GOOGLE_DRIVE";
```

5. Jalankan fungsi `mintaIzinSheets()` satu kali untuk memberikan izin Spreadsheet.
6. Deploy sebagai Web App:
   - **Deploy** > **New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Salin URL deployment ke konstanta `API_URL` di `assets/js/app.js`.
8. Setiap kali `Code.gs` berubah, deploy **New version**.

Endpoint yang tersedia:

```text
?action=files
?action=visitor
?action=counts
?action=log&fileId=...&fileName=...
?action=pdf&fileId=...
```

## Setup Cloudflare Worker

Worker digunakan agar PDF dapat dikirim dengan streaming dan `Range Request`, tanpa mengubah PDF menjadi Base64 pada jalur utama.

1. Buka dashboard Cloudflare.
2. Masuk ke **Workers & Pages**.
3. Pilih **Create application** > **Start with Hello World!**.
4. Beri nama Worker.
5. Pilih **Edit code**.
6. Hapus kode bawaan.
7. Salin isi `cloudflare-worker.js`.
8. Klik **Save and deploy**.
9. Uji URL berikut:

```text
https://NAMA-WORKER.workers.dev/?fileId=ID_FILE_PDF
```

Worker yang digunakan saat ini:

```text
https://nurul-ilmi-pdf-proxy.mail-iqrapetobo.workers.dev
```

Pengujian Range Request yang berhasil akan menghasilkan header seperti:

```text
HTTP/1.1 206 Partial Content
Content-Type: application/pdf
Content-Range: bytes 0-1023/...
Accept-Ranges: bytes
Access-Control-Allow-Origin: *
```

## Konfigurasi Frontend

Di `assets/js/app.js`, pastikan URL API dan Worker benar:

```javascript
const API_URL = 'URL_WEB_APP_APPS_SCRIPT';
const PDF_PROXY_URL = 'https://nurul-ilmi-pdf-proxy.mail-iqrapetobo.workers.dev';
```

PDF.js menggunakan chunk Range sebesar 1 MB untuk mengurangi jumlah request:

```javascript
rangeChunkSize: 1048576
```

Jika Worker belum tersedia, kosongkan `PDF_PROXY_URL` agar frontend memakai fallback Apps Script:

```javascript
const PDF_PROXY_URL = '';
```

## Menjalankan Secara Lokal

Dari folder project, jalankan server statis:

```powershell
python -m http.server 4173
```

Buka:

```text
http://localhost:4173/index.html
```

Jangan membuka `index.html` langsung dengan `file://` karena request API dan cache browser dapat berperilaku berbeda.

## Deployment GitHub Pages

1. Commit perubahan ke repository.
2. Push ke branch yang digunakan GitHub Pages.
3. Pastikan file `index.html`, `assets/`, dan `cloudflare-worker.js` sudah ikut ter-push.
4. Buka website melalui domain GitHub Pages atau domain pada file `CNAME`.
5. Lakukan hard refresh setelah deployment:
   - Windows: `Ctrl + F5`
   - Mobile: buka ulang halaman atau gunakan tab incognito.

## Performa Pembaca PDF

Pembaca menggunakan beberapa lapisan optimasi:

- Worker streaming agar browser dapat mengambil bagian PDF melalui Range Request.
- Halaman pertama dirender lebih dahulu agar viewer cepat tampil.
- Hanya halaman aktif dan halaman terdekat yang dirender.
- Canvas dirender pada density sekitar 2.5x sampai 3x agar teks lebih tajam.
- PDF disimpan di Cache Storage browser setelah berhasil diambil.
- Render task dan loading task dibatalkan saat viewer ditutup atau buku diganti.
- Container PageFlip dibuat ulang setelah `destroy()` agar pergantian buku aman.

Kualitas akhir tetap bergantung pada kualitas PDF asli. Jika sumber PDF merupakan scan buram, rendering beresolusi tinggi tidak dapat menciptakan detail yang tidak ada pada file sumber.

## Troubleshooting

### Pesan: Buku tidak dapat ditampilkan

Periksa hal berikut:

1. File memiliki ekstensi dan MIME type `application/pdf`.
2. File Google Drive dapat diakses publik.
3. URL Worker dapat dibuka dengan parameter `fileId`.
4. Worker memberikan `206 Partial Content` untuk request Range.
5. URL Worker di `assets/js/app.js` benar.
6. Browser sudah melakukan hard refresh setelah deployment.

Frontend akan mencoba fallback Apps Script jika Worker gagal.

### Buku pertama bisa dibuka, buku berikutnya gagal

Pastikan menggunakan versi terbaru `assets/js/app.js`. Versi terbaru membatalkan request dan render task lama serta membuat ulang container PageFlip setelah viewer ditutup.

### Tampilan mobile seperti desktop

Pastikan `index.html` memiliki meta viewport:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

### PDF lambat dibuka

- Periksa ukuran PDF.
- Pastikan Cloudflare Worker aktif.
- Pastikan Worker mendukung Range Request.
- Hapus cache browser hanya jika sedang menguji perubahan baru.
- Gunakan PDF yang sudah dikompres jika ukuran file sangat besar.

## Benchmark Terakhir

Pengujian lokal dengan PDF 74 halaman menunjukkan:

- Cold start: sekitar 0.9 detik pada kondisi cache Worker/browser yang tersedia.
- Warm start: sekitar 0.2 detik.
- Halaman awal dirender secara lazy.
- Stress test 16 kali buka-tutup cepat pada beberapa judul berhasil tanpa error race condition.

Hasil aktual dapat berbeda tergantung ukuran PDF, koneksi, cache Cloudflare, perangkat, dan kualitas jaringan pengguna.

## Lisensi dan Konten

Pastikan semua PDF, gambar sampul, dan materi yang disimpan di Google Drive memiliki izin penggunaan dan distribusi yang sesuai.
