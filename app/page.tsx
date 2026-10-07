'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Equipment = { manufacturer: string; model: string; serial: string; date: string; capacity: string; electrical: string; refrigerant: string };
const EMPTY_EQUIPMENT: Equipment = { manufacturer: '', model: '', serial: '', date: '', capacity: '', electrical: '', refrigerant: '' };
const FIELDS: { key: keyof Equipment; label: string; hint: string }[] = [
  { key: 'manufacturer', label: 'Manufacturer', hint: 'e.g. Carrier or Slant/Fin' }, { key: 'model', label: 'Model number', hint: 'Enter model number' }, { key: 'serial', label: 'Serial number', hint: 'Enter serial number' }, { key: 'date', label: 'Manufacture date', hint: 'If shown on plate' }, { key: 'capacity', label: 'Capacity', hint: 'Tons, BTU, or MBH' }, { key: 'refrigerant', label: 'Refrigerant', hint: 'e.g. R-410A' }, { key: 'electrical', label: 'Electrical', hint: 'Voltage / phase / MCA' },
];
const REPLACEMENT_NOTES = [
  { title: 'Capacity first', text: 'Confirm the existing load and match nominal capacity to a Manual J calculation—not tonnage alone.' }, { title: 'Verify the system', text: 'Check indoor and outdoor unit pairing, AHRI certification, electrical requirements, and refrigerant line compatibility.' }, { title: 'Local requirements', text: 'Review current efficiency incentives, local code, and manufacturer documentation before quoting.' },
];
function extractSpecs(text: string): Equipment {
  const source = text.toUpperCase(); const capture = (pattern: RegExp) => source.match(pattern)?.[1]?.trim() ?? '';
  const manufacturers = ['SLANT/FIN', 'CARRIER', 'LENNOX', 'TRANE', 'GOODMAN', 'RHEEM', 'YORK', 'DAIKIN', 'AMANA', 'MITSUBISHI', 'BRYANT', 'PAYNE', 'RINNAI', 'NAVIEN', 'BOSCH'];
  return { manufacturer: capture(/(?:MANUFACTURER|BRAND)[:\s]+([A-Z][A-Z0-9 &/-]{1,30})/) || manufacturers.find((brand) => source.includes(brand)) || '', model: capture(/MODEL(?:\s*(?:NO\.?|NUMBER))?[#:\s]+([A-Z0-9./-]{3,30})/), serial: capture(/SERIAL(?:\s*(?:NO\.?|NUMBER))?[#:\s]+([A-Z0-9./-]{4,30})/), date: capture(/(?:MFG|MANUFACTURED|DATE)[:\s]+([A-Z0-9/-]{4,20})/), capacity: capture(/(\d{1,2}(?:\.\d)?\s*(?:TONS?|BTU|KBTU|MBH))/), electrical: capture(/(\d{2,3}\s*V(?:OLTS)?[^\n]{0,40})/), refrigerant: capture(/(R-?\d{2,3}[A-Z]?)/) };
}

export default function Home() {
  const [equipment, setEquipment] = useState<Equipment>(EMPTY_EQUIPMENT); const [imageUrl, setImageUrl] = useState(''); const [status, setStatus] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null); const imageUrlRef = useRef('');
  useEffect(() => () => { if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current); }, []);

  async function scan(file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Choose an image file to scan.'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('This image is larger than 20 MB. Choose a smaller photo and try again.'); return; }
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    const nextUrl = URL.createObjectURL(file); imageUrlRef.current = nextUrl; setImageUrl(nextUrl); setError(''); setBusy(true); setStatus('Preparing in-browser plate scan…');
    let worker: { recognize: (input: File) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> } | undefined;
    try {
      const { createWorker } = await import('tesseract.js'); worker = await createWorker('eng'); setStatus('Reading equipment nameplate…');
      const result = await worker.recognize(file); const text = result.data.text.trim();
      if (!text) { setStatus('No readable text found. Try a closer, sharper photo.'); setError('Keep the plate flat, well lit, and in focus, then scan again.'); return; }
      const found = extractSpecs(text); setEquipment((current) => ({ ...current, ...Object.fromEntries(Object.entries(found).filter(([, value]) => Boolean(value))) } as Equipment)); setStatus('Scan complete. Verify each field against the original plate.');
    } catch { setStatus(''); setError('The scan could not run. Check your connection and try again, or enter the details manually.'); }
    finally { if (worker) await worker.terminate().catch(() => undefined); setBusy(false); }
  }

  const handlePaste = useCallback((event: ClipboardEvent | React.ClipboardEvent<HTMLElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) { event.preventDefault(); void scan(file); return; }
      }
    }
  }, []);

  useEffect(() => {
    const listener = (event: ClipboardEvent) => handlePaste(event);
    window.addEventListener('paste', listener);
    return () => window.removeEventListener('paste', listener);
  }, [handlePaste]);

  async function pasteFromClipboard() {
    if (!navigator.clipboard?.read) { setError('Clipboard image access is not available here. Use the paste shortcut or choose a photo.'); return; }
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (imageType) { const blob = await item.getType(imageType); await scan(new File([blob], 'clipboard-image', { type: blob.type || imageType })); return; }
      }
      setError('No image found in the clipboard. Copy a photo first, then try again.');
    } catch { setError('Clipboard access was denied or unavailable. Try pasting directly into the page, or choose a photo.'); }
  }

  function reset() {
    setEquipment(EMPTY_EQUIPMENT); if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current); imageUrlRef.current = ''; setImageUrl(''); setStatus(''); setError(''); if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <main className="app-shell" onPaste={handlePaste}>
      <header className="topbar"><a className="wordmark" href="#top" aria-label="AndiScan home"><span className="mark">A</span><span>ANDI<span className="wordmark-light">SCAN</span></span></a><div className="top-meta"><span className="live-dot" /> FIELD INTELLIGENCE <span className="top-divider">/</span> HVAC</div></header>
      <section className="hero" id="top"><div className="hero-copy"><div className="eyebrow"><span>01</span> EQUIPMENT, DECODED</div><h1>Every detail.<br /><em>In focus.</em></h1><p>Turn a rating plate into a clear equipment record. Scan the unit, verify its specs, and make your next replacement conversation more informed.</p></div><div className="hero-aside"><span className="aside-line" /><span>BUILT FOR THE<br />FIELD, BY DESIGN</span><span className="aside-index">A / 001</span></div></section>
      <section className="workflow" aria-label="Equipment scan workflow"><div className="workflow-step active"><span>01</span> CAPTURE</div><span className="step-rule" /><div className="workflow-step"><span>02</span> VERIFY SPECS</div><span className="step-rule" /><div className="workflow-step"><span>03</span> PLAN REPLACEMENT</div></section>
      <div className="main-grid">
        <section className="panel capture-panel" aria-labelledby="capture-heading">
          <div className="panel-head"><div><div className="section-kicker">STEP 01 <span>—</span> THE SOURCE</div><h2 id="capture-heading">Capture the nameplate</h2></div><span className="panel-number">01</span></div>
          <p className="panel-intro">Upload a photo or capture one with your camera. Text recognition runs in your browser.</p>
          <input ref={fileInput} className="file-input" type="file" accept="image/*" onChange={(event) => void scan(event.currentTarget.files?.[0])} aria-label="Choose nameplate image from photos or files" />
          <button className="upload-zone" type="button" onClick={() => fileInput.current?.click()} aria-label="Choose a nameplate image" disabled={busy}>
            {imageUrl ? <img className="plate-image" src={imageUrl} alt="Equipment rating plate preview" /> : <><span className="upload-icon">↗</span><span className="upload-title">Drop your plate photo here</span><span className="upload-subtitle">or tap to browse photos, files, or camera</span><span className="upload-format">JPG · PNG · HEIC</span></>}
          </button>
          <div className="button-row"><button className="button button-accent" type="button" onClick={() => fileInput.current?.click()} disabled={busy}>{busy ? 'Scanning…' : imageUrl ? 'Choose another photo' : 'Choose from Photos / Upload'}<span>↗</span></button><button className="button button-quiet" type="button" onClick={() => void pasteFromClipboard()} disabled={busy}>Paste from Clipboard</button><button className="button button-quiet" type="button" onClick={reset}>Reset</button></div>
          <p className="panel-intro">Tip: Copy a photo from Messages, then use your device’s Paste command anywhere on this page, or tap Paste from Clipboard above. Clipboard access may require permission.</p>
          {status && <p className="scan-status" role="status">{busy && <span className="spinner" />}{status}</p>}{error && <p className="scan-error" role="alert">{error}</p>}
          <div className="privacy-note"><span>◈</span> YOUR PHOTO STAYS IN THIS SESSION. SCANNING IS DONE IN YOUR BROWSER.</div>
        </section>
        <section className="panel specs-panel" aria-labelledby="specs-heading"><div className="panel-head"><div><div className="section-kicker">STEP 02 <span>—</span> THE RECORD</div><h2 id="specs-heading">Equipment details</h2></div><span className="panel-number">02</span></div><p className="panel-intro">OCR is a starting point. Review the plate and correct anything that doesn’t look right.</p><div className="spec-fields">{FIELDS.map(({ key, label, hint }) => <label className={'spec-field' + (key === 'electrical' ? ' field-wide' : '')} key={key}><span>{label}</span><input value={equipment[key]} placeholder={hint} onChange={(event) => setEquipment((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div><div className="verify-note"><span className="check-mark">✓</span><span><strong>Human verified.</strong> Always confirm extracted data against the original plate before using it for a quote.</span></div></section>
      </div>
      <section className="replacement-section"><div className="replacement-heading"><div><div className="section-kicker">STEP 03 <span>—</span> THE NEXT MOVE</div><h2>Replacement notes</h2></div><span className="notes-label">A FIELD GUIDE, NOT A FINAL SPEC</span></div><div className="notes-grid">{REPLACEMENT_NOTES.map((note, index) => <article className="note-card" key={note.title}><div className="note-index">0{index + 1}</div><h3>{note.title}</h3><p>{note.text}</p></article>)}</div><p className="disclaimer">AndiScan helps organize plate information. It does not determine compatibility, provide live inventory, or guarantee incentive eligibility. Confirm sizing, certified system matches, code, and current program rules with the responsible HVAC professional.</p></section>
      <footer className="footer"><span>ANDISCAN <span className="footer-muted">· EQUIPMENT INTELLIGENCE</span></span><span>READ THE PLATE. KNOW THE UNIT.</span></footer>
    </main>
  );
}
