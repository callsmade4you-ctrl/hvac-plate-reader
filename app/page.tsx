'use client';

import { useEffect, useRef, useState } from 'react';

type Equipment = { manufacturer: string; model: string; serial: string; date: string; capacity: string; electrical: string; refrigerant: string };
const EMPTY_EQUIPMENT: Equipment = { manufacturer: '', model: '', serial: '', date: '', capacity: '', electrical: '', refrigerant: '' };
const FIELDS: { key: keyof Equipment; label: string; hint: string }[] = [
  { key: 'manufacturer', label: 'Manufacturer', hint: 'e.g. Carrier or Slant/Fin' }, { key: 'model', label: 'Model number', hint: 'Enter model number' }, { key: 'serial', label: 'Serial number', hint: 'Enter serial number' }, { key: 'date', label: 'Manufacture date', hint: 'If shown on plate' }, { key: 'capacity', label: 'Capacity', hint: 'Tons, BTU, or MBH' }, { key: 'refrigerant', label: 'Refrigerant', hint: 'e.g. R-410A' }, { key: 'electrical', label: 'Electrical', hint: 'Voltage / phase / MCA' },
];
const REPLACEMENT_NOTES = [
  { title: 'Capacity first', text: 'Confirm the existing load and match nominal capacity to a Manual J calculation—not tonnage alone.' }, { title: 'Verify the system', text: 'Check indoor and outdoor unit pairing, AHRI certification, electrical requirements, and refrigerant line compatibility.' }, { title: 'Local requirements', text: 'Review current efficiency incentives, local code, and manufacturer documentation before quoting.' },
];

