// Generator Excel yang meniru Template_Rekap_bukti_transfer.xlsx
// Layout: baris 2 judul kosong, lalu blok 17 baris x 4 kartu ke samping (B:C, D:E, F:G, H:I)
const MONTHS = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];

export function formatTanggal(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const COL_W = [8.7109375, 17, 21.85546875, 17.140625, 27.85546875, 16.42578125, 26.140625, 15.5703125, 26.140625];
const FONT = { name: 'Times New Roman', size: 11 };
const M = { style: 'medium' };
const BLOCK_H = 17; // 4 baris header + 13 baris foto
const MIN_BLOCKS = 4; // template punya 4 blok (1 halaman A4)
const FIRST_ROW = 3;
const PX = (w) => Math.round(w * 7);
const EMU = 9525;

export function sheetNameFromDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}${p(d.getMonth() + 1)}${d.getFullYear()}`;
}

/**
 * @param ExcelJS   modul exceljs
 * @param entries   [{toko, salesman, bank, tanggal(YYYY-MM-DD), img(dataURL/base64 jpeg), w, h}]
 * @param sheetName nama sheet (default DDMMYYYY hari ini)
 * @returns ArrayBuffer/Buffer xlsx
 */
export async function buildWorkbook(ExcelJS, entries, sheetName) {
  const wb = new ExcelJS.Workbook();
  const name = (sheetName || sheetNameFromDate()).replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Sheet1';
  const ws = wb.addWorksheet(name, {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0, right: 0, top: 0, bottom: 0, header: 0, footer: 0 },
    },
  });
  ws.properties.defaultRowHeight = 15;
  COL_W.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
    ws.getColumn(i + 1).font = FONT;
  });

  const blocks = Math.max(MIN_BLOCKS, Math.ceil(entries.length / 4));
  ws.getRow(2).height = 15.75;
  ws.getCell('B2').font = { ...FONT, bold: true };

  const labels = ['Nama Toko', 'Nama Salesman', 'Nama Bank', 'Tanggal Transaksi'];

  for (let b = 0; b < blocks; b++) {
    const top = FIRST_ROW + b * BLOCK_H;
    ws.getRow(top + 3).height = 15.75;
    ws.getRow(top + 16).height = 15.75;

    for (let k = 0; k < 4; k++) {
      const e = entries[b * 4 + k] || {};
      const lc = 2 + k * 2; // kolom label (B,D,F,H)
      const vc = lc + 1; // kolom nilai (C,E,G,I)
      const vals = [e.toko, e.salesman, e.bank, formatTanggal(e.tanggal)].map(
        (v) => `:${v ? ' ' + String(v).toUpperCase() : ''}`
      );

      for (let r = 0; r < BLOCK_H; r++) {
        const row = top + r;
        const first = r === 0;
        const last = r === BLOCK_H - 1;
        const lastText = r === 3;
        const L = ws.getCell(row, lc);
        const V = ws.getCell(row, vc);
        L.font = FONT;
        V.font = FONT;
        if (r < 4) {
          L.value = labels[r];
          V.value = vals[r];
          L.border = { left: M, right: M, top: first ? M : undefined, bottom: lastText ? M : undefined };
          V.border = { right: M, top: first ? M : undefined, bottom: lastText ? M : undefined };
        } else {
          if (r === 4) L.value = 'Bukti Transfer / QRIS';
          L.border = { left: M, bottom: last ? M : undefined };
          V.border = { right: M, bottom: last ? M : undefined };
        }
      }

      if (e.img) {
        const labelPx = PX(COL_W[lc - 1]);
        const colsPx = labelPx + PX(COL_W[vc - 1]);
        const boxW = colsPx - 8;
        const boxH = 12 * 20 + 21 - 8;
        const s = Math.min(boxW / e.w, boxH / e.h, 1);
        const w = Math.max(1, Math.round(e.w * s));
        const h = Math.max(1, Math.round(e.h * s));
        const x0 = Math.round((colsPx - w) / 2);
        const y0 = Math.round((boxH + 8 - h) / 2);
        const inLabel = x0 < labelPx;
        const id = wb.addImage({ base64: e.img, extension: 'jpeg' });
        ws.addImage(id, {
          tl: {
            nativeCol: inLabel ? lc - 1 : vc - 1,
            nativeColOff: (inLabel ? x0 : x0 - labelPx) * EMU,
            nativeRow: top + 4 - 1 + Math.floor(y0 / 20),
            nativeRowOff: (y0 % 20) * EMU,
          },
          ext: { width: w, height: h },
          editAs: 'oneCell',
        });
      }
    }
    if ((b + 1) % 4 === 0 && b + 1 < blocks) ws.getRow(top + BLOCK_H - 1).addPageBreak();
  }
  ws.pageSetup.printArea = `B2:I${FIRST_ROW + blocks * BLOCK_H - 1}`;
  return wb.xlsx.writeBuffer();
}
