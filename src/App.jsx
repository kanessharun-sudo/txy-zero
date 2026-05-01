import { useState, useEffect } from "react";
import {
  ShoppingCart,
  Check,
  ArrowRight,
  ArrowLeft,
  Ruler,
  User,
  Tag,
  Footprints,
  Sparkles,
  Info,
} from "lucide-react";

/* ============================================================
   Ten × You — Smart Size Recommender (v3)
   Height anthropometry + lived-experience quiz, reconciled.
   ============================================================ */

/* --- TXY size chart (cm -> size, with size-up rule) --- */
const SIZE_CHART = [
  { cm: 22.3, size: 3 }, { cm: 22.7, size: 4 }, { cm: 23.1, size: 4 },
  { cm: 23.55, size: 5 }, { cm: 24.0, size: 5 }, { cm: 24.4, size: 6 },
  { cm: 24.8, size: 6 }, { cm: 25.25, size: 7 }, { cm: 25.7, size: 7 },
  { cm: 26.1, size: 8 }, { cm: 26.5, size: 8 }, { cm: 26.9, size: 9 },
  { cm: 27.3, size: 9 }, { cm: 27.75, size: 10 }, { cm: 28.2, size: 10 },
  { cm: 28.6, size: 11 }, { cm: 29.0, size: 11 }, { cm: 29.45, size: 12 },
  { cm: 29.9, size: 12 },
];

/* Brand sizing offsets relative to true UK.
   Positive = brand runs SMALL (their 8 is actually a 7.5 true UK).
   Negative = brand runs LARGE.
   Sources: aggregated from sizing comparison sites; approximate. */
const BRAND_OFFSETS = {
  Nike: 0.5,
  Adidas: 0.0,
  Puma: 0.0,
  Converse: -0.5,
  "New Balance": 0.0,
  Vans: -0.5,
  Reebok: 0.0,
  Asics: 0.5,
  Other: 0.0,
};

const BRANDS = Object.keys(BRAND_OFFSETS);

/* Foot-length-to-height ratio by gender. */
const RATIO = { male: 0.150, female: 0.145, unisex: 0.1475 };

/* Map cm -> TXY size using size-up rule */
function cmToSize(cm) {
  if (cm < SIZE_CHART[0].cm) return SIZE_CHART[0].size;
  if (cm > SIZE_CHART[SIZE_CHART.length - 1].cm)
    return SIZE_CHART[SIZE_CHART.length - 1].size;
  for (const row of SIZE_CHART) if (cm <= row.cm) return row.size;
  return SIZE_CHART[SIZE_CHART.length - 1].size;
}

/* Get representative cm for a TXY size (for back-conversion from quiz size) */
function sizeToCm(size) {
  // Use the highest cm value that maps to this size (the "boundary")
  const matches = SIZE_CHART.filter((r) => r.size === size);
  if (matches.length) return matches[matches.length - 1].cm;
  // approximate fallback
  return 22.0 + (size - 3) * 0.85;
}

/* Convert TXY size to UK / US (women's) / EU */
function convertSizes(size) {
  // TXY size is roughly aligned with UK
  const uk = size;
  const us = uk + 2; // women's US convention
  const cm = sizeToCm(size);
  const eu = Math.round(cm * 1.5 + 2);
  return { uk, us, eu };
}

/* ============================================================
   Core recommendation logic — reconciles height + quiz signals
   ============================================================ */
