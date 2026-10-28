export const runtime = 'nodejs';
export const maxDuration = 30;

const PROMPT = (today) => `Ini screenshot/foto bukti pembayaran di Indonesia (m-banking, e-wallet, atau struk EDC).
Baca dua hal saja, lalu balas HANYA dengan JSON valid (tanpa teks lain, tanpa markdown):

{"tanggal":"YYYY-MM-DD" atau null,"metode":"QRIS" atau "TRF" atau null,"confidence":"tinggi"|"sedang"|"rendah","catatan":"maks 12 kata"}

Aturan tanggal:
- Ambil TANGGAL TRANSAKSI (bukan tanggal cetak/tanggal jatuh tempo). Bulan bisa Indonesia atau Inggris (Okt/Oct, Agu/Ags/Aug, Des/Dec, dst).
- Tahun 2 digit -> tambahkan 2000. Jika tahun tidak tertulis, pakai tahun terdekat yang tidak melewati hari ini (${today}).
- Tidak terbaca / ragu -> null.

Aturan metode:
- "QRIS": bayar dengan scan QRIS. Petunjuk: tulisan QRIS / QR Payment / Bayar QR, NMID, nama merchant, MPAN, logo QRIS/GPN.
- "TRF": transfer antar rekening / BI-FAST / SKN / RTGS / transfer online. Petunjuk: rekening tujuan, nama penerima, bank tujuan, no. referensi, "Transfer Berhasil".
- Tidak yakin -> null (jangan menebak).`;

function pickJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json({ error: 'ANTHROPIC_API_KEY belum diset di Vercel' }, { status: 501 });
  }
  let image;
  try {
    ({ image } = await req.json());
  } catch {
    return Response.json({ error: 'Body tidak valid' }, { status: 400 });
  }
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(image || '');
  if (!m) return Response.json({ error: 'Format gambar tidak didukung' }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
            { type: 'text', text: PROMPT(today) },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    return Response.json({ error: `API ${res.status}`, detail: t.slice(0, 300) }, { status: 502 });
  }
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || '').join('');
  const j = pickJson(text) || {};

  const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(j.tanggal || '') ? j.tanggal : null;
  const metode = j.metode === 'QRIS' || j.metode === 'TRF' ? j.metode : null;
  return Response.json({ tanggal, metode, confidence: j.confidence || 'rendah', catatan: j.catatan || '' });
}
