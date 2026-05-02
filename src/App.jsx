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
} from "lucide-react";

/* ============================================================
   Ten × You — Coin-Reference Sizer (v5)
   Real measurement using Indian coin as scale reference.
   ============================================================ */

const LEVEL_THRESHOLD_DEG = 5;

const COINS = [
  { id: "r1", label: "₹1", diameter: 21.93, note: "Current (steel, small)", color: "#C8C8CC", accent: "#888" },
  { id: "r2", label: "₹2", diameter: 23.0, note: "Current (steel)", color: "#C8C8CC", accent: "#888" },
  { id: "r5", label: "₹5", diameter: 23.0, note: "Current (golden)", color: "#D4A85C", accent: "#8a6a2e" },
  { id: "r10", label: "₹10", diameter: 27.0, note: "Bimetallic (two-tone)", color: "#C8C8CC", accent: "#D4A85C", bimetallic: true },
  { id: "r1old", label: "₹1 (older)", diameter: 25.0, note: "Pre-2003, larger", color: "#B8B8BC", accent: "#666" },
];

const SIZE_CHART = [
  { cm: 22.3, size: 3 }, { cm: 22.7, size: 4 }, { cm: 23.1, size: 4 },
  { cm: 23.55, size: 5 }, { cm: 24.0, size: 5 }, { cm: 24.4, size: 6 },
  { cm: 24.8, size: 6 }, { cm: 25.25, size: 7 }, { cm: 25.7, size: 7 },
  { cm: 26.1, size: 8 }, { cm: 26.5, size: 8 }, { cm: 26.9, size: 9 },
  { cm: 27.3, size: 9 }, { cm: 27.75, size: 10 }, { cm: 28.2, size: 10 },
  { cm: 28.6, size: 11 }, { cm: 29.0, size: 11 }, { cm: 29.45, size: 12 },
  { cm: 29.9, size: 12 },
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

/* useLeveller hook */
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

/* Draggable marker */
function DraggableMarker({ x, y, onMove, label, color, containerRef }) {
  const dragging = useRef(false);
  const handleStart = (e) => { e.preventDefault(); e.stopPropagation(); dragging.current = true; };

  useEffect(() => {
    const handleMove = (e) => {
      if (!dragging.current || !containerRef.current) return;
      e.preventDefault?.();
      const rect = containerRef.current.getBoundingClientRect();
      const point = e.touches ? e.touches[0] : e;
      const nx = ((point.clientX - rect.left) / rect.width) * 100;
      const ny = ((point.clientY - rect.top) / rect.height) * 100;
      onMove(clamp(nx, 0, 100), clamp(ny, 0, 100));
    };
    const handleEnd = () => (dragging.current = false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchend", handleEnd);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [onMove, containerRef]);

  return (
    <div onMouseDown={handleStart} onTouchStart={handleStart}
      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing touch-none"
      style={{ left: `${x}%`, top: `${y}%` }}>
      <div className="relative">
        <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ backgroundColor: color }} />
        <div className="relative w-7 h-7 rounded-full border-[3px] border-white shadow-lg" style={{ backgroundColor: color }} />
        <div className="absolute top-1/2 left-1/2 w-1 h-1 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full" />
        <span className="absolute left-9 top-1/2 -translate-y-1/2 text-[10px] tracking-[0.15em] uppercase font-medium text-white whitespace-nowrap px-2 py-0.5 rounded-sm"
          style={{ backgroundColor: color }}>{label}</span>
      </div>
    </div>
  );
}

/* App */
export default function App() {
  const [stage, setStage] = useState("welcome");
  const [coin, setCoin] = useState(null);
  const [stream, setStream] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [added, setAdded] = useState(false);
  const [result, setResult] = useState(null);
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const lev = useLeveller();

  const [markers, setMarkers] = useState({
    coinA: { x: 25, y: 70 },
    coinB: { x: 40, y: 70 },
    heel: { x: 60, y: 82 },
    toe: { x: 60, y: 22 },
  });

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
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d").drawImage(v, 0, 0);
    setSnapshot(canvas.toDataURL("image/jpeg", 0.92));
    stopCamera();
    setStage("align");
  };

  const calculate = () => {
    if (!overlayRef.current || !coin) return null;
    const rect = overlayRef.current.getBoundingClientRect();
    const px = (m) => ({ x: (m.x / 100) * rect.width, y: (m.y / 100) * rect.height });
    const a = px(markers.coinA);
    const b = px(markers.coinB);
    const h = px(markers.heel);
    const t = px(markers.toe);
    const coinPx = Math.hypot(b.x - a.x, b.y - a.y);
    const footPx = Math.hypot(t.x - h.x, t.y - h.y);
    if (coinPx < 5) return null;
    const cm = (footPx / coinPx) * (coin.diameter / 10);
    return Math.round(cm * 10) / 10;
  };

  const handleCalculate = () => {
    const cm = calculate();
    if (cm == null) return;
    const size = cmToSize(cm);
    const conv = convertSizes(size);
    const confidence = coin.diameter >= 25 ? "high" : coin.diameter >= 23 ? "medium" : "fair";
    setResult({ cm, size, conversions: conv, confidence, coin });
    setStage("result");
  };

  const handleAddToCart = () => { setAdded(true); setCartCount((c) => c + 1); };

  const reset = () => {
    setCoin(null); setSnapshot(null); setResult(null); setAdded(false);
    setMarkers({
      coinA: { x: 25, y: 70 }, coinB: { x: 40, y: 70 },
      heel: { x: 60, y: 82 }, toe: { x: 60, y: 22 },
    });
    setStage("welcome");
  };

  const updateMarker = (key) => (x, y) => setMarkers((p) => ({ ...p, [key]: { x, y } }));

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
        .anim-fade-up { animation: fade-up 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .anim-fade-in { animation: fade-in 0.4s ease both; }
        .anim-scale-in { animation: scale-in 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
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
        {stage === "welcome" && <Welcome onStart={() => setStage("coin")} />}

        {stage === "coin" && (
          <CoinPicker value={coin} onChange={setCoin}
            onNext={async () => { await lev.requestSensor(); setStage("permissions"); }}
            onBack={() => setStage("welcome")} />
        )}

        {stage === "permissions" && (
          <PermissionsDialog onAccept={() => setStage("instructions")} onCancel={() => setStage("coin")} />
        )}

        {stage === "instructions" && (
          <Instructions coin={coin} source={lev.source} cameraError={cameraError}
            onContinue={async () => { await startCamera(); setStage("camera"); }}
            onBack={() => setStage("coin")} />
        )}

        {stage === "camera" && (
          <CameraStage videoRef={videoRef} lev={lev} onCapture={captureStill}
            onBack={() => { stopCamera(); setStage("instructions"); }} />
        )}

        {stage === "align" && snapshot && coin && (
          <AlignStage snapshot={snapshot} coin={coin} markers={markers} updateMarker={updateMarker}
            overlayRef={overlayRef} onCalculate={handleCalculate}
            onRetake={() => { setSnapshot(null); setStage("instructions"); }} />
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
      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-4">Coin-Calibrated Sizing</p>
      <h1 className="font-display text-5xl md:text-6xl leading-[1.02] tracking-tight text-neutral-900 mb-6">
        Measure your foot with a <em className="italic font-light">single coin</em>.
      </h1>
      <p className="text-neutral-600 leading-relaxed mb-10 max-w-md text-base">
        Place any rupee coin next to your foot. We use it as a known scale to measure
        your foot length precisely — no tape, no guesswork.
      </p>
      <div className="space-y-4 mb-12">
        {[
          { num: "1", title: "Pick your coin", sub: "₹1, ₹2, ₹5, ₹10, or older ₹1" },
          { num: "2", title: "Place beside your foot", sub: "Hold phone level, capture from above" },
          { num: "3", title: "Tap to align", sub: "Mark coin edges and your heel + toe" },
          { num: "4", title: "Get your size", sub: "Real measurement, ready to shop" },
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

/* Coin Picker */
function CoinSwatch({ coin }) {
  return (
    <svg viewBox="0 0 64 64" className="w-12 h-12">
      <defs>
        <radialGradient id={`g-${coin.id}`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor={coin.color} stopOpacity="1" />
          <stop offset="100%" stopColor={coin.accent} stopOpacity="1" />
        </radialGradient>
      </defs>
      {coin.bimetallic ? (
        <>
          <circle cx="32" cy="32" r="28" fill={coin.color} stroke={coin.accent} strokeWidth="1" />
          <circle cx="32" cy="32" r="17" fill={coin.accent} opacity="0.85" />
          <text x="32" y="38" textAnchor="middle" fontSize="14" fontWeight="600" fill="#1a1a1a" fontFamily="Inter, sans-serif">
            {coin.label.replace("₹", "")}
          </text>
        </>
      ) : (
        <>
          <circle cx="32" cy="32" r="28" fill={`url(#g-${coin.id})`} stroke={coin.accent} strokeWidth="1" />
          <text x="32" y="40" textAnchor="middle" fontSize="20" fontWeight="500" fill="#1a1a1a" fontFamily="Inter, sans-serif">
            {coin.label}
          </text>
        </>
      )}
    </svg>
  );
}

function CoinPicker({ value, onChange, onNext, onBack }) {
  return (
    <div className="flex-1 flex flex-col anim-fade-up pt-6">
      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-3">Step 01 — Reference</p>
      <h2 className="font-display text-4xl md:text-5xl leading-[1.05] tracking-tight text-neutral-900 mb-3">
        Which coin do you have?
      </h2>
      <p className="text-neutral-600 leading-relaxed mb-8 max-w-md">
        Pick any Indian coin you have on hand. We'll use its known size as a reference.
      </p>
      <div className="space-y-3 mb-8">
        {COINS.map((c) => (
          <button key={c.id} onClick={() => onChange(c)}
            className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-4 ${
              value?.id === c.id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 hover:border-neutral-400"
            }`}>
            <div className={`w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 ${
              value?.id === c.id ? "bg-white/10" : "bg-neutral-50"
            }`}>
              <CoinSwatch coin={c} />
            </div>
            <div className="flex-1">
              <p className="font-display text-2xl">{c.label}</p>
              <p className={`text-xs mt-0.5 ${value?.id === c.id ? "text-white/60" : "text-neutral-500"}`}>
                {c.note} · {c.diameter} mm
              </p>
            </div>
            {value?.id === c.id && <Check size={18} strokeWidth={2} />}
          </button>
        ))}
      </div>
      <div className="flex items-start gap-2 text-xs text-neutral-500 leading-relaxed mb-2">
        <Info size={13} strokeWidth={1.5} className="flex-shrink-0 mt-0.5" />
        <span>Larger coins (₹10, older ₹1) give the most accurate measurement. Use what you have.</span>
      </div>
      <div className="flex items-center gap-3 mt-auto pt-8">
        <button onClick={onBack}
          className="flex items-center justify-center gap-2 border border-neutral-200 text-neutral-700 hover:border-neutral-900 hover:text-neutral-900 py-4 px-5 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-colors">
          <ArrowLeft size={14} />
        </button>
        <button onClick={onNext} disabled={!value}
          className={`group flex-1 flex items-center justify-center gap-3 py-4 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-all ${
            !value ? "bg-neutral-200 text-neutral-400 cursor-not-allowed" : "bg-neutral-900 hover:bg-neutral-800 text-white"
          }`}>
          Continue
          <ArrowRight size={14} className={!value ? "" : "group-hover:translate-x-0.5 transition-transform"} />
        </button>
      </div>
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
            { icon: <Camera size={14} strokeWidth={1.5} />, text: "Camera — to capture coin and foot" },
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
function Instructions({ coin, source, onContinue, onBack, cameraError }) {
  return (
    <div className="flex-1 flex flex-col anim-fade-up pt-6">
      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-3">Step 02 — Setup</p>
      <h2 className="font-display text-4xl md:text-5xl leading-[1.05] tracking-tight text-neutral-900 mb-3">
        Place your <em className="italic font-light">{coin.label}</em> next to your foot.
      </h2>
      <p className="text-neutral-600 leading-relaxed mb-8 max-w-md">
        Stand with bare foot on a flat surface. Set the coin flat on the floor, beside your foot.
        Hold your phone parallel to the floor and capture from directly above.
      </p>
      <div className="relative bg-neutral-50 rounded-2xl aspect-[5/4] mb-6 overflow-hidden border border-neutral-200/70">
        <svg viewBox="0 0 400 320" className="absolute inset-0 w-full h-full p-6">
          {[...Array(8)].map((_, i) => (
            <line key={i} x1="20" y1={40 + i * 35} x2="380" y2={40 + i * 35} stroke="#171717" strokeWidth="0.4" strokeDasharray="2 4" opacity="0.12" />
          ))}
          <path d="M210 60 Q245 65 252 110 Q260 175 252 230 Q246 268 230 272 Q205 276 198 258 Q190 220 194 165 Q198 95 210 60 Z" stroke="#171717" strokeWidth="1.5" fill="white" />
          <ellipse cx="208" cy="68" rx="6" ry="4" fill="#171717" opacity="0.18" />
          <ellipse cx="225" cy="66" rx="5" ry="4" fill="#171717" opacity="0.18" />
          <ellipse cx="240" cy="72" rx="4" ry="3" fill="#171717" opacity="0.18" />
          <g transform="translate(120 200)">
            <circle cx="0" cy="0" r="22" fill="#D4A85C" stroke="#8a6a2e" strokeWidth="1.2" />
            <circle cx="0" cy="0" r="22" fill="url(#coinGrad)" />
            <text x="0" y="6" textAnchor="middle" fontSize="14" fontWeight="500" fill="#1a1a1a">₹</text>
          </g>
          <defs>
            <radialGradient id="coinGrad" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#E8C77A" />
              <stop offset="100%" stopColor="#8a6a2e" />
            </radialGradient>
          </defs>
          <rect x="160" y="12" width="80" height="22" rx="4" fill="#171717" opacity="0.85" />
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
            {isLevel ? "Hold steady — both foot and coin in frame" : "Tilt the phone until level"}
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

/* Align */
function AlignStage({ snapshot, coin, markers, updateMarker, overlayRef, onCalculate, onRetake }) {
  return (
    <div className="flex-1 flex flex-col anim-fade-up pt-6">
      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-3">Step 04 — Align</p>
      <h2 className="font-display text-3xl md:text-4xl leading-[1.05] tracking-tight text-neutral-900 mb-3">
        Place your four markers.
      </h2>
      <p className="text-neutral-600 leading-relaxed mb-5 text-sm">
        Drag the <span className="text-amber-600 font-medium">amber points</span> to opposite edges of your{" "}
        {coin.label} coin, and the <span className="text-neutral-900 font-medium">dark points</span> to your heel and the tip of your longest toe.
      </p>
      <div ref={overlayRef} className="relative bg-black rounded-2xl overflow-hidden aspect-[3/4] select-none mb-4">
        <img src={snapshot} alt="captured" className="absolute inset-0 w-full h-full object-cover" />
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <line x1={`${markers.coinA.x}%`} y1={`${markers.coinA.y}%`} x2={`${markers.coinB.x}%`} y2={`${markers.coinB.y}%`}
            stroke="#F59E0B" strokeWidth="2" strokeDasharray="6 4" />
          <line x1={`${markers.heel.x}%`} y1={`${markers.heel.y}%`} x2={`${markers.toe.x}%`} y2={`${markers.toe.y}%`}
            stroke="#fff" strokeWidth="2" strokeDasharray="6 4" />
        </svg>
        <DraggableMarker x={markers.coinA.x} y={markers.coinA.y} onMove={updateMarker("coinA")} label="Coin ◀" color="#F59E0B" containerRef={overlayRef} />
        <DraggableMarker x={markers.coinB.x} y={markers.coinB.y} onMove={updateMarker("coinB")} label="Coin ▶" color="#F59E0B" containerRef={overlayRef} />
        <DraggableMarker x={markers.heel.x} y={markers.heel.y} onMove={updateMarker("heel")} label="Heel" color="#171717" containerRef={overlayRef} />
        <DraggableMarker x={markers.toe.x} y={markers.toe.y} onMove={updateMarker("toe")} label="Toe" color="#171717" containerRef={overlayRef} />
        <div className="absolute top-3 left-3 text-[10px] tracking-[0.25em] uppercase text-white/80 bg-black/40 px-2 py-1 rounded-sm">
          {coin.label} · {coin.diameter} mm
        </div>
      </div>
      <div className="bg-neutral-50 border border-neutral-200/70 rounded-xl p-4 mb-4">
        <div className="flex items-start gap-3 mb-3">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0 mt-1" />
          <div>
            <p className="text-xs text-neutral-900 font-medium">Coin diameter</p>
            <p className="text-[11px] text-neutral-500">Snap the amber points to the two extreme edges of your coin.</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-neutral-900 flex-shrink-0 mt-1" />
          <div>
            <p className="text-xs text-neutral-900 font-medium">Foot endpoints</p>
            <p className="text-[11px] text-neutral-500">Place the dark points at the back of your heel and the tip of your longest toe.</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-auto pt-2">
        <button onClick={onRetake}
          className="flex items-center justify-center gap-2 border border-neutral-200 text-neutral-700 hover:border-neutral-900 hover:text-neutral-900 py-4 px-5 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-colors">
          <RotateCcw size={14} />
        </button>
        <button onClick={onCalculate}
          className="group flex-1 flex items-center justify-center gap-3 bg-neutral-900 hover:bg-neutral-800 text-white py-4 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-colors">
          <Ruler size={14} />
          Calculate Size
        </button>
      </div>
    </div>
  );
}

/* Result */
function ResultStage({ result, added, onAdd, onReset }) {
  const confidenceLabel = {
    high: { text: "High confidence", color: "text-emerald-600", dot: "bg-emerald-500" },
    medium: { text: "Good confidence", color: "text-amber-600", dot: "bg-amber-500" },
    fair: { text: "Fair — try larger coin for more precision", color: "text-neutral-600", dot: "bg-neutral-400" },
  }[result.confidence];

  return (
    <div className="flex-1 flex flex-col anim-fade-up pt-6">
      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-3">Your Size</p>
      <h2 className="font-display text-4xl md:text-5xl leading-[1.05] tracking-tight text-neutral-900 mb-2">
        Measured with <em className="italic font-light">precision</em>.
      </h2>
      <div className="flex items-center gap-2 mb-8">
        <span className={`w-1.5 h-1.5 rounded-full ${confidenceLabel.dot}`} />
        <span className={`text-xs ${confidenceLabel.color} font-medium`}>{confidenceLabel.text}</span>
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
            Calibrated against {result.coin.label} ({result.coin.diameter} mm)
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
