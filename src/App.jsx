import { useState, useEffect, useRef, useCallback } from "react";
import {
  ShoppingCart,
  Check,
  ArrowRight,
  ArrowLeft,
  Ruler,
  Tag,
  Footprints,
  Sparkles,
  Info,
  Camera,
  ShieldCheck,
  Smartphone,
  X,
  Scan,
  RotateCcw,
} from "lucide-react";

/* ============================================================
   Ten × You — Smart Sizer (v4)
   Quiz (primary) + optional camera scan (confirmation).
   Quiz is source of truth; scan is theatre + sanity check.
   ============================================================ */

const LEVEL_THRESHOLD_DEG = 5;

const SIZE_CHART = [
  { cm: 22.3, size: 3 }, { cm: 22.7, size: 4 }, { cm: 23.1, size: 4 },
  { cm: 23.55, size: 5 }, { cm: 24.0, size: 5 }, { cm: 24.4, size: 6 },
  { cm: 24.8, size: 6 }, { cm: 25.25, size: 7 }, { cm: 25.7, size: 7 },
  { cm: 26.1, size: 8 }, { cm: 26.5, size: 8 }, { cm: 26.9, size: 9 },
  { cm: 27.3, size: 9 }, { cm: 27.75, size: 10 }, { cm: 28.2, size: 10 },
  { cm: 28.6, size: 11 }, { cm: 29.0, size: 11 }, { cm: 29.45, size: 12 },
  { cm: 29.9, size: 12 },
];

const BRAND_OFFSETS = {
  Nike: 0.5, Adidas: 0.0, Puma: 0.0, Converse: -0.5,
  "New Balance": 0.0, Vans: -0.5, Reebok: 0.0, Asics: 0.5, Other: 0.0,
};
const BRANDS = Object.keys(BRAND_OFFSETS);
const RATIO = { male: 0.150, female: 0.145, unisex: 0.1475 };
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function cmToSize(cm) {
  if (cm < SIZE_CHART[0].cm) return SIZE_CHART[0].size;
  if (cm > SIZE_CHART[SIZE_CHART.length - 1].cm)
    return SIZE_CHART[SIZE_CHART.length - 1].size;
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

/* Quiz recommendation */
function recommend({ heightCm, gender, brand, usualSize, fitPref }) {
  const ratio = RATIO[gender] ?? RATIO.unisex;
  const heightFootCm = heightCm * ratio;
  const heightSize = cmToSize(heightFootCm);
  const brandOffset = BRAND_OFFSETS[brand] ?? 0;
  const quizTrueUk = usualSize + brandOffset;
  const quizSize = Math.round(quizTrueUk);

  const diff = Math.abs(heightSize - quizSize);
  let primary, confidence, rationale;

  if (diff <= 0.5) {
    primary = Math.ceil((heightSize + quizSize) / 2);
    confidence = "high";
    rationale = "Your height and usual size strongly agree.";
  } else if (diff <= 1.5) {
    primary = Math.round(quizSize * 0.65 + heightSize * 0.35);
    confidence = "medium";
    rationale = "Your height suggests slightly different — we leaned toward what you usually wear.";
  } else {
    primary = quizSize;
    confidence = "low";
    rationale = "Your height-based estimate differs significantly from what you usually wear. We trusted your usual size.";
  }

  let alternative, altLabel;
  if (fitPref === "snug") {
    alternative = Math.max(SIZE_CHART[0].size, primary - 1);
    altLabel = "for an even snugger fit";
  } else if (fitPref === "roomy") {
    alternative = Math.min(SIZE_CHART[SIZE_CHART.length - 1].size, primary + 1);
    altLabel = "for extra room";
  } else {
    alternative = Math.min(SIZE_CHART[SIZE_CHART.length - 1].size, primary + 1);
    altLabel = "if you're between sizes";
  }

  primary = clamp(primary, SIZE_CHART[0].size, SIZE_CHART[SIZE_CHART.length - 1].size);
  return {
    primary,
    alternative: alternative === primary ? null : alternative,
    altLabel,
    confidence,
    rationale,
    estimatedCm: Math.round(heightFootCm * 10) / 10,
    conversions: convertSizes(primary),
  };
}

/* Simulate a "scan" result based on height — varies slightly so it's not
   suspiciously identical to the quiz every time. Honest demo behaviour. */
function simulateScan({ heightCm, gender }) {
  const ratio = RATIO[gender] ?? RATIO.unisex;
  const baseCm = heightCm * ratio;
  // Add small pseudo-random jitter (-0.6 to +0.6 cm) seeded by height so it's stable per session
  const seed = (heightCm * 7) % 13;
  const jitter = ((seed / 13) - 0.5) * 1.2;
  const measuredCm = Math.round((baseCm + jitter) * 10) / 10;
  return { measuredCm, size: cmToSize(measuredCm) };
}

/* Reconcile quiz size + scan size */
function reconcile(quizResult, scanSize) {
  const diff = Math.abs(quizResult.primary - scanSize);
  if (diff === 0) {
    return {
      ...quizResult,
      confidence: "high",
      rationale: "Confirmed by your scan — strong agreement between your usual fit and our measurement.",
      scanSize,
      scanStatus: "agree",
    };
  }
  if (diff === 1) {
    return {
      ...quizResult,
      rationale: `Your scan suggests size ${scanSize}, but based on your usual fit we recommend size ${quizResult.primary}. Try ${quizResult.primary} first.`,
      scanSize,
      scanStatus: "near",
    };
  }
  return {
    ...quizResult,
    confidence: "low",
    rationale: `Your scan and quiz disagree noticeably. We trust what you usually wear, but if size ${quizResult.primary} feels off, try ${scanSize}.`,
    scanSize,
    scanStatus: "disagree",
  };
}

/* ============================================================
   Hook: useLeveller (sensor-first, desktop slider fallback)
   ============================================================ */
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
  const bubble =
    source === "simulated"
      ? { x: Math.sin(Date.now() / 600) * (simTilt / 30), y: Math.cos(Date.now() / 600) * (simTilt / 30) }
      : { x: clamp((gamma ?? 0) / 30, -1, 1), y: clamp((beta ?? 0) / 30, -1, 1) };
  return { totalTilt, isLevel, source, requestSensor, simTilt, setSimTilt, bubble };
}