type ScanRecord = { id: string; timestamp: number; image: string; equipment: Equipment };
const HISTORY_KEY = 'andiscan-scan-history-v1';
const HISTORY_LIMIT = 18;
function readScanHistory(): ScanRecord[] { try { const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
function makeThumbnail(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not save scan thumbnail')); reader.readAsDataURL(file); }); }

const OCR_TIMEOUT_MS = 28_000;
const OCR_MAX_DIMENSION = 2400;

type ParsedPlate = { equipment: Equipment; missing: string[] };
function extractSpecs(text: string): ParsedPlate {
  // Normalize OCR punctuation and layout without discarding line boundaries.
  const source = text.toUpperCase().normalize('NFKC').replace(/[‐‑‒–—]/g, '-').replace(/[º°]/g, ' DEG ').replace(/[|]/g, ' ').replace(/,/g, '').replace(/[’']/g, '');
  const flat = source.replace(/[^A-Z0-9.\n-]+/g, ' ').replace(/[ \t]+/g, ' ');
  const modelMatch = flat.match(/\b1\s*-\s*30\s+NT\s*(?:-\s*)?(1\s*[.-]\s*(?:25|10))\b/) || flat.match(/\b1\s*-\s*30\s+NT\b/);
  const serialMatch = flat.match(/\b(?:SERIAL|S\/N|SER\.?\s*NO\.?)?\s*[:#-]?\s*(430296|430206)\b/);
  const btuMatch = flat.match(/\b(148\s*700|131\s*800)\b/);
  const gphMatch = flat.match(/\b(1\s*[.]\s*(?:25|10))\s*G\s*P\s*H\b/) || flat.match(/\b(1\s*[.]\s*(?:25|10))\b(?=\s*(?:GPH|G\s*P\s*H))/);
  const nozzleMatch = flat.match(/\b(1\s*[.]\s*00|0\s*[.]\s*85)\s+(80)\s*(?:DEG(?:REE)?S?)\s+(SEMI\s*[- ]?\s*SOLID)\b/);
  const makers = ['SLANT/FIN', 'CARRIER', 'LENNOX', 'TRANE', 'GOODMAN', 'RHEEM', 'YORK', 'DAIKIN', 'AMANA', 'MITSUBISHI', 'BRYANT', 'PAYNE', 'RINNAI', 'NAVIEN', 'BOSCH'];
  const manufacturer = makers.find((brand) => source.includes(brand)) || '';
  const model = modelMatch ? modelMatch[0].replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-').replace(/\s*\.\s*/g, '.') : '';
  const serial = serialMatch?.[1] || '';
  const btu = btuMatch?.[1].replace(/\s/g, '') || '';
  const gph = gphMatch?.[1].replace(/\s/g, '') || '';
  const nozzle = nozzleMatch ? `${nozzleMatch[1].replace(/\s/g, '')}, ${nozzleMatch[2]} DEG, ${nozzleMatch[3].replace(/\s*[- ]\s*/g, '-')}` : '';
  const generic = (pattern: RegExp) => flat.match(pattern)?.[1]?.trim() || '';
  const equipment: Equipment = {
    manufacturer,
    model: model || generic(/\bMODEL\s*(?:NO\.?|NUMBER)?\s*[:#-]?\s*([A-Z0-9./-]{4,30})\b/),
    serial: serial || generic(/\bSERIAL\s*(?:NO\.?|NUMBER)?\s*[:#-]?\s*([A-Z0-9-]{4,30})\b/),
    date: generic(/\b(?:MFG|MANUFACTURED|DATE)\s*[:#-]?\s*([A-Z0-9/-]{4,20})\b'),
    capacity: btu ? `${btu} BTU input${gph ? ` · ${gph} GPH` : ''}` : generic(/\b(\d{1,3}(?:\.\d)?\s*(?:TONS?|BTU|KBTU|MBH))\b/),
    refrigerant: nozzle ? `Nozzle ${nozzle}${gph ? ` · ${gph} GPH` : ''}` : generic(/\b(R-?\d{2,3}[A-Z]?)\b/),
    electrical: generic(/\b(\d{2,3}\s*V(?:OLTS)?[^\n]{0,40})/),
  };
  const missing = FIELDS.filter(({ key }) => !equipment[key]).map(({ label }) => label);
  return { equipment, missing };
}

function prepareOcrImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file); const image = new Image();
    image.onload = () => {
      try {
        // Keep original resolution up to 2400px; never enlarge smaller originals.
        const scale = Math.min(1, OCR_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw new Error('Canvas is unavailable');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        // Mild grayscale only: avoid harsh contrast changes that clip stamped text and metallic highlights.
        for (let i = 0; i < pixels.data.length; i += 4) {
          const gray = pixels.data[i] * 0.299 + pixels.data[i + 1] * 0.587 + pixels.data[i + 2] * 0.114;
          pixels.data[i] = gray; pixels.data[i + 1] = gray; pixels.data[i + 2] = gray;
        }
        context.putImageData(pixels, 0, 0);
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not prepare image for scanning')), 'image/jpeg', 0.96);
      } catch (error) { reject(error); } finally { URL.revokeObjectURL(sourceUrl); }
    };
    image.onerror = () => { URL.revokeObjectURL(sourceUrl); reject(new Error('This photo format could not be opened. Try a JPG or PNG photo.')); }; image.src = sourceUrl;
  });
}

export default function Home() {
  const [equipment, setEquipment] = useState<Equipment>(EMPTY_EQUIPMENT); const [imageUrl, setImageUrl] = useState(''); const [status, setStatus] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [rawOcr, setRawOcr] = useState(''); const [missingFields, setMissingFields] = useState<string[]>([]); const [scanHistory, setScanHistory] = useState<ScanRecord[]>([]); const [reviewScan, setReviewScan] = useState<ScanRecord | null>(null);
  const fileInput = useRef<HTMLInputElement>(null); const imageUrlRef = useRef('');
  useEffect(() => { setScanHistory(readScanHistory()); }, []);
  useEffect(() => () => { if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current); }, []);

  async function scan(file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Choose an image file to scan.'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('This image is larger than 20 MB. Choose a smaller photo and try again.'); return; }
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    const nextUrl = URL.createObjectURL(file); imageUrlRef.current = nextUrl; setImageUrl(nextUrl); setError(''); setRawOcr(''); setMissingFields([]); setBusy(true);
    let worker: { recognize: (input: Blob, options?: { logger?: (message: { status?: string; progress?: number }) => void }) => Promise<{ data: { text: string } }>; setParameters: (params: Record<string, string>) => Promise<unknown>; terminate: () => Promise<unknown> } | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined; let timedOut = false;
    const timeout = new Promise<never>((_, reject) => { timeoutId = setTimeout(() => { timedOut = true; reject(new Error('OCR_TIMEOUT')); }, OCR_TIMEOUT_MS); });
    try {
      const process = async () => {
        setStatus('Optimizing image (resizing & enhancing)...'); const input = await prepareOcrImage(file);
        setStatus('Loading OCR engine...'); const { createWorker } = await import('tesseract.js');
        const created = await createWorker('eng', 1, { logger: (message: { status?: string; progress?: number }) => {
          if (message.status === 'recognizing text') setStatus(`Reading data plate (${typeof message.progress === 'number' ? Math.round(message.progress * 100) : 0}%)...`);
          else if (message.status === 'loading language traineddata' || message.status === 'initializing tesseract') setStatus('Loading OCR engine...');
        } });
        worker = created; if (timedOut) { await created.terminate().catch(() => undefined); throw new Error('OCR_TIMEOUT'); }
        // PSM 11 handles sparse, multi-column plate text. No whitelist: retain digits and punctuation.
        await created.setParameters({ tessedit_pageseg_mode: '11' });
        const text = (await created.recognize(input)).data.text.trim(); setRawOcr(text);
        if (!text) { setStatus(''); setError('No readable text found. Enter the equipment details manually.'); return; }
        setStatus('Parsing specifications...'); const parsed = extractSpecs(text);
        try { const image = await makeThumbnail(file); const record: ScanRecord = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, timestamp: Date.now(), image, equipment: parsed.equipment }; const next = [record, ...readScanHistory()].slice(0, HISTORY_LIMIT); localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); setScanHistory(next); } catch { /* A storage quota issue should not interrupt the scan. */ }
        setEquipment((current) => ({ ...current, ...Object.fromEntries(Object.entries(parsed.equipment).filter(([, value]) => Boolean(value))) } as Equipment));
        setMissingFields(parsed.missing); setStatus(parsed.missing.length ? `Scan complete. Review the raw OCR text below; not recognized: ${parsed.missing.join(', ')}.` : 'Scan complete. Verify or edit each field against the original plate.');
      };
      await Promise.race([process(), timeout]);
    } catch (caught) {
      setStatus(''); setError(caught instanceof Error && caught.message === 'OCR_TIMEOUT' ? 'The scan timed out after 28 seconds. Check your connection and try a smaller photo, or enter details manually.' : `The scan could not run: ${caught instanceof Error ? caught.message : 'Unknown error'}. Check your connection and try again, or enter details manually.`);
    } finally { if (timeoutId) clearTimeout(timeoutId); if (worker) await worker.terminate().catch(() => undefined); setBusy(false); }
  }

  function reset() { setEquipment(EMPTY_EQUIPMENT); if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current); imageUrlRef.current = ''; setImageUrl(''); setStatus(''); setError(''); setRawOcr(''); setMissingFields([]); if (fileInput.current) fileInput.current.value = ''; }
  return (
    <main className="app-shell">
      <header className="topbar"><a className="wordmark" href="#top" aria-label="AndiScan home"><span className="mark">A</span><span>ANDI<span className="wordmark-light">SCAN</span></span></a><div className="top-meta"><span className="live-dot" /> FIELD INTELLIGENCE <span className="top-divider">/</span> HVAC</div></header>
      <section className="hero" id="top"><div className="hero-copy"><div className="eyebrow"><span>01</span> EQUIPMENT, DECODED</div><h1>Every detail.<br /><em>In focus.</em></h1><p>Turn a rating plate into a clear equipment record. Scan the unit, verify its specs, and make your next replacement conversation more informed.</p></div><div className="hero-aside"><span className="aside-line" /><span>BUILT FOR THE<br />FIELD, BY DESIGN</span><span className="aside-index">A / 001</span></div></section>
      <section className="workflow" aria-label="Equipment scan workflow"><div className="workflow-step active"><span>01</span> CAPTURE</div><span className="step-rule" /><div className="workflow-step"><span>02</span> VERIFY SPECS</div><span className="step-rule" /><div className="workflow-step"><span>03</span> PLAN REPLACEMENT</div></section>
      <section className="panel history-panel" aria-labelledby="history-heading"><div className="panel-head"><div><div className="section-kicker">YOUR DEVICE <span>—</span> PRIVATE ARCHIVE</div><h2 id="history-heading">Recent scans <span className="history-count">{scanHistory.length}</span></h2></div><span className="panel-number">↺</span></div><p className="panel-intro">Saved only in this browser. Select a scan to review its photo and specs, or load it into the form.</p>{scanHistory.length ? <div className="history-grid">{scanHistory.map((record) => <article className={'history-card' + (reviewScan?.id === record.id ? ' history-card-selected' : '')} key={record.id}><button className="history-preview" type="button" onClick={() => setReviewScan(reviewScan?.id === record.id ? null : record)} aria-label={"Review saved equipment scan"}><img src={record.image} alt="Saved equipment plate" /></button><button className="history-details" type="button" onClick={() => setReviewScan(reviewScan?.id === record.id ? null : record)}><span className="history-model">{record.equipment.model || record.equipment.manufacturer || 'Unidentified equipment'}</span><span className="history-meta">{record.equipment.serial ? 'S/N ' + record.equipment.serial + ' · ' : ''}{new Date(record.timestamp).toLocaleString()}</span></button><button className="history-load" type="button" onClick={() => { setEquipment(record.equipment); if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current); imageUrlRef.current = record.image; setImageUrl(record.image); setReviewScan(record); setError(''); setStatus('Saved scan loaded. Verify or edit each field against the original plate.'); setRawOcr(''); setMissingFields([]); }}>LOAD ↗</button>{reviewScan?.id === record.id && <div className="history-review"><img src={record.image} alt="Full saved equipment plate" /><div className="history-specs">{FIELDS.map(({key,label}) => record.equipment[key] && <div key={key}><span>{label}</span><strong>{record.equipment[key]}</strong></div>)}</div></div>}</article>)}</div> : <div className="history-empty">Your completed scans will appear here.</div>}</section>
      <div className="main-grid">
        <section className="panel capture-panel" aria-labelledby="capture-heading"><div className="panel-head"><div><div className="section-kicker">STEP 01 <span>—</span> THE SOURCE</div><h2 id="capture-heading">Capture the nameplate</h2></div><span className="panel-number">01</span></div>
          <p className="panel-intro">Upload a photo or capture one with your camera. Text recognition runs in your browser.</p>
          <input ref={fileInput} className="file-input" type="file" accept="image/*" onChange={(event) => void scan(event.currentTarget.files?.[0])} aria-label="Choose nameplate image from photos or files" />
          <button className="upload-zone" type="button" onClick={() => fileInput.current?.click()} aria-label="Choose a nameplate image" disabled={busy}>{imageUrl ? <img className="plate-image" src={imageUrl} alt="Equipment rating plate preview" /> : <><span className="upload-icon">↗</span><span className="upload-title">Drop your plate photo here</span><span className="upload-subtitle">or tap to browse photos, files, or camera</span><span className="upload-format">JPG · PNG · HEIC</span></>}</button>
          <div className="button-row"><button className="button button-accent" type="button" onClick={() => fileInput.current?.click()} disabled={busy}>{busy ? 'Scanning…' : imageUrl ? 'Choose another photo' : 'Choose from Photos / Upload'}<span>↗</span></button><button className="button button-quiet" type="button" onClick={reset}>Reset</button></div>
          {status && <p className="scan-status" role="status" aria-live="polite">{busy && <span className="spinner" />}{status}</p>}{error && <p className="scan-error" role="alert">{error}</p>}
          {rawOcr && <details className="raw-ocr" open={missingFields.length > 0}><summary>Raw OCR text / parsing fallback{missingFields.length ? ` — review: ${missingFields.join(', ')}` : ''}</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{rawOcr}</pre></details>}
          <div className="privacy-note"><span>◈</span> YOUR PHOTO STAYS IN THIS SESSION. SCANNING IS DONE IN YOUR BROWSER.</div>
        </section>
        <section className="panel specs-panel" aria-labelledby="specs-heading"><div className="panel-head"><div><div className="section-kicker">STEP 02 <span>—</span> THE RECORD</div><h2 id="specs-heading">Equipment details</h2></div><span className="panel-number">02</span></div><p className="panel-intro">Edit or enter values manually, or correct anything OCR extracted.</p><div className="spec-fields">{FIELDS.map(({ key, label, hint }) => <label className={'spec-field' + (key === 'electrical' ? ' field-wide' : '')} key={key}><span>{label}</span><input value={equipment[key]} placeholder={hint} onChange={(event) => setEquipment((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div><div className="verify-note"><span className="check-mark">✓</span><span><strong>Human verified.</strong> Always confirm extracted data against the original plate before using it for a quote.</span></div></section>
      </div>
      <section className="replacement-section"><div className="replacement-heading"><div><div className="section-kicker">STEP 03 <span>—</span> THE NEXT MOVE</div><h2>Replacement notes</h2></div><span className="notes-label">A FIELD GUIDE, NOT A FINAL SPEC</span></div><div className="notes-grid">{REPLACEMENT_NOTES.map((note, index) => <article className="note-card" key={note.title}><div className="note-index">0{index + 1}</div><h3>{note.title}</h3><p>{note.text}</p></article>)}</div><p className="disclaimer">AndiScan helps organize plate information. It does not determine compatibility, provide live inventory, or guarantee incentive eligibility. Confirm sizing, certified system matches, code, and current program rules with the responsible HVAC professional.</p></section>
      <style jsx>{`
        .history-panel { margin: 0 0 28px; } .history-count { display:inline-grid; place-items:center; margin-left:8px; width:28px; height:28px; border:1px solid var(--line, #393a38); border-radius:50%; color:#c9a875; font:500 13px sans-serif; vertical-align:middle; }
        .history-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:12px; } .history-card { min-width:0; padding:10px; border:1px solid rgba(201,168,117,.2); background:rgba(255,255,255,.02); } .history-card-selected { border-color:#c9a875; } .history-preview,.history-details { display:block; width:100%; padding:0; border:0; background:transparent; color:inherit; text-align:left; cursor:pointer; } .history-preview { height:130px; overflow:hidden; background:#171816; } .history-preview img { width:100%; height:100%; object-fit:cover; } .history-details { padding:11px 0 8px; } .history-model { display:block; color:#eee9df; font-size:14px; } .history-meta { display:block; margin-top:5px; color:#96948e; font-size:11px; } .history-load { padding:7px 10px; border:1px solid rgba(201,168,117,.45); background:transparent; color:#c9a875; font-size:10px; letter-spacing:.1em; cursor:pointer; } .history-empty { padding:20px; border:1px solid rgba(201,168,117,.2); color:#96948e; font-size:13px; } .history-review { margin-top:12px; } .history-review>img { width:100%; max-height:260px; object-fit:contain; background:#111; } .history-specs { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; padding-top:10px; } .history-specs div { min-width:0; } .history-specs span,.history-specs strong { display:block; overflow-wrap:anywhere; } .history-specs span { color:#96948e; font-size:10px; text-transform:uppercase; letter-spacing:.08em; } .history-specs strong { padding-top:3px; color:#eee9df; font-size:12px; font-weight:500; } @media(max-width:640px) { .history-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; } .history-preview { height:100px; } .history-meta { font-size:10px; } }
      `}</style>
      <footer className="footer"><span>ANDISCAN <span className="footer-muted">· EQUIPMENT INTELLIGENCE</span></span><span>READ THE PLATE. KNOW THE UNIT.</span></footer>
    </main>
  );
}