function recommend({ heightCm, gender, brand, usualSize, fitPref }) {
  // Signal 1: height-based foot length
  const ratio = RATIO[gender] ?? RATIO.unisex;
  const heightFootCm = heightCm * ratio;
  const heightSize = cmToSize(heightFootCm);

  // Signal 2: lived-experience size, brand-corrected to true UK
  const brandOffset = BRAND_OFFSETS[brand] ?? 0;
  const quizTrueUk = usualSize + brandOffset;
  const quizSize = Math.round(quizTrueUk);

  // Reconcile
  const diff = Math.abs(heightSize - quizSize);
  let primary;
  let confidence;
  let rationale;

  if (diff <= 0.5) {
    // Strong agreement — average and round up for safety
    primary = Math.ceil((heightSize + quizSize) / 2);
    confidence = "high";
    rationale = "Your height and usual size strongly agree.";
  } else if (diff <= 1.5) {
    // Mild disagreement — weighted average favoring quiz (lived experience)
    primary = Math.round(quizSize * 0.65 + heightSize * 0.35);
    confidence = "medium";
    rationale = "Your height suggests a slightly different size — we leaned toward what you usually wear.";
  } else {
    // Strong disagreement — trust lived experience
    primary = quizSize;
    confidence = "low";
    rationale =
      "Your height-based estimate differs significantly from what you usually wear. We trusted your usual size.";
  }

  // Fit-based alternative
  let alternative;
  let altLabel;
  if (fitPref === "snug") {
    alternative = Math.max(SIZE_CHART[0].size, primary - 1);
    altLabel = "for an even snugger fit";
  } else if (fitPref === "roomy") {
    alternative = Math.min(SIZE_CHART[SIZE_CHART.length - 1].size, primary + 1);
    altLabel = "for extra room";
  } else {
    // standard — alternative is one up for safety
    alternative = Math.min(SIZE_CHART[SIZE_CHART.length - 1].size, primary + 1);
    altLabel = "if you're between sizes";
  }

  // If fit pref is snug, primary should also size down by 0.5 effectively
  if (fitPref === "snug" && diff <= 1.5) {
    primary = Math.max(SIZE_CHART[0].size, primary);
  }
  if (fitPref === "roomy" && diff <= 1.5) {
    primary = Math.min(SIZE_CHART[SIZE_CHART.length - 1].size, primary);
  }

  // Clamp to chart range
  primary = Math.max(SIZE_CHART[0].size, Math.min(SIZE_CHART[SIZE_CHART.length - 1].size, primary));

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

/* ============================================================
   App
   ============================================================ */
export default function App() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    heightCm: 170,
    gender: null,
    brand: null,
    usualSize: 8,
    fitPref: null,
  });
  const [result, setResult] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [added, setAdded] = useState(false);

  const update = (key, value) => setData((d) => ({ ...d, [key]: value }));

  const handleFinish = () => {
    setResult(recommend(data));
    setStep(5);
  };

  const reset = () => {
    setData({ heightCm: 170, gender: null, brand: null, usualSize: 8, fitPref: null });
    setResult(null);
    setAdded(false);
    setStep(0);
  };

  const handleAddToCart = () => {
    setAdded(true);
    setCartCount((c) => c + 1);
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900 antialiased">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=Inter:wght@300;400;500;600&display=swap');
        :root { font-family: 'Inter', system-ui, sans-serif; }
        .font-display { font-family: 'Fraunces', serif; font-optical-sizing: auto; }
        @keyframes fade-up { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cart-pop { 0% { transform: scale(0.6) } 60% { transform: scale(1.15) } 100% { transform: scale(1) } }
        .anim-fade-up { animation: fade-up 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .anim-fade-in { animation: fade-in 0.4s ease both; }

        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 28px; height: 28px; border-radius: 50%;
          background: #171717; border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          cursor: grab;
        }
        input[type="range"]::-moz-range-thumb {
          width: 28px; height: 28px; border-radius: 50%;
          background: #171717; border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          cursor: grab; border: none;
        }
      `}</style>

      {/* Top bar */}
      <header className="fixed top-0 inset-x-0 z-30 border-b border-neutral-200/70 bg-white/85 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-neutral-900 text-white flex items-center justify-center rounded-sm font-display text-sm tracking-tight">
              TXY
            </div>
            <span className="text-[11px] tracking-[0.25em] uppercase text-neutral-500">
              Fit Studio
            </span>
          </div>

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

      {/* Progress */}
      {step > 0 && step < 5 && (
        <div className="fixed top-14 inset-x-0 z-20 bg-white">
          <div className="max-w-2xl mx-auto px-5 pt-4">
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className={`flex-1 h-0.5 rounded-full transition-colors ${
                    step >= n ? "bg-neutral-900" : "bg-neutral-200"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] tracking-[0.25em] uppercase text-neutral-400">
                Step 0{step} of 04
              </span>
              <span className="text-[10px] tracking-[0.25em] uppercase text-neutral-400">
                {step === 1 && "Height"}
                {step === 2 && "About you"}
                {step === 3 && "What you wear"}
                {step === 4 && "Fit"}
              </span>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-5 pt-32 pb-10 min-h-screen flex flex-col">
        {/* ------- Stage 0: Welcome ------- */}
        {step === 0 && <Welcome onStart={() => setStep(1)} />}

        {/* ------- Stage 1: Height ------- */}
        {step === 1 && (
          <HeightStep
            value={data.heightCm}
            onChange={(v) => update("heightCm", v)}
            onNext={() => setStep(2)}
            onBack={() => setStep(0)}
          />
        )}

        {/* ------- Stage 2: Gender ------- */}
        {step === 2 && (
          <GenderStep
            value={data.gender}
            onChange={(v) => {
              update("gender", v);
              setTimeout(() => setStep(3), 200);
            }}
            onBack={() => setStep(1)}
          />
        )}

        {/* ------- Stage 3: Brand ------- */}
        {step === 3 && (
          <BrandStep
            brand={data.brand}
            usualSize={data.usualSize}
            onBrandChange={(v) => update("brand", v)}
            onSizeChange={(v) => update("usualSize", v)}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}

        {/* ------- Stage 4: Fit preference ------- */}
        {step === 4 && (
          <FitStep
            value={data.fitPref}
            onChange={(v) => {
              update("fitPref", v);
              setTimeout(() => {
                setResult(recommend({ ...data, fitPref: v }));
                setStep(5);
              }, 250);
            }}
            onBack={() => setStep(3)}
          />
        )}

        {/* ------- Stage 5: Result ------- */}
        {step === 5 && result && (
          <ResultStep
            result={result}
            added={added}
            onAdd={handleAddToCart}
            onReset={reset}
          />
        )}
      </main>
    </div>
  );
}

/* ============================================================
   Stage components
   ============================================================ */

function Welcome({ onStart }) {
  return (
    <div className="flex-1 flex flex-col anim-fade-up justify-center min-h-[70vh]">
      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-4">
        Smart Sizing
      </p>
      <h1 className="font-display text-5xl md:text-6xl leading-[1.02] tracking-tight text-neutral-900 mb-6">
        Find your <em className="italic font-light">perfect</em> Ten × You size in 30 seconds.
      </h1>
      <p className="text-neutral-600 leading-relaxed mb-10 max-w-md text-base">
        Four quick questions. No camera, no measuring tape. We combine your height with what you
        already wear to recommend the right size with confidence.
      </p>

      <div className="space-y-4 mb-12">
        {[
          { icon: <Ruler size={16} strokeWidth={1.5} />, text: "Tell us your height" },
          { icon: <Tag size={16} strokeWidth={1.5} />, text: "Tell us what you usually wear" },
          { icon: <Footprints size={16} strokeWidth={1.5} />, text: "Get your size, ready to shop" },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-4">
            <span className="w-9 h-9 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-700">
              {item.icon}
            </span>
            <span className="text-sm text-neutral-700">{item.text}</span>
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
        <button
          onClick={onBack}
          className="flex items-center justify-center gap-2 border border-neutral-200 text-neutral-700 hover:border-neutral-900 hover:text-neutral-900 py-4 px-5 rounded-full text-xs tracking-[0.25em] uppercase font-medium transition-colors"
          aria-label="Back"
        >
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
        }`}
      >
        {nextLabel}
        <ArrowRight size={14} className={nextDisabled ? "" : "group-hover:translate-x-0.5 transition-transform"} />
      </button>
    </div>
  );
}

function HeightStep({ value, onChange, onNext, onBack }) {
  return (
    <div className="flex-1 flex flex-col anim-fade-up">
      <StepHeader
        kicker="01 — Height"
        title="How tall are you?"
        subtitle="Your height tells us your foot length within a centimetre or two."
      />

      <div className="bg-neutral-50 border border-neutral-200/70 rounded-2xl p-8 mb-4">
        <div className="text-center mb-6">
          <span className="font-display text-7xl tracking-tighter text-neutral-900">
            {value}
          </span>
          <span className="font-display italic text-2xl text-neutral-500 ml-2">cm</span>
        </div>

        <input
          type="range"
          min="140"
          max="210"
          step="1"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="w-full h-1 bg-neutral-200 rounded-full appearance-none cursor-pointer"
        />

        <div className="flex justify-between mt-2 text-[10px] tracking-[0.2em] uppercase text-neutral-400">
          <span>140 cm</span>
          <span>210 cm</span>
        </div>
      </div>

      <p className="flex items-start gap-2 text-xs text-neutral-500 leading-relaxed">
        <Info size={13} strokeWidth={1.5} className="flex-shrink-0 mt-0.5" />
        Drag the slider, or tap the number for an exact value.
      </p>

      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}

function GenderStep({ value, onChange, onBack }) {
  const options = [
    { id: "female", label: "Female", note: "" },
    { id: "male", label: "Male", note: "" },
    { id: "unisex", label: "Prefer not to say", note: "We'll use a unisex average" },
  ];
  return (
    <div className="flex-1 flex flex-col anim-fade-up">
      <StepHeader
        kicker="02 — About you"
        title="A small detail."
        subtitle="Foot-to-height ratios differ slightly. This sharpens our estimate by about 1%."
      />

      <div className="space-y-3">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`w-full text-left px-6 py-5 rounded-2xl border transition-all flex items-center justify-between ${
              value === opt.id
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 hover:border-neutral-400"
            }`}
          >
            <div>
              <p className="font-display text-xl">{opt.label}</p>
              {opt.note && (
                <p className={`text-xs mt-0.5 ${value === opt.id ? "text-white/60" : "text-neutral-500"}`}>
                  {opt.note}
                </p>
              )}
            </div>
            {value === opt.id && <Check size={18} strokeWidth={2} />}
          </button>
        ))}
      </div>

      <div className="mt-auto pt-8">
        <button
          onClick={onBack}
          className="text-[10px] tracking-[0.25em] uppercase text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-2"
        >
          <ArrowLeft size={12} /> Back
        </button>
      </div>
    </div>
  );
}

function BrandStep({ brand, usualSize, onBrandChange, onSizeChange, onNext, onBack }) {
  return (
    <div className="flex-1 flex flex-col anim-fade-up">
      <StepHeader
        kicker="03 — What you wear"
        title="What's your usual fit?"
        subtitle="Different brands size differently. We'll adjust for the brand you pick."
      />

      <div className="mb-6">
        <p className="text-[10px] tracking-[0.25em] uppercase text-neutral-500 mb-3">
          Brand you wear most
        </p>
        <div className="grid grid-cols-3 gap-2">
          {BRANDS.map((b) => (
            <button
              key={b}
              onClick={() => onBrandChange(b)}
              className={`px-3 py-3 rounded-xl border text-sm transition-all ${
                brand === b
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 hover:border-neutral-400 text-neutral-700"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-neutral-50 border border-neutral-200/70 rounded-2xl p-6">
        <p className="text-[10px] tracking-[0.25em] uppercase text-neutral-500 mb-3">
          Your usual UK size in {brand || "that brand"}
        </p>
        <div className="text-center mb-4">
          <span className="font-display text-6xl tracking-tighter text-neutral-900">
            {usualSize}
          </span>
          <span className="font-display italic text-xl text-neutral-500 ml-2">UK</span>
        </div>
        <input
          type="range"
          min="3"
          max="13"
          step="0.5"
          value={usualSize}
          onChange={(e) => onSizeChange(parseFloat(e.target.value))}
          className="w-full h-1 bg-neutral-200 rounded-full appearance-none cursor-pointer"
        />
        <div className="flex justify-between mt-2 text-[10px] tracking-[0.2em] uppercase text-neutral-400">
          <span>UK 3</span>
          <span>UK 13</span>
        </div>
      </div>

      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={!brand} />
    </div>
  );
}

function FitStep({ value, onChange, onBack }) {
  const options = [
    {
      id: "snug",
      label: "Snug",
      desc: "I like a close, locked-in feel",
    },
    {
      id: "standard",
      label: "Standard",
      desc: "Just right — not tight, not loose",
    },
    {
      id: "roomy",
      label: "Roomy",
      desc: "I like room to wiggle my toes",
    },
  ];
  return (
    <div className="flex-1 flex flex-col anim-fade-up">
      <StepHeader
        kicker="04 — Fit"
        title="How do you like it?"
        subtitle="Last one. Your fit preference fine-tunes the recommendation."
      />

      <div className="space-y-3">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`w-full text-left px-6 py-5 rounded-2xl border transition-all flex items-center justify-between ${
              value === opt.id
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 hover:border-neutral-400"
            }`}
          >
            <div>
              <p className="font-display text-xl mb-0.5">{opt.label}</p>
              <p className={`text-xs ${value === opt.id ? "text-white/60" : "text-neutral-500"}`}>
                {opt.desc}
              </p>
            </div>
            {value === opt.id && <Check size={18} strokeWidth={2} />}
          </button>
        ))}
      </div>

      <div className="mt-auto pt-8">
        <button
          onClick={onBack}
          className="text-[10px] tracking-[0.25em] uppercase text-neutral-500 hover:text-neutral-900 transition-colors flex items-center gap-2"
        >
          <ArrowLeft size={12} /> Back
        </button>
      </div>
    </div>
  );
}

