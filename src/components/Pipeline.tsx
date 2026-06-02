import { Check, X, Loader2 } from "lucide-react";
import type { Analysis, StepKey, StepStatus } from "../lib/pipeline";

type Steps = Record<StepKey, StepStatus>;

type Props = {
  steps: Steps;
  analysis: Analysis | null;
  assetUrls: Record<string, string>;
  onZoom: (src: string, label: string, filename: string) => void;
};

const STEP_META: Record<StepKey, { num: number; title: string; foot: string }> = {
  upload: { num: 1, title: "Upload", foot: "Supplier image uploaded to Runflow assets" },
  vision: { num: 2, title: "Vision", foot: "gpt-4o reads the photo + picks 3 lifestyle scenes" },
  cleanup: { num: 3, title: "Cleanup", foot: "Strips watermarks, supplier text, prop hands (skipped if clean)" },
  cutout: { num: 4, title: "Cutout", foot: "runflow/product-isolation extracts the product" },
  scenes: { num: 5, title: "Scenes", foot: "gpt-image-2/edit · 4 scenes generated in parallel" },
  ratios: { num: 6, title: "Ratios", foot: "outpaint + smart-resize for TikTok / Reel / Meta ad" },
};

const STEP_ORDER: StepKey[] = ["upload", "vision", "cleanup", "cutout", "scenes", "ratios"];

function statusClass(s: StepStatus) {
  if (s === "running") return "border-amber-border shadow-[0_0_0_3px_var(--tw-shadow-color)] shadow-amber-soft";
  if (s === "done") return "border-green/30";
  if (s === "skipped") return "border-line opacity-70";
  if (s === "failed") return "border-red/30 bg-red-soft";
  return "border-line";
}

function statusBadge(s: StepStatus, n: number) {
  if (s === "running") {
    return (
      <span className="w-[22px] h-[22px] rounded-full border border-amber text-amber bg-panel flex items-center justify-center text-[11px] font-mono">
        <Loader2 className="w-3.5 h-3.5 animate-spin-slow" />
      </span>
    );
  }
  if (s === "done") {
    return (
      <span className="w-[22px] h-[22px] rounded-full bg-green border border-green text-white flex items-center justify-center">
        <Check className="w-3 h-3" strokeWidth={3} />
      </span>
    );
  }
  if (s === "failed") {
    return (
      <span className="w-[22px] h-[22px] rounded-full bg-red border border-red text-white flex items-center justify-center">
        <X className="w-3 h-3" strokeWidth={3} />
      </span>
    );
  }
  if (s === "skipped") {
    return (
      <span className="w-[22px] h-[22px] rounded-full border border-line text-faint bg-panel flex items-center justify-center text-[11px] font-mono">
        ·
      </span>
    );
  }
  return (
    <span className="w-[22px] h-[22px] rounded-full border border-line text-muted bg-panel flex items-center justify-center text-[11px] font-mono">
      {n}
    </span>
  );
}

