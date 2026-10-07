'use client';

import { useRef, useState } from 'react';

type Equipment = {
  manufacturer: string;
  model: string;
  serial: string;
  date: string;
  capacity: string;
  electrical: string;
  refrigerant: string;
};

const emptyEquipment: Equipment = {
  manufacturer: '', model: '', serial: '', date: '', capacity: '', electrical: '', refrigerant: '',
};

const replacementNotes = [
  { title: 'Capacity first', text: 'Confirm the existing load and match nominal capacity to a Manual J calculation—not tonnage alone.' },
  { title: 'Verify the system', text: 'Check indoor and outdoor unit pairing, AHRI certification, electrical requirements, and refrigerant line compatibility.' },
  { title: 'Local requirements', text: 'Review current efficiency incentives, local code, and manufacturer documentation before quoting.' },
];

function extractSpecs(text: string): Equipment {
  const source = text.toUpperCase();
  const capture = (pattern: RegExp) => source.match(pattern)?.[1]?.trim() ?? '';
  const brands = ['CARRIER', 'LENNOX', 'TRANE', 'GOODMAN', 'RHEEM', 'YORK', 'DAIKIN', 'AMANA', 'MITSUBISHI'];
  return {
    manufacturer: capture(/(?:MANUFACTURER|BRAND)[:\\s]+([A-Z][A-Z0-9 &-]{1,24})/) || brands.find((brand) => source.includes(brand)) || '',
    model: capture(/MODEL(?:\\s*(?:NO|NUMBER))?[#:\\s]+([A-Z0-9-]{4,25})/),
    serial: capture(/SERIAL(?:\\s*(?:NO|NUMBER))?[#:\\s]+([A-Z0-9-]{5,25})/),
    date: capture(/(?:MFG|MANUFACTURED|DATE)[:\\s]+([A-Z0-9/-]{4,20})/),
    capacity: capture(/(\\d{1,2}(?:\\.\\d)?\\s*(?:TON|BTU|KBTU|MBH))/),
    electrical: capture(/(\\d{2,3}\\s*V(?:OLTS)?[^\\n]{0,40})/),
    refrigerant: capture(/(R-?\\d{2,3}[A-Z]?)/),
  };
}

const fields: { key: keyof Equipment; label: string; hint: string }[] = [
  { key: 'manufacturer', label: 'Manufacturer', hint: 'e.g. Carrier' },
  { key: 'model', label: 'Model number', hint: 'Enter model number' },
  { key: 'serial', label: 'Serial number', hint: 'Enter serial number' },
  { key: 'date', label: 'Manufacture date', hint: 'If shown on plate' },
  { key: 'capacity', label: 'Capacity', hint: 'Tons, BTU, or MBH' },
  { key: 'refrigerant', label: 'Refrigerant', hint: 'e.g. R-410A' },
  { key: 'electrical', label: 'Electrical', hint: 'Voltage / phase / MCA' },
];

export default function Home() {
  const [equipment, setEquipment] = useState<Equipment>(emptyEquipment);
  const [imageUrl, setImageUrl] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function scan(file?: File) {
    if (!file) return;
    setImageUrl(URL.createObjectURL(file));
    setError('');
    setBusy(true);
    setStatus('Preparing secure, in-browser plate scan…');
    let worker: Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>> | undefined;
    try {
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('eng');
      setStatus('Reading equipment nameplate…');
      const result = await worker.recognize(file);
      const found = extractSpecs(result.data.text);
      setEquipment((current) => ({
        ...current,
        ...Object.fromEntries(Object.entries(found).filter(([, value]) => value)),
      } as Equipment));
      setStatus(result.data.text.trim() ? 'Scan complete. Please verify each field against the plate.' : 'No readable text found. Try a closer, sharper photo.');
      if (!result.data.text.trim()) setError('Keep the plate flat, well lit, and in focus, then scan again.');
    } catch {
      setStatus('');
      setError('The scan could not run. Check your connection and try again, or enter the details manually.');
    } finally {
      if (worker) await worker.terminate().catch(() => undefined);
      setBusy(false);
    }
  }

  function reset() {
    setEquipment(emptyEquipment);
    setImageUrl('');
    setStatus('');
    setError('');
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="AndiScan home"><span className="mark">A</span><span>ANDI<span className="wordmark-light">SCAN</span></span></a>
        <div className="top-meta"><span className="live-dot" /> FIELD INTELLIGENCE <span className="top-divider">/</span> HVAC</div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>01</span> EQUIPMENT, DECODED</div>
          <h1>Every detail.<br /><em>In focus.</em></h1>
          <p>Turn a rating plate into a clear equipment record. Scan the unit, verify its specs, and make your next replacement conversation more informed.</p>
        </div>
        <div className="hero-aside"><span className="aside-line" /><span>BUILT FOR THE<br />FIELD, BY DESIGN</span><span className="aside-index">A / 001</span></div>
      </section>

      <section className="workflow" aria-label="Equipment scan workflow">
        <div className="workflow-step active"><span>01</span> CAPTURE</div><span className="step-rule" />
        <div className="workflow-step"><span>02</span> VERIFY SPECS</div><span className="step-rule" />
        <div className="workflow-step"><span>03</span> PLAN REPLACEMENT</div>
      </section>

      <div className="main-grid">
        <section className="panel capture-panel">
          <div className="panel-head"><div><div className="section-kicker">STEP 01 <span>—</span> THE SOURCE</div><h2>Capture the nameplate</h2></div><span className="panel-number">01</span></div>
          <p className="panel-intro">Upload a photo or capture one with your camera. Text recognition runs in your browser.</p>
          <input ref={fileInput} className="file-input" type="file" accept="image/*" capture="environment" onChange={(event) => scan(event.target.files?.[0])} />
          <button className="upload-zone" type="button" onClick={() => fileInput.current?.click()} aria-label="Choose or capture a nameplate image">
            {imageUrl ? <img className="plate-image" src={imageUrl} alt="Equipment rating plate preview" /> : <><span className="upload-icon">↗</span><span className="upload-title">Drop your plate photo here</span><span className="upload-subtitle">or tap to browse / open camera</span><span className="upload-format">JPG · PNG · HEIC</span></>}
          </button>
          <div className="button-row"><button className="button button-accent" type="button" onClick={() => fileInput.current?.click()} disabled={busy}>{busy ? 'Scanning…' : imageUrl ? 'Replace image' : 'Choose / take photo'}<span>↗</span></button><button className="button button-quiet" type="button" onClick={reset}>Reset</button></div>
          {status && <p className="scan-status" role="status">{busy && <span className="spinner" />}{status}</p>}
          {error && <p className="scan-error" role="alert">{error}</p>}
          <div className="privacy-note"><span>◈</span> YOUR PHOTO STAYS IN THIS SESSION. SCANNING IS DONE IN YOUR BROWSER.</div>
        </section>

        <section className="panel specs-panel">
          <div className="panel-head"><div><div className="section-kicker">STEP 02 <span>—</span> THE RECORD</div><h2>Equipment details</h2></div><span className="panel-number">02</span></div>
          <p className="panel-intro">OCR is a starting point. Review the plate and correct anything that doesn’t look right.</p>
          <div className="spec-fields">{fields.map(({ key, label, hint }) => <label className={'spec-field' + (key === 'electrical' ? ' field-wide' : '')} key={key}><span>{label}</span><input value={equipment[key]} placeholder={hint} onChange={(event) => setEquipment((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div>
          <div className="verify-note"><span className="check-mark">✓</span><span><strong>Human verified.</strong> Always confirm extracted data against the original label before using it for a quote.</span></div>
        </section>
      </div>

      <section className="replacement-section">
        <div className="replacement-heading"><div><div className="section-kicker">STEP 03 <span>—</span> THE NEXT MOVE</div><h2>Replacement notes</h2></div><span className="notes-label">A FIELD GUIDE, NOT A FINAL SPEC</span></div>
        <div className="notes-grid">{replacementNotes.map((note, index) => <article className="note-card" key={note.title}><div className="note-index">0{index + 1}</div><h3>{note.title}</h3><p>{note.text}</p></article>)}</div>
        <p className="disclaimer">AndiScan helps organize plate information. It does not determine compatibility, provide live inventory, or guarantee incentive eligibility. Confirm sizing, certified system matches, code, and current program rules with the responsible HVAC professional.</p>
      </section>
      <footer className="footer"><span>ANDISCAN <span className="footer-muted">· EQUIPMENT INTELLIGENCE</span></span><span>READ THE PLATE. KNOW THE UNIT.</span></footer>
    </main>
  );
}
