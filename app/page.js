'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadDraft, saveDraft, clearDraft, resizeImage, uid } from '../lib/store';
import { buildWorkbook, sheetNameFromDate, formatTanggal } from '../lib/excel';

const SALESMEN = ['HENDRA', 'STEVEN', 'ROSSI', 'MIKAEL', 'RAHMAT', 'IKTIAR', 'PRAYOGO', 'MAESYAROH', 'ASEP', 'KURNIAWAN', 'RINCHA', 'LIE'];
const isComplete = (e) => !!(e.toko?.trim() && e.salesman?.trim() && e.bank && e.tanggal);

export default function Page() {
  const [entries, setEntries] = useState([]);
  const [sheetName, setSheetName] = useState(sheetNameFromDate());
  const [ready, setReady] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [filter, setFilter] = useState('all');
  const [zoom, setZoom] = useState(null);
  const [toast, setToast] = useState('');
  const [bulkSales, setBulkSales] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const queue = useRef({ running: 0, items: [] });

  const flash = (m) => {
    setToast(m);
    setTimeout(() => setToast(''), 2600);
  };

  // load draft
  useEffect(() => {
    loadDraft()
      .then((d) => {
        if (d) {
          // kartu yang masih "reading" saat ditutup -> dianggap selesai
          setEntries((d.entries || []).map((e) => (e.status === 'reading' ? { ...e, status: 'idle' } : e)));
          if (d.sheetName) setSheetName(d.sheetName);
          setSavedAt(d.savedAt);
        }
      })
      .finally(() => setReady(true));
  }, []);

  // autosave (debounce)
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      saveDraft({ entries, sheetName }).then(() => setSavedAt(Date.now())).catch(() => {});
    }, 700);
    return () => clearTimeout(t);
  }, [entries, sheetName, ready]);

  const patch = useCallback((id, p) => setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...p } : e))), []);

  // ---------- OCR queue (maks 3 paralel) ----------
  const runExtract = useCallback(
    async (id, img) => {
      patch(id, { status: 'reading' });
      try {
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ image: img }),
        });
        if (res.status === 501) {
          patch(id, { status: 'noocr' });
          return;
        }
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'gagal');
        setEntries((es) =>
          es.map((e) => {
            if (e.id !== id) return e;
            const next = { ...e, status: 'done', conf: j.confidence, note: j.catatan };
            const ai = { ...(e.ai || {}) };
            if (j.tanggal && (!e.tanggal || e.ai?.tanggal)) {
              next.tanggal = j.tanggal;
              ai.tanggal = true;
            }
            if (j.metode && (!e.bank || e.ai?.bank)) {
              next.bank = j.metode;
              ai.bank = true;
            }
            next.ai = ai;
            return next;
          })
        );
      } catch {
        patch(id, { status: 'fail' });
      }
    },
    [patch]
  );

  const pump = useCallback(() => {
    const q = queue.current;
    while (q.running < 3 && q.items.length) {
      const job = q.items.shift();
      q.running++;
      runExtract(job.id, job.img).finally(() => {
        q.running--;
        pump();
      });
    }
  }, [runExtract]);

  const enqueue = useCallback(
    (id, img) => {
      queue.current.items.push({ id, img });
      pump();
    },
    [pump]
  );

  // ---------- upload ----------
  const addFiles = async (files) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setBusy(true);
    const made = [];
    for (const f of list) {
      try {
        const { img, w, h } = await resizeImage(f);
        made.push({ id: uid(), img, w, h, toko: '', salesman: '', bank: '', tanggal: '', status: 'reading', ai: {} });
      } catch {
        /* skip file rusak */
      }
    }
    setEntries((es) => [...es, ...made]);
    made.forEach((m) => enqueue(m.id, m.img));
    setBusy(false);
    flash(`${made.length} foto ditambahkan`);
  };

  const onDrop = (e) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  // ---------- actions ----------
  const manualSave = async () => {
    await saveDraft({ entries, sheetName });
    setSavedAt(Date.now());
    flash('Draft tersimpan di browser ini');
  };

  const reset = async () => {
    if (!confirm('Hapus semua foto dan isian? Draft juga ikut terhapus.')) return;
    await clearDraft();
    setEntries([]);
    setSavedAt(null);
  };

  const download = async () => {
    if (!entries.length) return flash('Belum ada foto');
    const bad = entries.filter((e) => !isComplete(e)).length;
    if (bad && !confirm(`${bad} kartu belum lengkap. Tetap download?`)) return;
    setBusy(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const buf = await buildWorkbook(ExcelJS, entries, sheetName);
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Rekap_Bukti_Transfer_${sheetName || 'rekap'}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (err) {
      console.error(err);
      flash('Gagal membuat Excel');
    }
    setBusy(false);
  };

  const applyBulk = () => {
    const v = bulkSales.trim().toUpperCase();
    if (!v) return;
    setEntries((es) => es.map((e) => (e.salesman?.trim() ? e : { ...e, salesman: v })));
    flash(`Salesman "${v}" diisi ke kartu yang kosong`);
  };

  // ---------- derived ----------
  const stats = useMemo(() => {
    const complete = entries.filter(isComplete).length;
    return {
      total: entries.length,
      complete,
      pending: entries.length - complete,
      qris: entries.filter((e) => e.bank === 'QRIS').length,
      trf: entries.filter((e) => e.bank === 'TRF').length,
    };
  }, [entries]);

  const known = useMemo(() => {
    const s = new Set(SALESMEN);
    entries.forEach((e) => e.salesman?.trim() && s.add(e.salesman.trim().toUpperCase()));
    return [...s];
  }, [entries]);

  const shown = entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => (filter === 'all' ? true : filter === 'done' ? isComplete(e) : !isComplete(e)));

  const pct = stats.total ? Math.round((stats.complete / stats.total) * 100) : 0;
  const savedTxt = savedAt ? new Date(savedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <main className="wrap" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <header className="top">
        <div>
          <h1>Rekap Bukti Transfer</h1>
          <p className="sub">Upload foto → isi form → download Excel sesuai template</p>
        </div>
        <div className="actions">
          <label className="sheet" title="Nama sheet di Excel (default tanggal hari ini)">
            Sheet
            <input value={sheetName} maxLength={31} onChange={(e) => setSheetName(e.target.value)} />
          </label>
          <button className="btn" onClick={manualSave}>Simpan Draft</button>
          <button className="btn primary" onClick={download} disabled={busy || !entries.length}>
            ⬇ Download Excel
          </button>
        </div>
      </header>

      <section className="kpis">
        <div className="kpi"><span>Total foto</span><b>{stats.total}</b></div>
        <div className="kpi ok"><span>Lengkap</span><b>{stats.complete}</b></div>
        <div className="kpi warn"><span>Belum lengkap</span><b>{stats.pending}</b></div>
        <div className="kpi"><span>QRIS</span><b>{stats.qris}</b></div>
        <div className="kpi"><span>TRF</span><b>{stats.trf}</b></div>
        <div className="kpi prog">
          <span>Progres {pct}%</span>
          <div className="bar"><i style={{ width: pct + '%' }} /></div>
          <small>Draft tersimpan {savedTxt}</small>
        </div>
      </section>

      <section className="tools">
        <button className="drop" onClick={() => fileRef.current?.click()}>
          <b>＋ Upload foto</b>
          <span>klik, atau seret ke halaman ini · bisa tambah kapan saja</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />

        <div className="bulk">
          <input list="sls" placeholder="Salesman untuk semua yang kosong" value={bulkSales} onChange={(e) => setBulkSales(e.target.value)} />
          <button className="btn" onClick={applyBulk}>Terapkan</button>
        </div>

        <div className="chips">
          {[['all', 'Semua'], ['todo', 'Belum lengkap'], ['done', 'Lengkap']].map(([k, l]) => (
            <button key={k} className={'chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{l}</button>
          ))}
          <button className="chip danger" onClick={reset} disabled={!entries.length}>Mulai baru</button>
        </div>
      </section>

      <datalist id="sls">{known.map((s) => <option key={s} value={s} />)}</datalist>

      {!entries.length && ready && (
        <div className="empty">Belum ada foto. Upload bukti transfer / QRIS untuk mulai.</div>
      )}

      <section className="grid">
        {shown.map(({ e, i }) => (
          <article key={e.id} className={'card' + (isComplete(e) ? ' complete' : '')}>
            <div className="thumb" onClick={() => setZoom(e.img)}>
              <img src={e.img} alt={`Bukti ${i + 1}`} />
              <span className="no">#{i + 1}</span>
              {e.status === 'reading' && <span className="read"><i className="spin" /> membaca…</span>}
            </div>
            <div className="form">
              <input className="f" placeholder="Nama toko" value={e.toko} onChange={(ev) => patch(e.id, { toko: ev.target.value })} />
              <input className="f" list="sls" placeholder="Nama salesman" value={e.salesman} onChange={(ev) => patch(e.id, { salesman: ev.target.value })} />

              <div className="seg">
                {['QRIS', 'TRF'].map((b) => (
                  <button
                    key={b}
                    className={e.bank === b ? 'on' : ''}
                    onClick={() => patch(e.id, { bank: e.bank === b ? '' : b, ai: { ...e.ai, bank: false } })}
                  >
                    {b}
                  </button>
                ))}
                {e.ai?.bank && <em className="ai" title="Dibaca otomatis dari foto, cek lagi">AI</em>}
              </div>

              <div className="dt">
                <input
                  className="f"
                  type="date"
                  value={e.tanggal}
                  onChange={(ev) => patch(e.id, { tanggal: ev.target.value, ai: { ...e.ai, tanggal: false } })}
                />
                {e.ai?.tanggal && <em className="ai" title="Dibaca otomatis dari foto, cek lagi">AI</em>}
              </div>
              {e.tanggal && <small className="prev">{formatTanggal(e.tanggal)}</small>}

              <div className="foot">
                {e.status === 'noocr' && <small className="muted">Baca otomatis nonaktif, isi manual</small>}
                {e.status === 'fail' && <small className="muted">Gagal baca otomatis</small>}
                {(e.status === 'done' || e.status === 'fail' || e.status === 'idle') && (
                  <button className="link" onClick={() => enqueue(e.id, e.img)}>↻ baca ulang</button>
                )}
                <button className="link del" onClick={() => setEntries((es) => es.filter((x) => x.id !== e.id))}>hapus</button>
              </div>
            </div>
          </article>
        ))}
      </section>

      {zoom && (
        <div className="modal" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Zoom bukti" />
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