export function Pipeline({ steps, analysis, assetUrls, onZoom }: Props) {
  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold mb-3.5">Pipeline</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {STEP_ORDER.map((key) => {
          const s = steps[key];
          const meta = STEP_META[key];
          return (
            <div
              key={key}
              className={"bg-panel border rounded-[10px] overflow-hidden flex flex-col transition-all " + statusClass(s)}
            >
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line bg-panel-2">
                {statusBadge(s, meta.num)}
                <span className="text-xs font-semibold flex-1">{meta.title}</span>
              </div>
              <div className="relative aspect-square bg-panel-2 flex items-center justify-center overflow-hidden">
                <StepBody stepKey={key} status={s} analysis={analysis} assetUrls={assetUrls} onZoom={onZoom} />
              </div>
              <div className="px-3 py-2.5 border-t border-line text-[11px] text-muted leading-snug">
                {meta.foot}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StepBody({
  stepKey,
  status,
  analysis,
  assetUrls,
  onZoom,
}: {
  stepKey: StepKey;
  status: StepStatus;
  analysis: Analysis | null;
  assetUrls: Record<string, string>;
  onZoom: (src: string, label: string, filename: string) => void;
}) {
  if (stepKey === "upload") {
    const src = assetUrls["__source"];
    if (!src) return <Placeholder text={status === "running" ? "uploading…" : "supplier image"} />;
    return <ZoomImg src={src} label="Supplier image" filename="source" onZoom={onZoom} />;
  }
  if (stepKey === "vision") {
    if (!analysis) return <Placeholder text={status === "running" ? "analyzing…" : "product analysis"} />;
    return (
      <div className="absolute inset-0 p-3 overflow-y-auto flex flex-col gap-1.5 text-[11px] leading-snug text-ink-2">
        <KV k="Product" v={analysis.product} />
        <KV k="Category" v={analysis.category} />
        <KV k="Cleanup" v={analysis.cleanup_prompt || "none"} mono />
        {analysis.reference_style ? (
          <>
            <div className="border-t border-dashed border-line mt-1 pt-1.5 text-amber font-bold uppercase text-[9px] tracking-wider font-mono">
              Reference style
            </div>
            {Object.entries(analysis.reference_style)
              .filter(([, v]) => !!v)
              .map(([k, v]) => (
                <KV key={k} k={k} v={String(v)} sub />
              ))}
          </>
        ) : null}
        {analysis.lifestyle_scenes?.map((s, i) => (
          <KV key={i} k={`Scene ${String.fromCharCode(65 + i)}`} v={s} />
        ))}
      </div>
    );
  }
  if (stepKey === "cleanup") {
    if (status === "skipped") return <Placeholder text="skipped — image already clean" />;
    return <Placeholder text={status === "running" ? "cleaning…" : "conditional"} />;
  }
  if (stepKey === "cutout") {
    const src = assetUrls.cutout;
    if (!src) return <Placeholder text={status === "running" ? "extracting…" : "RGBA cutout"} />;
    return (
      <div className="absolute inset-0 checker flex items-center justify-center">
        <ZoomImg src={src} label="RGBA cutout" filename="01_cutout.png" onZoom={onZoom} />
      </div>
    );
  }
  if (stepKey === "scenes") {
    const urls: Array<[string, string, string]> = [
      [assetUrls.white, "White studio (Amazon main)", "02_white_studio.jpg"],
      [assetUrls.life_a, "Lifestyle A", "03_lifestyle_a.jpg"],
      [assetUrls.life_b, "Lifestyle B", "04_lifestyle_b.jpg"],
      [assetUrls.life_c, "Lifestyle C", "05_lifestyle_c.jpg"],
    ];
    const anyLoaded = urls.some(([u]) => !!u);
    if (!anyLoaded) return <Placeholder text={status === "running" ? "generating…" : "white + 3 lifestyle (parallel)"} />;
    return (
      <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-[2px] p-1">
        {urls.map(([src, label, fn], i) =>
          src ? (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onZoom(src, label, fn); }}
              className="overflow-hidden rounded-sm bg-panel cursor-zoom-in"
            >
              <img src={src} className="w-full h-full object-cover" />
            </button>
          ) : (
            <div key={i} className="bg-panel rounded-sm" />
          )
        )}
      </div>
    );
  }
  if (stepKey === "ratios") {
    const heroUrl = assetUrls.hero;
    const adUrl = assetUrls.ad;
    if (!heroUrl && !adUrl) return <Placeholder text={status === "running" ? "framing…" : "9:16 hero + 1:1 ad"} />;
    return (
      <div className="w-full h-full grid grid-cols-2 gap-[2px] p-1">
        {[
          [heroUrl, "9:16 hero (TikTok / Reel)", "06_hero_9x16.jpg", "9:16"],
          [adUrl, "1:1 ad creative", "07_ad_1x1.jpg", "1:1"],
        ].map(([src, label, fn, tag], i) =>
          src ? (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onZoom(src as string, label as string, fn as string); }}
              className="relative overflow-hidden rounded-sm bg-panel cursor-zoom-in"
            >
              <img src={src as string} className="w-full h-full object-cover" />
              <span className="absolute bottom-1 left-1 text-[9px] font-mono font-bold uppercase tracking-wider bg-black/60 text-white px-1.5 py-[3px] rounded">
                {tag as string}
              </span>
            </button>
          ) : (
            <div key={i} className="bg-panel rounded-sm" />
          )
        )}
      </div>
    );
  }
  return null;
}

function KV({ k, v, sub, mono }: { k: string; v: string; sub?: boolean; mono?: boolean }) {
  return (
    <div className={"flex flex-col gap-0.5 " + (sub ? "pl-1.5" : "")}>
      <span className={"font-mono uppercase tracking-wider font-bold " + (sub ? "text-[8px] text-faint" : "text-[9px] text-muted")}>
        {k}
      </span>
      <span className={"text-ink-2 " + (mono ? "font-mono bg-panel-2 px-1.5 py-0.5 rounded text-[10px] text-amber inline-block w-fit" : "")}>
        {v}
      </span>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-faint text-[11px] uppercase tracking-wider text-center px-3">
      {text}
    </div>
  );
}

function ZoomImg({
  src,
  label,
  filename,
  onZoom,
}: {
  src: string;
  label: string;
  filename: string;
  onZoom: (src: string, label: string, filename: string) => void;
}) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onZoom(src, label, filename); }} className="absolute inset-0 cursor-zoom-in">
      <img src={src} className="w-full h-full object-contain" />
    </button>
  );
}
