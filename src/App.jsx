import { useState, useEffect, useRef, useCallback } from "react";
import {
  Camera,
  ShoppingCart,
  ShieldCheck,
  Check,
  X,
  Smartphone,
  Loader2,
  Sparkles,
  Info,
} from "lucide-react";

/* ============================================================
   Ten × You — Zero-Reference Foot Sizer (Demo)
   Single-file React component.
   - Sensor-first leveller (DeviceOrientationEvent)
   - Graceful desktop fallback (manual tilt slider)
   - Standard ±5° threshold
   - Hard-coded demo result: TXY 8 / UK 8 / US 8.5 / EU 42 / 26.5 cm
   ============================================================ */

const LEVEL_THRESHOLD_DEG = 5;
const DEMO_RESULT = {
  txy: 8,
  uk: 8,
  us: 8.5,
  eu: 42,
  cm: 26.5,
};

/* --- Tiny helpers --- */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/* ============================================================
   Hook: useLeveller
   Returns { beta, gamma, totalTilt, isLevel, source, requestSensor, simulate }
   - source: 'sensor' | 'simulated' | 'idle'
   - In simulated mode, totalTilt is driven by setSimTilt(0..30)
   ============================================================ */
function useLeveller() {
  const [beta, setBeta] = useState(0); // front/back
  const [gamma, setGamma] = useState(0); // left/right
  const [source, setSource] = useState("idle"); // 'sensor' | 'simulated' | 'idle'
  const [simTilt, setSimTilt] = useState(12); // start tilted, user dials to 0

  const handler = useCallback((e) => {
    setBeta(e.beta ?? 0);
    setGamma(e.gamma ?? 0);
  }, []);

  const requestSensor = useCallback(async () => {
    // iOS 13+ requires explicit permission
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      try {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result !== "granted") {
          setSource("simulated");
          return "simulated";
        }
      } catch {
        setSource("simulated");
        return "simulated";
      }
    }

    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
      setSource("simulated");
      return "simulated";
    }

    // Probe for actual sensor data — if nothing fires within ~800ms, fall back.
    return new Promise((resolve) => {
      let received = false;
      const probe = (e) => {
        if (e.beta !== null || e.gamma !== null) {
          received = true;
          window.removeEventListener("deviceorientation", probe);
          window.addEventListener("deviceorientation", handler);
          setSource("sensor");
          resolve("sensor");
        }
      };
      window.addEventListener("deviceorientation", probe);
      setTimeout(() => {
        if (!received) {
          window.removeEventListener("deviceorientation", probe);
          setSource("simulated");
          resolve("simulated");
        }
      }, 800);
    });
  }, [handler]);

  useEffect(() => {
    return () => window.removeEventListener("deviceorientation", handler);
  }, [handler]);

  const sensorTilt = Math.hypot(beta, gamma);
  const totalTilt = source === "simulated" ? simTilt : sensorTilt;
  const isLevel = source !== "idle" && totalTilt <= LEVEL_THRESHOLD_DEG;

  // For the bubble position
  const bubble =
    source === "simulated"
      ? {
          // simulate a drift along an arbitrary axis so the bubble moves visibly
          x: Math.sin(Date.now() / 600) * (simTilt / 30),
          y: Math.cos(Date.now() / 600) * (simTilt / 30),
        }
      : {
          x: clamp((gamma ?? 0) / 30, -1, 1),
          y: clamp((beta ?? 0) / 30, -1, 1),
        };

  return {
    beta,
    gamma,
    totalTilt,
    isLevel,
    source,
    requestSensor,
    simTilt,
    setSimTilt,
    bubble,
  };
}

/* ============================================================
   Main Component
   ============================================================ */
