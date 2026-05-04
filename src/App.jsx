import { useState, useEffect, useRef, useCallback } from "react";
import {
  ShoppingCart,
  Check,
  ArrowRight,
  ArrowLeft,
  Camera,
  ShieldCheck,
  Smartphone,
  X,
  Info,
  Ruler,
  RotateCcw,
  Undo2,
} from "lucide-react";

/* ============================================================
   Ten × You — A4-Reference Sizer (v7)
   Tap-to-place markers. A4 short edge (21cm) as known scale.
   ============================================================ */

const LEVEL_THRESHOLD_DEG = 5;
const A4_SHORT_EDGE_CM = 21.0;

const SIZE_CHART = [
  { cm: 22.3, size: 3 }, { cm: 22.7, size: 4 }, { cm: 23.1, size: 4 },
  { cm: 23.55, size: 5 }, { cm: 24.0, size: 5 }, { cm: 24.4, size: 6 },
  { cm: 24.8, size: 6 }, { cm: 25.25, size: 7 }, { cm: 25.7, size: 7 },
  { cm: 26.1, size: 8 }, { cm: 26.5, size: 8 }, { cm: 26.9, size: 9 },
  { cm: 27.3, size: 9 }, { cm: 27.75, size: 10 }, { cm: 28.2, size: 10 },
  { cm: 28.6, size: 11 }, { cm: 29.0, size: 11 }, { cm: 29.45, size: 12 },
  { cm: 29.9, size: 12 },
];

const POINT_SEQUENCE = [
  { id: "paperA", label: "First corner of the paper's short edge", color: "#F59E0B", short: "Paper ◀" },
  { id: "paperB", label: "Other corner of the same short edge", color: "#F59E0B", short: "Paper ▶" },
  { id: "heel", label: "Back of your heel", color: "#FFFFFF", short: "Heel" },
  { id: "toe", label: "Tip of your longest toe", color: "#FFFFFF", short: "Toe" },
];

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function cmToSize(cm) {
  if (cm < SIZE_CHART[0].cm) return SIZE_CHART[0].size;
  if (cm > SIZE_CHART[SIZE_CHART.length - 1].cm) return SIZE_CHART[SIZE_CHART.length - 1].size;
  for (const row of SIZE_CHART) if (cm <= row.cm) return row.size;
  return SIZE_CHART[SIZE_CHART.length - 1].size;
}
function sizeToCm(size) {
  const matches = SIZE_CHART.filter((r) => r.size === size);
  if (matches.length) return matches[matches.length - 1].cm;
  return 22.0 + (size - 3) * 0.85;
}
function convertSizes(size) {
  const uk = size;
  const us = uk + 2;
  const cm = sizeToCm(size);
  const eu = Math.round(cm * 1.5 + 2);
  return { uk, us, eu };
}

/* Leveller hook */
function useLeveller() {
  const [beta, setBeta] = useState(0);
  const [gamma, setGamma] = useState(0);
  const [source, setSource] = useState("idle");
  const [simTilt, setSimTilt] = useState(12);

  const handler = useCallback((e) => {
    setBeta(e.beta ?? 0);
    setGamma(e.gamma ?? 0);
  }, []);

  const requestSensor = useCallback(async () => {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result !== "granted") { setSource("simulated"); return "simulated"; }
      } catch { setSource("simulated"); return "simulated"; }
    }
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
      setSource("simulated"); return "simulated";
    }
    return new Promise((resolve) => {
      let received = false;
      const probe = (e) => {
        if (e.beta !== null || e.gamma !== null) {
          received = true;
          window.removeEventListener("deviceorientation", probe);
          window.addEventListener("deviceorientation", handler);
          setSource("sensor"); resolve("sensor");
        }
      };
      window.addEventListener("deviceorientation", probe);
      setTimeout(() => {
        if (!received) {
          window.removeEventListener("deviceorientation", probe);
          setSource("simulated"); resolve("simulated");
        }
      }, 800);
    });
  }, [handler]);

  useEffect(() => () => window.removeEventListener("deviceorientation", handler), [handler]);

  const sensorTilt = Math.hypot(beta, gamma);
  const totalTilt = source === "simulated" ? simTilt : sensorTilt;
  const isLevel = source !== "idle" && totalTilt <= LEVEL_THRESHOLD_DEG;
  const bubble = source === "simulated"
    ? { x: Math.sin(Date.now() / 600) * (simTilt / 30), y: Math.cos(Date.now() / 600) * (simTilt / 30) }
    : { x: clamp((gamma ?? 0) / 30, -1, 1), y: clamp((beta ?? 0) / 30, -1, 1) };
  return { totalTilt, isLevel, source, requestSensor, simTilt, setSimTilt, bubble };
}