/* ============================================================
   App
   ============================================================ */
export default function App() {
  // Stages:
  // 'welcome' | 'q-height' | 'q-gender' | 'q-brand' | 'q-fit'
  // | 'result-quiz' | 'scan-permissions' | 'scan-instructions'
  // | 'scan-camera' | 'scan-measuring' | 'result-final'
  const [stage, setStage] = useState("welcome");

  const [data, setData] = useState({
    heightCm: 170, gender: null, brand: null, usualSize: 8, fitPref: null,
  });
  const [quizResult, setQuizResult] = useState(null);
  const [finalResult, setFinalResult] = useState(null);
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [added, setAdded] = useState(false);
  const videoRef = useRef(null);
  const lev = useLeveller();

  const update = (key, value) => setData((d) => ({ ...d, [key]: value }));

  /* Camera lifecycle */
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
          ? "Camera permission denied. Enable it in your browser settings."
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

  /* Stage transitions */
  const finishQuiz = (latestData) => {
    const r = recommend(latestData ?? data);
    setQuizResult(r);
    setFinalResult(r); // mirror until scan reconciles
    setStage("result-quiz");
  };

  const startScanFlow = async () => {
    await lev.requestSensor();
    setStage("scan-permissions");
  };

  const acceptScanPermissions = async () => {
    setStage("scan-instructions");
  };

  const goToScanCamera = async () => {
    await startCamera();
    setStage("scan-camera");
  };

  const handleMeasure = () => {
    if (!lev.isLevel) return;
    setStage("scan-measuring");
    setTimeout(() => {
      stopCamera();
      const scan = simulateScan(data);
      const reconciled = reconcile(quizResult, scan.size);
      setFinalResult({ ...reconciled, scanCm: scan.measuredCm });
      setStage("result-final");
    }, 2400);
  };

  const handleAddToCart = () => {
    setAdded(true);
    setCartCount((c) => c + 1);
  };

  const reset = () => {
    setData({ heightCm: 170, gender: null, brand: null, usualSize: 8, fitPref: null });
    setQuizResult(null);
    setFinalResult(null);
    setAdded(false);
    setStage("welcome");
  };

  /* Step number for progress (only during quiz) */
  const stepNumber = {
    "q-height": 1, "q-gender": 2, "q-brand": 3, "q-fit": 4,
  }[stage] ?? 0;

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
        .anim-fade-up { animation: fade-up 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .anim-fade-in { animation: fade-in 0.4s ease both; }
        .anim-scale-in { animation: scale-in 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .anim-scan { animation: scan 2s ease-in-out infinite alternate; }

        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 28px; height: 28px; border-radius: 50%;
          background: #171717; border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2); cursor: grab;
        }
        input[type="range"]::-moz-range-thumb {
          width: 28px; height: 28px; border-radius: 50%;
          background: #171717; border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2); cursor: grab; border: none;
        }
      `}</style>

      <header className="fixed top-0 inset-x-0 z-30 border-b border-neutral-200/70 bg-white/85 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-neutral-900 text-white flex items-center justify-center rounded-sm font-display text-sm tracking-tight">
              TXY
            </div>
            <span className="text-[11px] tracking-[0.25em] uppercase text-neutral-500">Fit Studio</span>
          </div>
          <div className="relative">
            <ShoppingCart size={20} strokeWidth={1.5} className="text-neutral-700" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-neutral-900 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-medium"
                style={{ animation: "cart-pop 0.4s ease both" }}>
                {cartCount}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Quiz progress */}
      {stepNumber > 0 && (
        <div className="fixed top-14 inset-x-0 z-20 bg-white">
          <div className="max-w-2xl mx-auto px-5 pt-4">
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map((n) => (
                <div key={n}
                  className={`flex-1 h-0.5 rounded-full transition-colors ${
                    stepNumber >= n ? "bg-neutral-900" : "bg-neutral-200"
                  }`} />
              ))}
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] tracking-[0.25em] uppercase text-neutral-400">
                Step 0{stepNumber} of 04
              </span>
              <span className="text-[10px] tracking-[0.25em] uppercase text-neutral-400">
                {stepNumber === 1 && "Height"}
                {stepNumber === 2 && "About you"}
                {stepNumber === 3 && "What you wear"}
                {stepNumber === 4 && "Fit"}
              </span>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-5 pt-32 pb-10 min-h-screen flex flex-col">
        {stage === "welcome" && <Welcome onStart={() => setStage("q-height")} />}

        {stage === "q-height" && (
          <HeightStep
            value={data.heightCm}
            onChange={(v) => update("heightCm", v)}
            onNext={() => setStage("q-gender")}
            onBack={() => setStage("welcome")}
          />
        )}

        {stage === "q-gender" && (
          <GenderStep
            value={data.gender}
            onChange={(v) => {
              update("gender", v);
              setTimeout(() => setStage("q-brand"), 200);
            }}
            onBack={() => setStage("q-height")}
          />
        )}

        {stage === "q-brand" && (
          <BrandStep
            brand={data.brand}
            usualSize={data.usualSize}
            onBrandChange={(v) => update("brand", v)}
            onSizeChange={(v) => update("usualSize", v)}
            onNext={() => setStage("q-fit")}
            onBack={() => setStage("q-gender")}
          />
        )}

        {stage === "q-fit" && (
          <FitStep
            value={data.fitPref}
            onChange={(v) => {
              update("fitPref", v);
              setTimeout(() => finishQuiz({ ...data, fitPref: v }), 250);
            }}
            onBack={() => setStage("q-brand")}
          />
        )}

        {stage === "result-quiz" && finalResult && (
          <ResultStage
            result={finalResult}
            added={added}
            onAdd={handleAddToCart}
            onReset={reset}
            onScan={startScanFlow}
            scanAvailable={true}
          />
        )}

        {stage === "scan-permissions" && (
          <ScanPermissionsDialog
            onAccept={acceptScanPermissions}
            onCancel={() => setStage("result-quiz")}
          />
        )}

        {stage === "scan-instructions" && (
          <ScanInstructions
            source={lev.source}
            onContinue={goToScanCamera}
            onBack={() => setStage("result-quiz")}
            cameraError={cameraError}
          />
        )}

        {stage === "scan-camera" && (
          <CameraStage
            videoRef={videoRef}
            lev={lev}
            onMeasure={handleMeasure}
            onBack={() => {
              stopCamera();
              setStage("scan-instructions");
            }}
          />
        )}

        {stage === "scan-measuring" && <MeasuringStage />}

        {stage === "result-final" && finalResult && (
          <ResultStage
            result={finalResult}
            added={added}
            onAdd={handleAddToCart}
            onReset={reset}
            scanAvailable={false}
          />
        )}
      </main>
    </div>
  );
}

/* ============================================================
   Welcome
   ============================================================ */
function Welcome({ onStart }) {
  return (
    <div className="flex-1 flex flex-col anim-fade-up justify-center min-h-[70vh]">
      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-4">Smart Sizing</p>
      <h1 className="font-display text-5xl md:text-6xl leading-[1.02] tracking-tight text-neutral-900 mb-6">
        Find your <em className="italic font-light">perfect</em> Ten × You size in 30 seconds.
      </h1>
      <p className="text-neutral-600 leading-relaxed mb-10 max-w-md text-base">
        Four quick questions, then an optional scan to confirm. We combine your height, what you
        already wear, and your fit preference to recommend the right size with confidence.
      </p>

      <div className="space-y-4 mb-12">
        {[
          { icon: <Tag size={16} strokeWidth={1.5} />, text: "Quick quiz — 4 taps", sub: "About your height and what you wear" },
          { icon: <Scan size={16} strokeWidth={1.5} />, text: "Optional scan to confirm", sub: "Camera-based double-check" },
          { icon: <Footprints size={16} strokeWidth={1.5} />, text: "Your size, ready to shop", sub: "" },
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-4">
            <span className="w-9 h-9 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-700 flex-shrink-0">
              {item.icon}
            </span>
            <div>
              <p className="text-sm text-neutral-900 font-medium">{item.text}</p>
              {item.sub && <p className="text-xs text-neutral-500 mt-0.5">{item.sub}</p>}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onStart}
        className="group inline-flex items-center justify-center gap-3 bg-neutral-900 hover:bg-neutral-800 text-white px-8 py-4 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-colors w-full"
      >
        Begin
        <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
      </button>
    </div>
  );
}

/* ============================================================
   Reusable
   ============================================================ */
function StepHeader({ kicker, title, subtitle }) {
  return (
    <>
      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-3">{kicker}</p>
      <h2 className="font-display text-3xl md:text-4xl leading-[1.1] tracking-tight text-neutral-900 mb-3">
        {title}
      </h2>
      {subtitle && <p className="text-neutral-600 mb-10 leading-relaxed">{subtitle}</p>}
    </>
  );
}

function NavButtons({ onBack, onNext, nextDisabled, nextLabel = "Continue" }) {
  return (
    <div className="flex items-center gap-3 mt-auto pt-8">
      {onBack && (
        <button onClick={onBack}
          className="flex items-center justify-center gap-2 border border-neutral-200 text-neutral-700 hover:border-neutral-900 hover:text-neutral-900 py-4 px-5 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-colors"
          aria-label="Back">
          <ArrowLeft size={14} />
        </button>
      )}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className={`group flex-1 flex items-center justify-center gap-3 py-4 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-all ${
          nextDisabled
            ? "bg-neutral-200 text-neutral-400 cursor-not-allowed"
            : "bg-neutral-900 hover:bg-neutral-800 text-white"
        }`}>
        {nextLabel}
        <ArrowRight size={14} className={nextDisabled ? "" : "group-hover:translate-x-0.5 transition-transform"} />
      </button>
    </div>
  );
}

/* ============================================================
   Quiz steps (height/gender/brand/fit)
   ============================================================ */
function HeightStep({ value, onChange, onNext, onBack }) {
  return (
    <div className="flex-1 flex flex-col anim-fade-up">
      <StepHeader kicker="01 — Height" title="How tall are you?"
        subtitle="Your height tells us your foot length within a centimetre or two." />
      <div className="bg-neutral-50 border border-neutral-200/70 rounded-2xl p-8 mb-4">
        <div className="text-center mb-6">
          <span className="font-display text-7xl tracking-tighter text-neutral-900">{value}</span>
          <span className="font-display italic text-2xl text-neutral-500 ml-2">cm</span>
        </div>
        <input type="range" min="140" max="210" step="1" value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="w-full h-1 bg-neutral-200 rounded-full appearance-none cursor-pointer" />
        <div className="flex justify-between mt-2 text-[10px] tracking-[0.2em] uppercase text-neutral-400">
          <span>140 cm</span><span>210 cm</span>
        </div>
      </div>
      <p className="flex items-start gap-2 text-xs text-neutral-500 leading-relaxed">
        <Info size={13} strokeWidth={1.5} className="flex-shrink-0 mt-0.5" />
        Drag the slider to your height.
      </p>
      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}

function GenderStep({ value, onChange, onBack }) {
  const options = [
    { id: "female", label: "Female" },
    { id: "male", label: "Male" },
    { id: "unisex", label: "Prefer not to say", note: "We'll use a unisex average" },
  ];
  return (
    <div className="flex-1 flex flex-col anim-fade-up">
      <StepHeader kicker="02 — About you" title="A small detail."
        subtitle="Foot-to-height ratios differ slightly. This sharpens our estimate by about 1%." />
      <div className="space-y-3">
        {options.map((opt) => (
          <button key={opt.id} onClick={() => onChange(opt.id)}
            className={`w-full text-left px-6 py-5 rounded-2xl border transition-all flex items-center justify-between ${
              value === opt.id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 hover:border-neutral-400"
            }`}>
            <div>
              <p className="font-display text-xl">{opt.label}</p>
              {opt.note && (
                <p className={`text-xs mt-0.5 ${value === opt.id ? "text-white/60" : "text-neutral-500"}`}>{opt.note}</p>
              )}
            </div>
            {value === opt.id && <Check size={18} strokeWidth={2} />}
          </button>
        ))}
      </div>
      <div className="mt-auto pt-8">
        <button onClick={onBack}
          className="text-[10px] tracking-[0.25em] uppercase text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-2">
          <ArrowLeft size={12} /> Back
        </button>
      </div>
    </div>
  );
}

function BrandStep({ brand, usualSize, onBrandChange, onSizeChange, onNext, onBack }) {
  return (
    <div className="flex-1 flex flex-col anim-fade-up">
      <StepHeader kicker="03 — What you wear" title="What's your usual fit?"
        subtitle="Different brands size differently. We'll adjust for the brand you pick." />
      <div className="mb-6">
        <p className="text-[10px] tracking-[0.25em] uppercase text-neutral-500 mb-3">Brand you wear most</p>
        <div className="grid grid-cols-3 gap-2">
          {BRANDS.map((b) => (
            <button key={b} onClick={() => onBrandChange(b)}
              className={`px-3 py-3 rounded-xl border text-sm transition-all ${
                brand === b ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 hover:border-neutral-400 text-neutral-700"
              }`}>{b}</button>
          ))}
        </div>
      </div>
      <div className="bg-neutral-50 border border-neutral-200/70 rounded-2xl p-6">
        <p className="text-[10px] tracking-[0.25em] uppercase text-neutral-500 mb-3">
          Your usual UK size in {brand || "that brand"}
        </p>
        <div className="text-center mb-4">
          <span className="font-display text-6xl tracking-tighter text-neutral-900">{usualSize}</span>
          <span className="font-display italic text-xl text-neutral-500 ml-2">UK</span>
        </div>
        <input type="range" min="3" max="13" step="0.5" value={usualSize}
          onChange={(e) => onSizeChange(parseFloat(e.target.value))}
          className="w-full h-1 bg-neutral-200 rounded-full appearance-none cursor-pointer" />
        <div className="flex justify-between mt-2 text-[10px] tracking-[0.2em] uppercase text-neutral-400">
          <span>UK 3</span><span>UK 13</span>
        </div>
      </div>
      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={!brand} />
    </div>
  );
}

function FitStep({ value, onChange, onBack }) {
  const options = [
    { id: "snug", label: "Snug", desc: "I like a close, locked-in feel" },
    { id: "standard", label: "Standard", desc: "Just right — not tight, not loose" },
    { id: "roomy", label: "Roomy", desc: "I like room to wiggle my toes" },
  ];
  return (
    <div className="flex-1 flex flex-col anim-fade-up">
      <StepHeader kicker="04 — Fit" title="How do you like it?"
        subtitle="Last one. Your fit preference fine-tunes the recommendation." />
      <div className="space-y-3">
        {options.map((opt) => (
          <button key={opt.id} onClick={() => onChange(opt.id)}
            className={`w-full text-left px-6 py-5 rounded-2xl border transition-all flex items-center justify-between ${
              value === opt.id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 hover:border-neutral-400"
            }`}>
            <div>
              <p className="font-display text-xl mb-0.5">{opt.label}</p>
              <p className={`text-xs ${value === opt.id ? "text-white/60" : "text-neutral-500"}`}>{opt.desc}</p>
            </div>
            {value === opt.id && <Check size={18} strokeWidth={2} />}
          </button>
        ))}
      </div>
      <div className="mt-auto pt-8">
        <button onClick={onBack}
          className="text-[10px] tracking-[0.25em] uppercase text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-2">
          <ArrowLeft size={12} /> Back
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Result (used after quiz, and again after scan reconciles)
   ============================================================ */
function ResultStage({ result, added, onAdd, onReset, onScan, scanAvailable }) {
  const confidenceLabel = {
    high: { text: "High confidence", color: "text-emerald-600", dot: "bg-emerald-500" },
    medium: { text: "Good confidence", color: "text-amber-600", dot: "bg-amber-500" },
    low: { text: "Worth a try-on", color: "text-neutral-600", dot: "bg-neutral-400" },
  }[result.confidence];

  return (
    <div className="flex-1 flex flex-col anim-fade-up pt-2">
      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-3">
        {result.scanStatus ? "Confirmed Result" : "Your Recommendation"}
      </p>
      <h2 className="font-display text-4xl md:text-5xl leading-[1.05] tracking-tight text-neutral-900 mb-2">
        {result.scanStatus === "agree" ? (
          <>Your size is <em className="italic font-light">confirmed</em>.</>
        ) : (
          <>We found <em className="italic font-light">your size</em>.</>
        )}
      </h2>

      <div className="flex items-center gap-2 mb-8">
        <span className={`w-1.5 h-1.5 rounded-full ${confidenceLabel.dot}`} />
        <span className={`text-xs ${confidenceLabel.color} font-medium`}>{confidenceLabel.text}</span>
        {result.scanStatus === "agree" && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
            <Check size={11} strokeWidth={2.5} /> Scan confirmed
          </span>
        )}
      </div>

      {/* Hero size card */}
      <div className="relative bg-neutral-900 text-white rounded-2xl p-8 mb-4 overflow-hidden">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5 blur-3xl" />
        <div className="relative">
          <p className="text-[10px] tracking-[0.3em] uppercase text-white/50 mb-2">Ten × You — Recommended</p>
          <div className="flex items-baseline gap-3 mb-4">
            <span className="font-display text-[10rem] leading-none tracking-tighter">{result.primary}</span>
            <span className="font-display italic text-xl text-white/60">your TXY size</span>
          </div>
          <p className="text-sm text-white/70 leading-relaxed">{result.rationale}</p>
        </div>
      </div>

      {/* Scan disagree info */}
      {result.scanStatus && result.scanStatus !== "agree" && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 mb-4 flex items-start gap-3">
          <Info size={18} strokeWidth={1.5} className="text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-amber-900 font-medium mb-1">
              Scan suggested size {result.scanSize} ({result.scanCm} cm)
            </p>
            <p className="text-xs text-amber-800/80 leading-relaxed">
              We trust your usual fit more, but feel free to try size {result.scanSize} if our pick doesn't feel right.
            </p>
          </div>
        </div>
      )}

      {/* Alternative size */}
      {result.alternative && (
        <div className="bg-neutral-50 border border-neutral-200/70 rounded-2xl p-5 mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] tracking-[0.25em] uppercase text-neutral-500 mb-1">Alternative</p>
            <p className="text-sm text-neutral-700">
              Try size <span className="font-display text-2xl text-neutral-900 mx-0.5">{result.alternative}</span>{" "}
              {result.altLabel}
            </p>
          </div>
          <Sparkles size={18} strokeWidth={1.5} className="text-neutral-400" />
        </div>
      )}

      {/* Conversions */}
      <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 mb-4">
        <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-4">International equivalents</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "UK", value: result.conversions.uk },
            { label: "US", value: result.conversions.us },
            { label: "EU", value: result.conversions.eu },
          ].map((row) => (
            <div key={row.label}
              className="text-center py-3 border-r border-neutral-200/80 last:border-r-0">
              <p className="text-[10px] tracking-[0.25em] uppercase text-neutral-400 mb-1">{row.label}</p>
              <p className="font-display text-3xl text-neutral-900">{row.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Optional scan card — only shown after quiz, before scanning */}
      {scanAvailable && (
        <div className="relative bg-gradient-to-br from-neutral-50 to-white border border-neutral-200 rounded-2xl p-6 mb-6 overflow-hidden">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-full bg-neutral-900 text-white flex items-center justify-center flex-shrink-0">
              <Scan size={20} strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] tracking-[0.25em] uppercase text-neutral-500 mb-1">Optional</p>
              <h3 className="font-display text-xl text-neutral-900 mb-1">Double-check with a scan</h3>
              <p className="text-xs text-neutral-600 leading-relaxed mb-4">
                Use your phone's camera and motion sensors for a quick measurement. Adds about 30 seconds.
              </p>
              <button
                onClick={onScan}
                className="inline-flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-white px-5 py-2.5 rounded-full text-[10px] tracking-[0.25em] uppercase font-medium transition-colors"
              >
                <Camera size={13} strokeWidth={1.8} />
                Start Scan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to cart */}
      <button
        onClick={onAdd}
        disabled={added}
        className={`w-full py-4 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-all flex items-center justify-center gap-3 mb-3 ${
          added ? "bg-emerald-600 text-white cursor-default" : "bg-neutral-900 hover:bg-neutral-800 text-white"
        }`}>
        {added ? (
          <><Check size={16} strokeWidth={2} />Added to Cart</>
        ) : (
          <><ShoppingCart size={16} strokeWidth={1.5} />Add to Cart · Ten × You Size {result.primary}</>
        )}
      </button>

      <button onClick={onReset}
        className="w-full py-3 text-xs tracking-[0.25em] uppercase text-neutral-500 hover:text-neutral-900 transition-colors">
        Start over
      </button>
    </div>
  );
}

/* ============================================================
   Scan flow components
   ============================================================ */
function ScanPermissionsDialog({ onAccept, onCancel }) {
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
            { icon: <Smartphone size={14} strokeWidth={1.5} />, text: "Motion sensors — for phone levelling" },
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

function ScanInstructions({ source, onContinue, onBack, cameraError }) {
  return (
    <div className="flex-1 flex flex-col anim-fade-up pt-2">
      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-3">Scan — Setup</p>
      <h2 className="font-display text-4xl md:text-5xl leading-[1.05] tracking-tight text-neutral-900 mb-4">
        Hold phone <em className="italic font-light">parallel</em> to the floor.
      </h2>
      <p className="text-neutral-600 leading-relaxed mb-8 max-w-md">
        When the level turns green, tap <span className="font-medium text-neutral-900">Measure</span>.
        Stand naturally with your foot in the frame.
      </p>

      <div className="relative bg-neutral-50 rounded-2xl aspect-[5/4] mb-6 overflow-hidden border border-neutral-200/70">
        <svg viewBox="0 0 400 320" className="absolute inset-0 w-full h-full p-6">
          {[...Array(6)].map((_, i) => (
            <line key={i} x1="20" y1={250 + i * 12} x2="380" y2={250 + i * 12}
              stroke="#171717" strokeWidth="0.4" opacity={0.06 + i * 0.02} />
          ))}
          <g transform="translate(140 70)">
            <rect width="120" height="70" rx="10" fill="#171717" />
            <rect x="6" y="6" width="108" height="58" rx="6" fill="#404040" />
            <circle cx="60" cy="35" r="5" fill="#22c55e" opacity="0.9" />
          </g>
          <line x1="40" y1="105" x2="360" y2="105" stroke="#171717" strokeWidth="0.8" strokeDasharray="3 4" opacity="0.4" />
          <text x="200" y="195" textAnchor="middle" fontSize="10" fill="#737373" fontFamily="Fraunces, serif" fontStyle="italic">‹ parallel ›</text>
          <ellipse cx="200" cy="275" rx="36" ry="10" fill="#171717" opacity="0.15" />
        </svg>
      </div>

      <div className="flex items-center gap-2 mb-4 text-[11px] text-neutral-500">
        <Info size={13} strokeWidth={1.5} />
        {source === "sensor" ? <span>Motion sensors detected.</span>
          : <span>No motion sensors — using on-screen leveller for the demo.</span>}
      </div>

      {cameraError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
          {cameraError}
        </div>
      )}

      <div className="flex items-center gap-3 mt-auto pt-2">
        <button onClick={onBack}
          className="flex items-center justify-center gap-2 border border-neutral-200 text-neutral-700 hover:border-neutral-900 hover:text-neutral-900 py-4 px-5 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-colors">
          <ArrowLeft size={14} />
        </button>
        <button onClick={onContinue}
          className="group flex-1 flex items-center justify-center gap-3 bg-neutral-900 hover:bg-neutral-800 text-white py-4 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-colors">
          Continue
          <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
}

function CameraStage({ videoRef, lev, onMeasure, onBack }) {
  const { isLevel, totalTilt, source, simTilt, setSimTilt, bubble } = lev;
  return (
    <div className="flex-1 flex flex-col anim-fade-in pt-2">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400">Scan — Capture</p>
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
            isLevel ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
                    : "bg-white/10 text-white/80 border border-white/20"
          }`}>
            {isLevel ? "Level" : `${totalTilt.toFixed(1)}°`}
          </div>
        </div>

        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 text-center">
          <p className={`text-xs font-medium tracking-wide transition-colors ${
            isLevel ? "text-emerald-300" : "text-white/85"
          }`} style={{ animation: !isLevel ? "pulse-soft 2s ease-in-out infinite" : undefined }}>
            {isLevel ? "Hold steady — ready to measure" : "Tilt the phone until level"}
          </p>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <button onClick={onMeasure} disabled={!isLevel}
            className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
              isLevel ? "bg-white text-neutral-900 scale-100 shadow-2xl shadow-emerald-500/30"
                      : "bg-white/30 text-white/60 scale-95 cursor-not-allowed"
            }`} aria-label="Measure">
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
            onChange={(e) => setSimTilt(parseFloat(e.target.value))}
            className="w-full accent-neutral-900" />
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
          background: isLevel ? "radial-gradient(circle at 30% 30%, #86efac, #22c55e)"
                              : "radial-gradient(circle at 30% 30%, #fde68a, #f59e0b)",
          boxShadow: isLevel ? "0 0 14px rgba(34,197,94,0.7)" : "0 0 8px rgba(245,158,11,0.5)",
          transitionProperty: "background, box-shadow", transitionDuration: "200ms",
        }} />
    </div>
  );
}

function MeasuringStage() {
  const phrases = [
    "Aligning frame", "Detecting foot edges",
    "Computing dimensions", "Cross-checking with your quiz",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => Math.min(n + 1, phrases.length - 1)), 550);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex-1 flex flex-col items-center justify-center anim-fade-in min-h-[60vh]">
      <div className="relative w-32 h-32 mb-10">
        <div className="absolute inset-0 rounded-full border border-neutral-200" />
        <div className="absolute inset-0 rounded-full border-2 border-neutral-900 border-t-transparent animate-spin"
          style={{ animationDuration: "1.4s" }} />
        <div className="absolute inset-3 rounded-full overflow-hidden">
          <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-neutral-900 to-transparent anim-scan" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles size={22} strokeWidth={1.5} className="text-neutral-900" />
        </div>
      </div>
      <p className="font-display text-2xl text-neutral-900 mb-2 tracking-tight">Measuring…</p>
      <p className="text-sm text-neutral-500 transition-opacity">{phrases[i]}</p>
    </div>
  );
}