function ResultStep({ result, added, onAdd, onReset }) {
  const confidenceLabel = {
    high: { text: "High confidence", color: "text-emerald-600", dot: "bg-emerald-500" },
    medium: { text: "Good confidence", color: "text-amber-600", dot: "bg-amber-500" },
    low: { text: "Worth a try-on", color: "text-neutral-600", dot: "bg-neutral-400" },
  }[result.confidence];

  return (
    <div className="flex-1 flex flex-col anim-fade-up pt-2">
      <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-3">
        Your Recommendation
      </p>
      <h2 className="font-display text-4xl md:text-5xl leading-[1.05] tracking-tight text-neutral-900 mb-2">
        We found <em className="italic font-light">your size</em>.
      </h2>

      <div className="flex items-center gap-2 mb-8">
        <span className={`w-1.5 h-1.5 rounded-full ${confidenceLabel.dot}`} />
        <span className={`text-xs ${confidenceLabel.color} font-medium`}>
          {confidenceLabel.text}
        </span>
      </div>

      {/* Hero size card */}
      <div className="relative bg-neutral-900 text-white rounded-2xl p-8 mb-4 overflow-hidden">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5 blur-3xl" />
        <div className="relative">
          <p className="text-[10px] tracking-[0.3em] uppercase text-white/50 mb-2">
            Ten × You — Recommended
          </p>
          <div className="flex items-baseline gap-3 mb-4">
            <span className="font-display text-[10rem] leading-none tracking-tighter">
              {result.primary}
            </span>
            <span className="font-display italic text-xl text-white/60">
              your TXY size
            </span>
          </div>
          <p className="text-sm text-white/70 leading-relaxed">{result.rationale}</p>
        </div>
      </div>

      {/* Alternative size */}
      {result.alternative && (
        <div className="bg-neutral-50 border border-neutral-200/70 rounded-2xl p-5 mb-6 flex items-center justify-between">
          <div>
            <p className="text-[10px] tracking-[0.25em] uppercase text-neutral-500 mb-1">
              Alternative
            </p>
            <p className="text-sm text-neutral-700">
              Try size <span className="font-display text-2xl text-neutral-900 mx-0.5">{result.alternative}</span>{" "}
              {result.altLabel}
            </p>
          </div>
          <Sparkles size={18} strokeWidth={1.5} className="text-neutral-400" />
        </div>
      )}

      {/* Conversions */}
      <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 mb-6">
        <p className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-4">
          International equivalents
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "UK", value: result.conversions.uk },
            { label: "US", value: result.conversions.us },
            { label: "EU", value: result.conversions.eu },
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
        <p className="text-[10px] text-neutral-400 mt-4 text-center">
          Estimated foot length from height: ~{result.estimatedCm} cm
        </p>
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
            Add to Cart · Ten × You Size {result.primary}
          </>
        )}
      </button>

      <button
        onClick={onReset}
        className="w-full py-3 text-xs tracking-[0.25em] uppercase text-neutral-500 hover:text-neutral-900 transition-colors"
      >
        Start over
      </button>
    </div>
  );
}
