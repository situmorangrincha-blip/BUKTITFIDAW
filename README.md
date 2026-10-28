# Rekap Bukti Transfer

Upload foto bukti transfer/QRIS → isi form per foto → download Excel dengan layout sama persis template
(`Template_Rekap_bukti_transfer.xlsx`: kartu 4 kolom per baris, 4 blok per halaman A4).

## Fitur
- Upload banyak foto, bisa tambah foto kapan saja (draft auto-tersimpan di browser via IndexedDB).
- Tanggal transaksi & metode (QRIS / TRF) dibaca otomatis dari foto (label **AI**, tetap bisa diedit).
- Download `.xlsx` (Times New Roman 11, border, ukuran kolom & posisi foto sesuai template).

## Deploy
1. Push repo ini ke GitHub, import di Vercel (framework Next.js terdeteksi otomatis).
2. Di Vercel: Settings → Environment Variables → tambah `ANTHROPIC_API_KEY` → Redeploy.
   Tanpa key, web tetap jalan tapi tanggal/metode diisi manual.

## Jalan lokal
```bash
npm install
cp .env.example .env.local   # isi ANTHROPIC_API_KEY
npm run dev
```

## Catatan
- Draft tersimpan di browser/perangkat yang sama (bukan server). Ganti HP/browser = draft tidak ikut.
- Foto diperkecil (maks 1100px) supaya file Excel tidak membengkak.