/* App */
export default function App() {
  const [stage, setStage] = useState("welcome");
  const [stream, setStream] = useState(null);
  const [snapshot, setSnapshot] = useState(null); // { src, w, h }
  const [cameraError, setCameraError] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [added, setAdded] = useState(false);
  const [result, setResult] = useState(null);
  const videoRef = useRef(null);
  const lev = useLeveller();

  // Markers — null until placed; positions stored as % of image (0–100)
  const [points, setPoints] = useState({ paperA: null, paperB: null, heel: null, toe: null });
  const [activeIdx, setActiveIdx] = useState(0);

  /* Camera */
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      setStream(s);
    } catch (e) {
      setCameraError(e?.name === "NotAllowedError"
        ? "Camera permission denied. Enable it in your browser settings."
        : "Couldn't access the camera.");
    }
  }, []);
  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream, stage]);
  const stopCamera = useCallback(() => {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); setStream(null); }
  }, [stream]);
  useEffect(() => () => stopCamera(), [stopCamera]);

  const captureStill = () => {
    if (!videoRef.current || !lev.isLevel) return;
    const v = videoRef.current;
    const w = v.videoWidth;
    const h = v.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(v, 0, 0);
    setSnapshot({ src: canvas.toDataURL("image/jpeg", 0.92), w, h });
    setPoints({ paperA: null, paperB: null, heel: null, toe: null });
    setActiveIdx(0);
    stopCamera();
    setStage("align");
  };

  /* Place a point at (xPct, yPct) — both are 0–100 percentages */
  const placePoint = (xPct, yPct) => {
    if (activeIdx >= POINT_SEQUENCE.length) return;
    const id = POINT_SEQUENCE[activeIdx].id;
    setPoints((p) => ({ ...p, [id]: { x: xPct, y: yPct } }));
    setActiveIdx((i) => Math.min(i + 1, POINT_SEQUENCE.length));
  };

  /* Nudge a placed point by delta % */
  const nudgePoint = (id, dx, dy) => {
    setPoints((p) => {
      if (!p[id]) return p;
      return {
        ...p,
        [id]: {
          x: clamp(p[id].x + dx, 0, 100),
          y: clamp(p[id].y + dy, 0, 100),
        },
      };
    });
  };

  /* Re-do the last placed point */
  const undoLast = () => {
    if (activeIdx === 0) return;
    const newIdx = activeIdx - 1;
    const id = POINT_SEQUENCE[newIdx].id;
    setPoints((p) => ({ ...p, [id]: null }));
    setActiveIdx(newIdx);
  };

  /* Calculate from placed points */
  const handleCalculate = () => {
    if (!snapshot) return;
    const { paperA, paperB, heel, toe } = points;
    if (!paperA || !paperB || !heel || !toe) return;

    // Convert percentages to image-space pixels
    const px = (m) => ({ x: (m.x / 100) * snapshot.w, y: (m.y / 100) * snapshot.h });
    const a = px(paperA);
    const b = px(paperB);
    const h = px(heel);
    const t = px(toe);

    const paperPx = Math.hypot(b.x - a.x, b.y - a.y);
    const footPx = Math.hypot(t.x - h.x, t.y - h.y);
    if (paperPx < 5) return;

    const cm = (footPx / paperPx) * A4_SHORT_EDGE_CM;
    const size = cmToSize(cm);
    const conv = convertSizes(size);
    setResult({
      cm: Math.round(cm * 10) / 10,
      size,
      conversions: conv,
    });
    setStage("result");
  };

  const handleAddToCart = () => { setAdded(true); setCartCount((c) => c + 1); };

  const reset = () => {
    setSnapshot(null);
    setResult(null);
    setAdded(false);
    setPoints({ paperA: null, paperB: null, heel: null, toe: null });
    setActiveIdx(0);
    setStage("welcome");
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900 antialiased">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=Inter:wght@300;400;500;600&display=swap');
        :root { font-family: 'Inter', system-ui, sans-serif; }
        .font-display { font-family: 'Fraunces', serif; font-optical-sizing: auto; }
        @keyframes fade-up { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scale-in { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
        @keyframes pulse-soft { 0%, 100% { opacity: 0.5 } 50% { opacity: 1 } }
        @keyframes cart-pop { 0% { transform: scale(0.6) } 60% { transform: scale(1.15) } 100% { transform: scale(1) } }
        @keyframes ping-soft { 75%, 100% { transform: scale(1.8); opacity: 0 } }
        .anim-fade-up { animation: fade-up 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .anim-fade-in { animation: fade-in 0.4s ease both; }
        .anim-scale-in { animation: scale-in 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .anim-ping-soft { animation: ping-soft 1.5s cubic-bezier(0,0,0.2,1) infinite; }
      `}</style>

      <header className="fixed top-0 inset-x-0 z-30 border-b border-neutral-200/70 bg-white/85 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-neutral-900 text-white flex items-center justify-center rounded-sm font-display text-sm tracking-tight">TXY</div>
            <span className="text-[11px] tracking-[0.25em] uppercase text-neutral-500">Fit Studio</span>
          </div>
          <div className="relative">
            <ShoppingCart size={20} strokeWidth={1.5} className="text-neutral-700" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-neutral-900 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-medium"
                style={{ animation: "cart-pop 0.4s ease both" }}>{cartCount}</span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 pt-20 pb-10 min-h-screen flex flex-col">
        {stage === "welcome" && (
          <Welcome onStart={async () => { await lev.requestSensor(); setStage("permissions"); }} />
        )}

        {stage === "permissions" && (
          <PermissionsDialog onAccept={() => setStage("instructions")} onCancel={() => setStage("welcome")} />
        )}

        {stage === "instructions" && (
          <Instructions source={lev.source} cameraError={cameraError}
            onContinue={async () => { await startCamera(); setStage("camera"); }}
            onBack={() => setStage("welcome")} />
        )}

        {stage === "camera" && (
          <CameraStage videoRef={videoRef} lev={lev} onCapture={captureStill}
            onBack={() => { stopCamera(); setStage("instructions"); }} />
        )}

        {stage === "align" && snapshot && (
          <AlignStage
            snapshot={snapshot}
            points={points}
            activeIdx={activeIdx}
            placePoint={placePoint}
            nudgePoint={nudgePoint}
            undoLast={undoLast}
            onCalculate={handleCalculate}
            onRetake={() => { setSnapshot(null); setActiveIdx(0); setPoints({ paperA: null, paperB: null, heel: null, toe: null }); setStage("instructions"); }}
          />
        )}

        {stage === "result" && result && (
          <ResultStage result={result} added={added} onAdd={handleAddToCart} onReset={reset} />
        )}
      </main>
    </div>
  );
}

/* Welcome */
function Welcome({ onStart }) {
  return (
    <div className="flex-1 flex flex-col anim-fade-up justify-center min-h-[80vh] pt-10">
      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-4">A4-Calibrated Sizing</p>
      <h1 className="font-display text-5xl md:text-6xl leading-[1.02] tracking-tight text-neutral-900 mb-6">
        Measure your foot with a <em className="italic font-light">single sheet of A4</em>.
      </h1>
      <p className="text-neutral-600 leading-relaxed mb-10 max-w-md text-base">
        Place an A4 sheet on the floor beside your foot. We use its known size as a precise scale
        reference — no tape, no guesswork.
      </p>
      <div className="space-y-4 mb-12">
        {[
          { num: "1", title: "Grab any A4 sheet", sub: "Standard 21 × 29.7 cm — printer paper, notebook page, anything" },
          { num: "2", title: "Place beside your foot", sub: "Sheet flat on the floor, foot beside it (not on top)" },
          { num: "3", title: "Capture from above", sub: "Hold phone level, both foot and paper in frame" },
          { num: "4", title: "Tap four points", sub: "Two corners of the short edge, then heel and toe" },
        ].map((item) => (
          <div key={item.num} className="flex items-start gap-4">
            <span className="w-9 h-9 rounded-full bg-neutral-900 text-white flex items-center justify-center font-display text-sm flex-shrink-0">
              {item.num}
            </span>
            <div>
              <p className="text-sm text-neutral-900 font-medium">{item.title}</p>
              <p className="text-xs text-neutral-500 mt-0.5">{item.sub}</p>
            </div>
          </div>
        ))}
      </div>
      <button onClick={onStart}
        className="group inline-flex items-center justify-center gap-3 bg-neutral-900 hover:bg-neutral-800 text-white px-8 py-4 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-colors w-full">
        Begin Measurement
        <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
      </button>
    </div>
  );
}

/* Permissions */
function PermissionsDialog({ onAccept, onCancel }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-5 bg-neutral-950/40 backdrop-blur-sm anim-fade-in">
      <div className="bg-white rounded-2xl max-w-sm w-full p-7 shadow-2xl anim-scale-in">
        <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-5">
          <ShieldCheck size={22} strokeWidth={1.5} className="text-neutral-900" />
        </div>
        <h2 className="font-display text-2xl tracking-tight text-neutral-900 mb-3 leading-tight">We respect your privacy.</h2>
        <p className="text-sm text-neutral-600 leading-relaxed mb-6">
          All processing happens on your device. We use your camera for the measurement and motion
          sensors for levelling. Nothing is uploaded.
        </p>
        <ul className="space-y-3 mb-7">
          {[
            { icon: <Camera size={14} strokeWidth={1.5} />, text: "Camera — to capture paper and foot" },
            { icon: <Smartphone size={14} strokeWidth={1.5} />, text: "Motion sensors — for phone levelling" },
            { icon: <ShieldCheck size={14} strokeWidth={1.5} />, text: "On-device only — nothing stored" },
          ].map((item, i) => (
            <li key={i} className="flex items-center gap-3 text-xs text-neutral-700">
              <span className="w-7 h-7 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-700">{item.icon}</span>
              {item.text}
            </li>
          ))}
        </ul>
        <button onClick={onAccept}
          className="w-full bg-neutral-900 hover:bg-neutral-800 text-white py-3.5 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-colors mb-2">
          Got it
        </button>
        <button onClick={onCancel}
          className="w-full py-2 text-[10px] tracking-[0.25em] uppercase text-neutral-500 hover:text-neutral-900 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

/* Instructions */
function Instructions({ source, onContinue, onBack, cameraError }) {
  return (
    <div className="flex-1 flex flex-col anim-fade-up pt-6">
      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-3">Step 01 — Setup</p>
      <h2 className="font-display text-4xl md:text-5xl leading-[1.05] tracking-tight text-neutral-900 mb-3">
        Place an <em className="italic font-light">A4 sheet</em> beside your foot.
      </h2>
      <p className="text-neutral-600 leading-relaxed mb-8 max-w-md">
        Lay the A4 flat on the floor, with the <strong>short edge</strong> running parallel to your
        foot. Stand bare-footed beside it (not on top). Hold your phone parallel to the floor and
        capture from above — both the paper and your foot should be fully in frame.
      </p>
      <div className="relative bg-neutral-50 rounded-2xl aspect-[5/4] mb-6 overflow-hidden border border-neutral-200/70">
        <svg viewBox="0 0 400 320" className="absolute inset-0 w-full h-full p-6">
          {/* Floor grid */}
          {[...Array(8)].map((_, i) => (
            <line key={i} x1="20" y1={40 + i * 35} x2="380" y2={40 + i * 35} stroke="#171717" strokeWidth="0.4" strokeDasharray="2 4" opacity="0.12" />
          ))}
          {/* A4 paper — short edge horizontal, long edge vertical */}
          <rect x="80" y="60" width="100" height="220" rx="2" fill="white" stroke="#171717" strokeWidth="1.5" />
          {/* short-edge highlight (top) */}
          <line x1="80" y1="60" x2="180" y2="60" stroke="#F59E0B" strokeWidth="3" />
          <text x="130" y="48" textAnchor="middle" fontSize="9" fill="#F59E0B" fontFamily="Fraunces, serif" fontStyle="italic">21 cm — short edge</text>
          {/* Foot beside paper, parallel orientation */}
          <path d="M250 80 Q285 85 292 130 Q300 195 292 250 Q286 285 270 290 Q245 294 238 276 Q230 235 234 180 Q238 115 250 80 Z"
            stroke="#171717" strokeWidth="1.5" fill="white" />
          <ellipse cx="248" cy="88" rx="6" ry="4" fill="#171717" opacity="0.18" />
          <ellipse cx="265" cy="86" rx="5" ry="4" fill="#171717" opacity="0.18" />
          <ellipse cx="280" cy="92" rx="4" ry="3" fill="#171717" opacity="0.18" />
          {/* Phone hint */}
          <rect x="155" y="12" width="90" height="22" rx="4" fill="#171717" opacity="0.85" />
          <text x="200" y="27" textAnchor="middle" fontSize="9" fill="white" fontFamily="Fraunces, serif" fontStyle="italic">phone above</text>
        </svg>
        <div className="absolute bottom-3 right-3 text-[9px] tracking-[0.2em] uppercase text-neutral-400">Fig. 01</div>
      </div>
      <div className="flex items-center gap-2 mb-4 text-[11px] text-neutral-500">
        <Info size={13} strokeWidth={1.5} />
        {source === "sensor" ? <span>Motion sensors detected — leveller is live.</span>
          : <span>No motion sensors — using on-screen leveller.</span>}
      </div>
      {cameraError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">{cameraError}</div>
      )}
      <div className="flex items-center gap-3 mt-auto pt-2">
        <button onClick={onBack}
          className="flex items-center justify-center gap-2 border border-neutral-200 text-neutral-700 hover:border-neutral-900 hover:text-neutral-900 py-4 px-5 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-colors">
          <ArrowLeft size={14} />
        </button>
        <button onClick={onContinue}
          className="group flex-1 flex items-center justify-center gap-3 bg-neutral-900 hover:bg-neutral-800 text-white py-4 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-colors">
          Open Camera
          <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
}

/* Camera */
function CameraStage({ videoRef, lev, onCapture, onBack }) {
  const { isLevel, totalTilt, source, simTilt, setSimTilt, bubble } = lev;
  return (
    <div className="flex-1 flex flex-col anim-fade-in pt-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400">Step 03 — Capture</p>
        <button onClick={onBack}
          className="text-[10px] tracking-[0.25em] uppercase text-neutral-500 hover:text-neutral-900 flex items-center gap-1.5">
          <X size={12} /> Cancel
        </button>
      </div>
      <div className="relative bg-black rounded-2xl overflow-hidden aspect-[3/4] flex-1">
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/30 via-transparent to-black/40" />
        <div className="absolute inset-x-8 top-1/4 bottom-1/4 border border-white/30 rounded-3xl pointer-events-none">
          {[
            "top-0 left-0 border-t-2 border-l-2 rounded-tl-3xl",
            "top-0 right-0 border-t-2 border-r-2 rounded-tr-3xl",
            "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-3xl",
            "bottom-0 right-0 border-b-2 border-r-2 rounded-br-3xl",
          ].map((c, i) => (
            <span key={i} className={`absolute w-6 h-6 border-white ${c}`} />
          ))}
        </div>
        <div className="absolute top-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <SpiritLevel isLevel={isLevel} bubble={bubble} />
          <div className={`text-[10px] tracking-[0.25em] uppercase px-3 py-1 rounded-full backdrop-blur-md transition-colors ${
            isLevel ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40" : "bg-white/10 text-white/80 border border-white/20"
          }`}>
            {isLevel ? "Level" : `${totalTilt.toFixed(1)}°`}
          </div>
        </div>
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 text-center px-4">
          <p className={`text-xs font-medium tracking-wide transition-colors ${isLevel ? "text-emerald-300" : "text-white/85"}`}
            style={{ animation: !isLevel ? "pulse-soft 2s ease-in-out infinite" : undefined }}>
            {isLevel ? "Hold steady — both foot and paper in frame" : "Tilt the phone until level"}
          </p>
        </div>
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <button onClick={onCapture} disabled={!isLevel}
            className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
              isLevel ? "bg-white text-neutral-900 scale-100 shadow-2xl shadow-emerald-500/30" : "bg-white/30 text-white/60 scale-95 cursor-not-allowed"
            }`} aria-label="Capture">
            {isLevel && <span className="absolute inset-0 rounded-full border-2 border-emerald-400/60 animate-ping" />}
            <Camera size={26} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      {source === "simulated" && (
        <div className="mt-4 p-4 bg-neutral-50 border border-neutral-200/70 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] tracking-[0.25em] uppercase text-neutral-500">Demo Leveller (no sensor)</span>
            <span className="text-xs text-neutral-700 font-medium tabular-nums">{simTilt.toFixed(1)}°</span>
          </div>
          <input type="range" min="0" max="30" step="0.5" value={simTilt}
            onChange={(e) => setSimTilt(parseFloat(e.target.value))} className="w-full accent-neutral-900" />
          <p className="text-[10px] text-neutral-400 mt-1.5">Drag toward 0° to simulate placing the phone flat.</p>
        </div>
      )}
    </div>
  );
}

function SpiritLevel({ isLevel, bubble }) {
  return (
    <div className="relative w-16 h-16">
      <div className={`absolute inset-0 rounded-full backdrop-blur-md border-2 transition-colors ${
        isLevel ? "border-emerald-400 bg-emerald-400/10" : "border-white/40 bg-white/10"
      }`} />
      <div className="absolute inset-3 rounded-full border border-white/20" />
      <div className="absolute top-1/2 left-1 right-1 h-px bg-white/15" />
      <div className="absolute left-1/2 top-1 bottom-1 w-px bg-white/15" />
      <div className="absolute top-1/2 left-1/2 w-4 h-4 rounded-full transition-colors"
        style={{
          transform: `translate(calc(-50% + ${bubble.x * 18}px), calc(-50% + ${bubble.y * 18}px))`,
          background: isLevel ? "radial-gradient(circle at 30% 30%, #86efac, #22c55e)" : "radial-gradient(circle at 30% 30%, #fde68a, #f59e0b)",
          boxShadow: isLevel ? "0 0 14px rgba(34,197,94,0.7)" : "0 0 8px rgba(245,158,11,0.5)",
          transitionProperty: "background, box-shadow", transitionDuration: "200ms",
        }} />
    </div>
  );
}

/* ============================================================
   Align — TAP TO PLACE markers (mobile-bulletproof)
   ============================================================ */
function AlignStage({ snapshot, points, activeIdx, placePoint, nudgePoint, undoLast, onCalculate, onRetake }) {
  const imgRef = useRef(null);
  const allPlaced = activeIdx >= POINT_SEQUENCE.length;
  const aspectRatio = `${snapshot.w} / ${snapshot.h}`;

  // Visual feedback for last tap location
  const [lastTap, setLastTap] = useState(null);
  useEffect(() => {
    if (!lastTap) return;
    const t = setTimeout(() => setLastTap(null), 800);
    return () => clearTimeout(t);
  }, [lastTap]);

  /* Pointer-down handler attached directly to the IMG element.
     We compute coords from getBoundingClientRect() of the image itself
     (not a wrapper), which is the most reliable cross-browser approach. */
  const handlePointerDown = (e) => {
    if (!imgRef.current || allPlaced) return;
    e.preventDefault();
    const rect = imgRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const cx = clamp(xPct, 0, 100);
    const cy = clamp(yPct, 0, 100);
    setLastTap({ x: cx, y: cy, ts: Date.now() });
    placePoint(cx, cy);
  };

  const currentPoint = POINT_SEQUENCE[activeIdx];

  return (
    <div className="flex-1 flex flex-col anim-fade-up pt-6">
      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-3">Step 03 — Tap to Mark</p>

      {!allPlaced ? (
        <>
          <h2 className="font-display text-3xl md:text-4xl leading-[1.05] tracking-tight text-neutral-900 mb-2">
            Tap on <em className="italic font-light">{currentPoint.label.toLowerCase()}</em>.
          </h2>
          <p className="text-neutral-600 text-sm mb-4">
            Point {activeIdx + 1} of {POINT_SEQUENCE.length}. Pinch to zoom in for precision.
          </p>
        </>
      ) : (
        <>
          <h2 className="font-display text-3xl md:text-4xl leading-[1.05] tracking-tight text-neutral-900 mb-2">
            All four points placed.
          </h2>
          <p className="text-neutral-600 text-sm mb-4">
            Use the <strong>nudge controls</strong> below to fine-tune any point, then calculate.
          </p>
        </>
      )}

      {/* Container with image as the single source of truth for coordinates */}
      <div
        className="relative bg-black rounded-2xl overflow-hidden select-none mb-3 mx-auto w-full max-h-[60vh]"
        style={{ aspectRatio }}
      >
        <img
          ref={imgRef}
          src={snapshot.src}
          alt="captured"
          onPointerDown={handlePointerDown}
          className="absolute inset-0 w-full h-full object-fill block"
          style={{
            touchAction: "none",
            cursor: allPlaced ? "default" : "crosshair",
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
          }}
          draggable={false}
        />

        {/* SVG overlay for connecting lines + last-tap ripple — purely visual, no input */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
          {points.paperA && points.paperB && (
            <line
              x1={points.paperA.x} y1={points.paperA.y}
              x2={points.paperB.x} y2={points.paperB.y}
              stroke="#F59E0B" strokeWidth="0.5" strokeDasharray="1.5 1" vectorEffect="non-scaling-stroke"
            />
          )}
          {points.heel && points.toe && (
            <line
              x1={points.heel.x} y1={points.heel.y}
              x2={points.toe.x} y2={points.toe.y}
              stroke="#fff" strokeWidth="0.5" strokeDasharray="1.5 1" vectorEffect="non-scaling-stroke"
            />
          )}
          {lastTap && (
            <circle
              cx={lastTap.x}
              cy={lastTap.y}
              r="2"
              fill="none"
              stroke="#22c55e"
              strokeWidth="0.5"
              vectorEffect="non-scaling-stroke"
              opacity="0.8"
            >
              <animate attributeName="r" from="0" to="6" dur="0.8s" />
              <animate attributeName="opacity" from="1" to="0" dur="0.8s" />
            </circle>
          )}
        </svg>

        {/* Render placed point markers — pure visual, pointer-events disabled */}
        {POINT_SEQUENCE.map((p) => {
          const pos = points[p.id];
          if (!pos) return null;
          return (
            <div
              key={p.id}
              className="absolute pointer-events-none"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <svg width="40" height="40" className="absolute" style={{ top: -20, left: -20 }}>
                <line x1="20" y1="0" x2="20" y2="14" stroke={p.color} strokeWidth="1.5" opacity="0.7" />
                <line x1="20" y1="26" x2="20" y2="40" stroke={p.color} strokeWidth="1.5" opacity="0.7" />
                <line x1="0" y1="20" x2="14" y2="20" stroke={p.color} strokeWidth="1.5" opacity="0.7" />
                <line x1="26" y1="20" x2="40" y2="20" stroke={p.color} strokeWidth="1.5" opacity="0.7" />
              </svg>
              <div
                className="w-3 h-3 rounded-full border-2 border-white shadow-lg"
                style={{ backgroundColor: p.color }}
              />
              <span
                className="absolute left-5 top-1/2 -translate-y-1/2 text-[9px] tracking-[0.15em] uppercase font-medium whitespace-nowrap px-1.5 py-0.5 rounded-sm"
                style={{
                  backgroundColor: p.color,
                  color: p.color === "#FFFFFF" ? "#000" : "#fff",
                }}
              >
                {p.short}
              </span>
            </div>
          );
        })}

        {/* Top instruction badge — pointer-events disabled so it doesn't block taps */}
        {!allPlaced && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur text-white text-[10px] tracking-[0.2em] uppercase px-3 py-1.5 rounded-full flex items-center gap-2 pointer-events-none">
            <span
              className="w-2 h-2 rounded-full anim-ping-soft"
              style={{ backgroundColor: currentPoint.color }}
            />
            Tap: {currentPoint.short}
          </div>
        )}

        <div className="absolute bottom-3 left-3 text-[10px] tracking-[0.25em] uppercase text-white/80 bg-black/40 px-2 py-1 rounded-sm pointer-events-none">
          A4 · 21 cm short edge
        </div>
      </div>

      {/* Status row + undo */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-1.5">
          {POINT_SEQUENCE.map((p) => {
            const placed = !!points[p.id];
            return (
              <span
                key={p.id}
                className={`w-2 h-2 rounded-full transition-colors ${
                  placed ? "" : "border border-neutral-300"
                }`}
                style={placed ? { backgroundColor: p.color === "#FFFFFF" ? "#171717" : p.color } : {}}
                title={p.short}
              />
            );
          })}
          <span className="text-[10px] tracking-[0.2em] uppercase text-neutral-500 ml-2">
            {Object.values(points).filter(Boolean).length} / 4 placed
          </span>
        </div>
        {activeIdx > 0 && (
          <button
            onClick={undoLast}
            className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            <Undo2 size={11} /> Undo
          </button>
        )}
      </div>

      {/* Nudge controls — shown after all points placed */}
      {allPlaced && (
        <div className="bg-neutral-50 border border-neutral-200/70 rounded-xl p-3 mb-4 anim-fade-up">
          <p className="text-[10px] tracking-[0.25em] uppercase text-neutral-500 mb-2 px-1">
            Fine-tune
          </p>
          <div className="grid grid-cols-2 gap-2">
            {POINT_SEQUENCE.map((p) => (
              <NudgeControl
                key={p.id}
                point={p}
                pos={points[p.id]}
                onNudge={(dx, dy) => nudgePoint(p.id, dx, dy)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mt-auto pt-2">
        <button onClick={onRetake}
          className="flex items-center justify-center gap-2 border border-neutral-200 text-neutral-700 hover:border-neutral-900 hover:text-neutral-900 py-4 px-5 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-colors">
          <RotateCcw size={14} />
        </button>
        <button
          onClick={onCalculate}
          disabled={!allPlaced}
          className={`group flex-1 flex items-center justify-center gap-3 py-4 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-all ${
            allPlaced
              ? "bg-neutral-900 hover:bg-neutral-800 text-white"
              : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
          }`}>
          <Ruler size={14} />
          {allPlaced ? "Calculate Size" : `Place ${4 - activeIdx} more`}
        </button>
      </div>
    </div>
  );
}

function NudgeControl({ point, pos, onNudge }) {
  const STEP = 0.5; // 0.5% per click
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: point.color === "#FFFFFF" ? "#171717" : point.color }}
        />
        <span className="text-[10px] tracking-[0.15em] uppercase text-neutral-700 font-medium">
          {point.short}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-0.5">
        <span />
        <button
          onClick={() => onNudge(0, -STEP)}
          className="h-7 bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 rounded text-xs flex items-center justify-center"
        >
          ↑
        </button>
        <span />
        <button
          onClick={() => onNudge(-STEP, 0)}
          className="h-7 bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 rounded text-xs flex items-center justify-center"
        >
          ←
        </button>
        <span className="h-7 bg-neutral-50 rounded text-[8px] flex items-center justify-center text-neutral-400 tabular-nums">
          {pos ? `${pos.x.toFixed(0)},${pos.y.toFixed(0)}` : ""}
        </span>
        <button
          onClick={() => onNudge(STEP, 0)}
          className="h-7 bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 rounded text-xs flex items-center justify-center"
        >
          →
        </button>
        <span />
        <button
          onClick={() => onNudge(0, STEP)}
          className="h-7 bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 rounded text-xs flex items-center justify-center"
        >
          ↓
        </button>
        <span />
      </div>
    </div>
  );
}

/* Result */
function ResultStage({ result, added, onAdd, onReset }) {
  return (
    <div className="flex-1 flex flex-col anim-fade-up pt-6">
      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-3">Your Size</p>
      <h2 className="font-display text-4xl md:text-5xl leading-[1.05] tracking-tight text-neutral-900 mb-2">
        Measured with <em className="italic font-light">precision</em>.
      </h2>
      <div className="flex items-center gap-2 mb-8">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="text-xs text-emerald-600 font-medium">Calibrated against A4 — high confidence</span>
      </div>
      <div className="relative bg-neutral-900 text-white rounded-2xl p-8 mb-4 overflow-hidden">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5 blur-3xl" />
        <div className="relative">
          <p className="text-[10px] tracking-[0.3em] uppercase text-white/50 mb-2">Ten × You — Recommended</p>
          <div className="flex items-baseline gap-3 mb-4">
            <span className="font-display text-[10rem] leading-none tracking-tighter">{result.size}</span>
            <span className="font-display italic text-xl text-white/60">your TXY size</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/70">
            <Ruler size={14} className="text-amber-400" />
            <span>Foot length: <span className="font-medium text-white">{result.cm.toFixed(1)} cm</span></span>
          </div>
          <p className="text-xs text-white/50 mt-2">
            Calibrated against A4 short edge (21.0 cm)
          </p>
        </div>
      </div>
      <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 mb-6">
        <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-4">International equivalents</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "UK", value: result.conversions.uk },
            { label: "US", value: result.conversions.us },
            { label: "EU", value: result.conversions.eu },
          ].map((row) => (
            <div key={row.label} className="text-center py-3 border-r border-neutral-200/80 last:border-r-0">
              <p className="text-[10px] tracking-[0.25em] uppercase text-neutral-400 mb-1">{row.label}</p>
              <p className="font-display text-3xl text-neutral-900">{row.value}</p>
            </div>
          ))}
        </div>
      </div>
      <button onClick={onAdd} disabled={added}
        className={`w-full py-4 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-all flex items-center justify-center gap-3 mb-3 ${
          added ? "bg-emerald-600 text-white cursor-default" : "bg-neutral-900 hover:bg-neutral-800 text-white"
        }`}>
        {added ? (
          <><Check size={16} strokeWidth={2} />Added to Cart</>
        ) : (
          <><ShoppingCart size={16} strokeWidth={1.5} />Add to Cart · Ten × You Size {result.size}</>
        )}
      </button>
      <button onClick={onReset}
        className="w-full py-3 text-xs tracking-[0.25em] uppercase text-neutral-500 hover:text-neutral-900 transition-colors">
        Measure again
      </button>
      <p className="text-[10px] text-neutral-400 text-center mt-4 leading-relaxed">
        Sizes round up between half-sizes for a comfortable fit.
      </p>
    </div>
  );
}
