import { get, set, del } from 'idb-keyval';

const KEY = 'rekap-bukti:draft:v1';

export const loadDraft = () => get(KEY);
export const saveDraft = (d) => set(KEY, { ...d, savedAt: Date.now() });
export const clearDraft = () => del(KEY);

// Perkecil foto (maks 1100px, JPEG) supaya ringan di draft & file Excel, tapi teks tetap terbaca untuk OCR
export function resizeImage(file, max = 1100, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * s);
      const h = Math.round(img.height * s);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve({ img: c.toDataURL('image/jpeg', quality), w, h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gagal membaca gambar'));
    };
    img.src = url;
  });
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