export default function App() {
  // 'permissions' | 'instructions' | 'camera' | 'measuring' | 'result'
  const [stage, setStage] = useState("permissions");
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [added, setAdded] = useState(false);

  const videoRef = useRef(null);
  const lev = useLeveller();

  /* --- Camera lifecycle --- */
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      setStream(s);
    } catch (e) {
      setCameraError(
        e?.name === "NotAllowedError"
          ? "Camera permission denied. Enable it in your browser settings to continue."
          : "Couldn't access the camera."
      );
    }
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream, stage]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  }, [stream]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  /* --- Stage transitions --- */
  const handleAcceptPermissions = async () => {
    await lev.requestSensor();
    setStage("instructions");
  };

  const goToCamera = async () => {
    await startCamera();
    setStage("camera");
  };

  const handleMeasure = () => {
    if (!lev.isLevel) return;
    setStage("measuring");
    setTimeout(() => {
      stopCamera();
      setStage("result");
    }, 2600);
  };

  const handleAddToCart = () => {
    setAdded(true);
    setCartCount((c) => c + 1);
  };

  const reset = () => {
    setAdded(false);
    setStage("instructions");
  };

  /* ============================================================
     RENDER
     ============================================================ */
  return (
    <div className="min-h-screen bg-white text-neutral-900 antialiased">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=Inter:wght@300;400;500;600&display=swap');
        :root { font-family: 'Inter', system-ui, sans-serif; }
        .font-display { font-family: 'Fraunces', serif; font-optical-sizing: auto; }
        @keyframes fade-up { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scale-in { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
        @keyframes scan { 0% { transform: translateY(-100%) } 100% { transform: translateY(100%) } }
        @keyframes pulse-soft { 0%, 100% { opacity: 0.5 } 50% { opacity: 1 } }
        @keyframes cart-pop { 0% { transform: scale(0.6) } 60% { transform: scale(1.15) } 100% { transform: scale(1) } }
        .anim-fade-up { animation: fade-up 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .anim-fade-in { animation: fade-in 0.5s ease both; }
        .anim-scale-in { animation: scale-in 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .anim-scan { animation: scan 2s ease-in-out infinite alternate; }
      `}</style>

      {/* ---------- Top Bar ---------- */}
      <header className="fixed top-0 inset-x-0 z-30 border-b border-neutral-200/70 bg-white/80 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-neutral-900 text-white flex items-center justify-center rounded-sm font-display text-sm tracking-tight">
              TXY
            </div>
            <span className="text-[11px] tracking-[0.25em] uppercase text-neutral-500">
              Fit Studio
            </span>
          </div>

          {/* Cart indicator */}
          <div className="relative">
            <ShoppingCart size={20} strokeWidth={1.5} className="text-neutral-700" />
            {cartCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 bg-neutral-900 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-medium"
                style={{ animation: "cart-pop 0.4s ease both" }}
              >
                {cartCount}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 pt-20 pb-10 min-h-screen flex flex-col">
        {/* ============ STAGE: PERMISSIONS ============ */}
        {stage === "permissions" && (
          <PermissionsDialog onAccept={handleAcceptPermissions} />
        )}

        {/* ============ STAGE: INSTRUCTIONS ============ */}
        {stage === "instructions" && (
          <Instructions
            source={lev.source}
            onContinue={goToCamera}
            cameraError={cameraError}
          />
        )}

        {/* ============ STAGE: CAMERA + LEVELLER ============ */}
        {stage === "camera" && (
          <CameraStage
            videoRef={videoRef}
            lev={lev}
            onMeasure={handleMeasure}
            onBack={() => {
              stopCamera();
              setStage("instructions");
            }}
          />
        )}

        {/* ============ STAGE: MEASURING ============ */}
        {stage === "measuring" && <MeasuringStage />}

        {/* ============ STAGE: RESULT ============ */}
        {stage === "result" && (
          <ResultStage
            added={added}
            onAdd={handleAddToCart}
            onRetry={reset}
          />
        )}
      </main>
    </div>
  );
}

/* ============================================================
   STAGE: Permissions Dialog
   ============================================================ */
function PermissionsDialog({ onAccept }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-5 bg-neutral-950/40 backdrop-blur-sm anim-fade-in">
      <div className="bg-white rounded-2xl max-w-sm w-full p-7 shadow-2xl anim-scale-in">
        <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-5">
          <ShieldCheck size={22} strokeWidth={1.5} className="text-neutral-900" />
        </div>
        <h2 className="font-display text-2xl tracking-tight text-neutral-900 mb-3 leading-tight">
          We respect your privacy.
        </h2>
        <p className="text-sm text-neutral-600 leading-relaxed mb-6">
          All processing happens on your device. We use your camera for positioning and motion
          sensors for levelling. Nothing is uploaded.
        </p>

        <ul className="space-y-3 mb-7">
          {[
            { icon: <Camera size={14} strokeWidth={1.5} />, text: "Camera — for foot positioning" },
            {
              icon: <Smartphone size={14} strokeWidth={1.5} />,
              text: "Motion sensors — for phone levelling",
            },
            { icon: <ShieldCheck size={14} strokeWidth={1.5} />, text: "On-device only — nothing stored" },
          ].map((item, i) => (
            <li key={i} className="flex items-center gap-3 text-xs text-neutral-700">
              <span className="w-7 h-7 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-700">
                {item.icon}
              </span>
              {item.text}
            </li>
          ))}
        </ul>

        <button
          onClick={onAccept}
          className="w-full bg-neutral-900 hover:bg-neutral-800 text-white py-3.5 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   STAGE: Instructions
   ============================================================ */
function Instructions({ source, onContinue, cameraError }) {
  return (
    <div className="flex-1 flex flex-col anim-fade-up pt-6">
      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-4">
        Step 01 — Setup
      </p>
      <h1 className="font-display text-4xl md:text-5xl leading-[1.05] tracking-tight text-neutral-900 mb-5">
        Hold your phone <em className="italic font-light">parallel</em> to the floor.
      </h1>
      <p className="text-neutral-600 leading-relaxed mb-10 max-w-md">
        When the level turns green, tap <span className="font-medium text-neutral-900">Measure</span>.
        Stand naturally with your foot in the frame.
      </p>

      {/* Diagram */}
      <div className="relative bg-neutral-50 rounded-2xl aspect-[5/4] mb-8 overflow-hidden border border-neutral-200/70">
        <svg viewBox="0 0 400 320" className="absolute inset-0 w-full h-full p-6">
          {/* floor lines */}
          {[...Array(6)].map((_, i) => (
            <line
              key={i}
              x1="20"
              y1={250 + i * 12}
              x2="380"
              y2={250 + i * 12}
              stroke="#171717"
              strokeWidth="0.4"
              opacity={0.06 + i * 0.02}
            />
          ))}
          {/* phone */}
          <g transform="translate(140 70)">
            <rect width="120" height="70" rx="10" fill="#171717" />
            <rect x="6" y="6" width="108" height="58" rx="6" fill="#404040" />
            <circle cx="60" cy="35" r="5" fill="#22c55e" opacity="0.9" />
          </g>
          {/* level dotted line */}
          <line
            x1="40"
            y1="105"
            x2="360"
            y2="105"
            stroke="#171717"
            strokeWidth="0.8"
            strokeDasharray="3 4"
            opacity="0.4"
          />
          {/* arrows showing parallel */}
          <text
            x="200"
            y="195"
            textAnchor="middle"
            fontSize="10"
            fill="#737373"
            fontFamily="Fraunces, serif"
            fontStyle="italic"
          >
            ‹ parallel ›
          </text>
          {/* foot silhouette */}
          <ellipse cx="200" cy="275" rx="36" ry="10" fill="#171717" opacity="0.15" />
        </svg>
      </div>

      {/* Sensor source indicator */}
      <div className="flex items-center gap-2 mb-4 text-[11px] text-neutral-500">
        <Info size={13} strokeWidth={1.5} />
        {source === "sensor" ? (
          <span>Motion sensors detected.</span>
        ) : (
          <span>No motion sensors — using on-screen leveller for the demo.</span>
        )}
      </div>

      {cameraError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
          {cameraError}
        </div>
      )}

      <button
        onClick={onContinue}
        className="bg-neutral-900 hover:bg-neutral-800 text-white py-4 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-colors"
      >
        Continue
      </button>
    </div>
  );
}

/* ============================================================
   STAGE: Camera + Leveller
   ============================================================ */
function CameraStage({ videoRef, lev, onMeasure, onBack }) {
  const { isLevel, totalTilt, source, simTilt, setSimTilt, bubble } = lev;

  return (
    <div className="flex-1 flex flex-col anim-fade-in pt-2">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400">
          Step 02 — Capture
        </p>
        <button
          onClick={onBack}
          className="text-[10px] tracking-[0.25em] uppercase text-neutral-500 hover:text-neutral-900 flex items-center gap-1.5"
        >
          <X size={12} /> Cancel
        </button>
      </div>

      {/* Camera viewport */}
      <div className="relative bg-black rounded-2xl overflow-hidden aspect-[3/4] flex-1">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Vignette */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/30 via-transparent to-black/40" />

        {/* Foot framing guide */}
        <div className="absolute inset-x-8 top-1/4 bottom-1/4 border border-white/30 rounded-3xl pointer-events-none">
          {/* corner accents */}
          {[
            "top-0 left-0 border-t-2 border-l-2 rounded-tl-3xl",
            "top-0 right-0 border-t-2 border-r-2 rounded-tr-3xl",
            "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-3xl",
            "bottom-0 right-0 border-b-2 border-r-2 rounded-br-3xl",
          ].map((c, i) => (
            <span key={i} className={`absolute w-6 h-6 border-white ${c}`} />
          ))}
        </div>

        {/* Spirit Level — top center */}
        <div className="absolute top-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <SpiritLevel isLevel={isLevel} bubble={bubble} />
          <div
            className={`text-[10px] tracking-[0.25em] uppercase px-3 py-1 rounded-full backdrop-blur-md transition-colors ${
              isLevel
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
                : "bg-white/10 text-white/80 border border-white/20"
            }`}
          >
            {isLevel ? "Level" : `${totalTilt.toFixed(1)}°`}
          </div>
        </div>

        {/* Status caption */}
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 text-center">
          <p
            className={`text-xs font-medium tracking-wide transition-colors ${
              isLevel ? "text-emerald-300" : "text-white/85"
            }`}
            style={{ animation: !isLevel ? "pulse-soft 2s ease-in-out infinite" : undefined }}
          >
            {isLevel ? "Hold steady — ready to measure" : "Tilt the phone until level"}
          </p>
        </div>

        {/* Measure button */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <button
            onClick={onMeasure}
            disabled={!isLevel}
            className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
              isLevel
                ? "bg-white text-neutral-900 scale-100 shadow-2xl shadow-emerald-500/30"
                : "bg-white/30 text-white/60 scale-95 cursor-not-allowed"
            }`}
            aria-label="Measure"
          >
            {isLevel && (
              <span className="absolute inset-0 rounded-full border-2 border-emerald-400/60 animate-ping" />
            )}
            <Camera size={26} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Desktop fallback — manual tilt slider */}
      {source === "simulated" && (
        <div className="mt-4 p-4 bg-neutral-50 border border-neutral-200/70 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] tracking-[0.25em] uppercase text-neutral-500">
              Demo Leveller (no sensor)
            </span>
            <span className="text-xs text-neutral-700 font-medium tabular-nums">
              {simTilt.toFixed(1)}°
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="30"
            step="0.5"
            value={simTilt}
            onChange={(e) => setSimTilt(parseFloat(e.target.value))}
            className="w-full accent-neutral-900"
          />
          <p className="text-[10px] text-neutral-400 mt-1.5">
            Drag toward 0° to simulate placing the phone flat.
          </p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Component: Spirit Level (bubble in circle)
   ============================================================ */
function SpiritLevel({ isLevel, bubble }) {
  return (
    <div className="relative w-16 h-16">
      {/* outer glass */}
      <div
        className={`absolute inset-0 rounded-full backdrop-blur-md border-2 transition-colors ${
          isLevel ? "border-emerald-400 bg-emerald-400/10" : "border-white/40 bg-white/10"
        }`}
      />
      {/* crosshair */}
      <div className="absolute inset-3 rounded-full border border-white/20" />
      <div className="absolute top-1/2 left-1 right-1 h-px bg-white/15" />
      <div className="absolute left-1/2 top-1 bottom-1 w-px bg-white/15" />

      {/* Bubble */}
      <div
        className="absolute top-1/2 left-1/2 w-4 h-4 rounded-full transition-colors"
        style={{
          transform: `translate(calc(-50% + ${bubble.x * 18}px), calc(-50% + ${
            bubble.y * 18
          }px))`,
          background: isLevel
            ? "radial-gradient(circle at 30% 30%, #86efac, #22c55e)"
            : "radial-gradient(circle at 30% 30%, #fde68a, #f59e0b)",
          boxShadow: isLevel
            ? "0 0 14px rgba(34,197,94,0.7)"
            : "0 0 8px rgba(245,158,11,0.5)",
          transitionProperty: "background, box-shadow",
          transitionDuration: "200ms",
        }}
      />
    </div>
  );
}

/* ============================================================
   STAGE: Measuring (analysis animation)
   ============================================================ */
function MeasuringStage() {
  const phrases = [
    "Aligning frame",
    "Detecting foot edges",
    "Computing dimensions",
    "Mapping to Ten × You sizing",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => Math.min(n + 1, phrases.length - 1)), 600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center anim-fade-in min-h-[60vh]">
      <div className="relative w-32 h-32 mb-10">
        <div className="absolute inset-0 rounded-full border border-neutral-200" />
        <div
          className="absolute inset-0 rounded-full border-2 border-neutral-900 border-t-transparent animate-spin"
          style={{ animationDuration: "1.4s" }}
        />
        {/* scan line */}
        <div className="absolute inset-3 rounded-full overflow-hidden">
          <div
            className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-neutral-900 to-transparent anim-scan"
          />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles size={22} strokeWidth={1.5} className="text-neutral-900" />
        </div>
      </div>

      <p className="font-display text-2xl text-neutral-900 mb-2 tracking-tight">
        Measuring…
      </p>
      <p className="text-sm text-neutral-500 transition-opacity">{phrases[i]}</p>
    </div>
  );
}

/* ============================================================
   STAGE: Result + Add to cart
   ============================================================ */
function ResultStage({ added, onAdd, onRetry }) {
  return (
    <div className="flex-1 flex flex-col anim-fade-up pt-6">
      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-4">
        Step 03 — Your Size
      </p>
      <h2 className="font-display text-4xl md:text-5xl leading-[1.05] tracking-tight text-neutral-900 mb-8">
        Your size is <em className="italic font-light">ready</em>.
      </h2>

      {/* Hero size card */}
      <div className="relative bg-neutral-900 text-white rounded-2xl p-8 mb-4 overflow-hidden">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5 blur-3xl" />
        <div className="relative">
          <p className="text-[10px] tracking-[0.3em] uppercase text-white/50 mb-2">
            Ten × You — Recommended
          </p>
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[10rem] leading-none tracking-tighter">
              {DEMO_RESULT.txy}
            </span>
            <span className="font-display italic text-xl text-white/60">
              Ten×You size
            </span>
          </div>
          <p className="text-sm text-white/70 mt-3">
            Foot length:{" "}
            <span className="font-medium text-white">{DEMO_RESULT.cm} cm</span>
          </p>
        </div>
      </div>

      {/* Conversions */}
      <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 mb-6">
        <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-4">
          International equivalents
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "UK", value: DEMO_RESULT.uk },
            { label: "US", value: DEMO_RESULT.us },
            { label: "EU", value: DEMO_RESULT.eu },
          ].map((row) => (
            <div
              key={row.label}
              className="text-center py-3 border-r border-neutral-200/80 last:border-r-0"
            >
              <p className="text-[10px] tracking-[0.25em] uppercase text-neutral-400 mb-1">
                {row.label}
              </p>
              <p className="font-display text-3xl text-neutral-900">{row.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Add to cart */}
      <button
        onClick={onAdd}
        disabled={added}
        className={`w-full py-4 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-all flex items-center justify-center gap-3 mb-3 ${
          added
            ? "bg-emerald-600 text-white cursor-default"
            : "bg-neutral-900 hover:bg-neutral-800 text-white"
        }`}
      >
        {added ? (
          <>
            <Check size={16} strokeWidth={2} />
            Added to Cart
          </>
        ) : (
          <>
            <ShoppingCart size={16} strokeWidth={1.5} />
            Add to Cart · Ten × You Size {DEMO_RESULT.txy}
          </>
        )}
      </button>

      <button
        onClick={onRetry}
        className="w-full py-3 text-xs tracking-[0.25em] uppercase text-neutral-500 hover:text-neutral-900 transition-colors"
      >
        Measure again
      </button>

      <p className="text-[10px] text-neutral-400 text-center mt-6 leading-relaxed">
        Demo result. Production system uses on-device computer vision with calibrated optics.
      </p>
    </div>
  );
}
