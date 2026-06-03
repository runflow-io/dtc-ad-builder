import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "./components/Header";
import { SettingsModal } from "./components/SettingsModal";
import { Dropzone } from "./components/Dropzone";
import { Pipeline } from "./components/Pipeline";
import { ResultGrid } from "./components/ResultGrid";
import { RecentPacks } from "./components/RecentPacks";
import { Lightbox, type LightboxItem } from "./components/Lightbox";
import { loadKeys, saveKeys, type Keys } from "./lib/keys";
import { runPipeline, type Analysis, type AssetFile, type StepKey, type StepStatus } from "./lib/pipeline";
import { savePack, type RecentPack } from "./lib/history";
import { buildZip } from "./lib/zip";

type Steps = Record<StepKey, StepStatus>;

const INITIAL_STEPS: Steps = {
  upload: "pending",
  vision: "pending",
  cleanup: "pending",
  cutout: "pending",
  scenes: "pending",
  ratios: "pending",
};

function newJobId() {
  return Math.random().toString(36).slice(2, 14);
}

export default function App() {
  const [keys, setKeys] = useState<Keys>(() => loadKeys());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [source, setSource] = useState<File | null>(null);
  const [reference, setReference] = useState<File | null>(null);

  const [steps, setSteps] = useState<Steps>(INITIAL_STEPS);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [assets, setAssets] = useState<AssetFile[]>([]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string>("");
  const [recentTick, setRecentTick] = useState(0);

  const [lbItems, setLbItems] = useState<LightboxItem[] | null>(null);
  const [lbIndex, setLbIndex] = useState(0);

  // open settings automatically on first load if keys missing
  const firstMount = useRef(true);
  useEffect(() => {
    if (firstMount.current) {
      firstMount.current = false;
      if (!keys.runflow || !keys.openai) setSettingsOpen(true);
    }
  }, [keys.runflow, keys.openai]);

  // revoke object URLs on unmount / asset reset
  useEffect(() => {
    return () => {
      Object.values(assetUrls).forEach((u) => u.startsWith("blob:") && URL.revokeObjectURL(u));
      if (zipUrl) URL.revokeObjectURL(zipUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keysOk = !!(keys.runflow && keys.openai);
  const ready = keysOk && !!source && !running;

  const ctaHint = useMemo(() => {
    if (!keysOk) return "Add API keys in settings to enable";
    if (!source) return "Drop a supplier image to enable";
    if (running) return "Generating…";
    if (reference) return "Ready · scenes will match the reference style · ~90s";
    return "Ready · AI will pick lifestyle scenes · ~90s";
  }, [keysOk, source, running, reference]);

  // === collect a fresh, deduped, ordered lightbox set whenever an image is clicked ===
  const buildLightboxItems = (clickedSrc: string): { items: LightboxItem[]; index: number } => {
    const ordered: Array<{ src: string; label: string; filename: string }> = [];
    const seen = new Set<string>();

    const push = (src: string | undefined, label: string, filename: string) => {
      if (!src || seen.has(src)) return;
      seen.add(src);
      ordered.push({ src, label, filename });
    };

    push(assetUrls["__source"], "Supplier image", "source");
    push(assetUrls.cutout, "RGBA cutout", "01_cutout.png");
    push(assetUrls.white, "White studio (Amazon main)", "02_white_studio.jpg");
    push(assetUrls.life_a, "Lifestyle A", "03_lifestyle_a.jpg");
    push(assetUrls.life_b, "Lifestyle B", "04_lifestyle_b.jpg");
    push(assetUrls.life_c, "Lifestyle C", "05_lifestyle_c.jpg");
    push(assetUrls.hero, "9:16 hero (TikTok / Reel)", "06_hero_9x16.jpg");
    push(assetUrls.ad, "1:1 ad creative", "07_ad_1x1.jpg");

    let idx = ordered.findIndex((i) => i.src === clickedSrc);
    if (idx < 0) idx = 0;
    return { items: ordered, index: idx };
  };

  const onZoom = (src: string, _label: string, _filename: string) => {
    const { items, index } = buildLightboxItems(src);
    if (!items.length) return;
    setLbItems(items);
    setLbIndex(index);
  };

  const resetForNew = () => {
    setSteps(INITIAL_STEPS);
    setAnalysis(null);
    setAssets([]);
    setError(null);
    // revoke previous asset urls
    Object.values(assetUrls).forEach((u) => u.startsWith("blob:") && URL.revokeObjectURL(u));
    setAssetUrls({});
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setZipUrl(null);
    setJobId("");
  };

  const onNewPack = () => {
    resetForNew();
    setSource(null);
    setReference(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onRun = async () => {
    if (!source) return;
    if (!keysOk) { setSettingsOpen(true); return; }

    resetForNew();
    setRunning(true);
    const id = newJobId();
    setJobId(id);

    // show source thumbnail immediately
    const sourceUrl = URL.createObjectURL(source);
    setAssetUrls((prev) => ({ ...prev, __source: sourceUrl }));

    setSteps({ ...INITIAL_STEPS, upload: "running" });

    const collected: AssetFile[] = [];

    try {
      await runPipeline(
        { source, reference, keys },
        (u) => {
          if (u.type === "step") {
            setSteps((prev) => ({ ...prev, [u.key]: u.status }));
          } else if (u.type === "analysis") {
            setAnalysis(u.analysis);
          } else if (u.type === "asset") {
            collected.push({ key: u.key, blob: u.blob, filename: u.filename, label: "" });
            const blobUrl = URL.createObjectURL(u.blob);
            setAssetUrls((prev) => ({ ...prev, [u.key]: blobUrl }));
          }
        }
      );

      // build the final asset list with labels
      const labelMap: Record<string, string> = {
        cutout: "RGBA cutout",
        white: "White studio (Amazon main)",
        life_a: "Lifestyle A",
        life_b: "Lifestyle B",
        life_c: "Lifestyle C",
        hero: "9:16 hero (TikTok / Reel)",
        ad: "1:1 ad creative",
      };
      const finalAssets: AssetFile[] = collected.map((a) => ({ ...a, label: labelMap[a.key] || a.key }));
      setAssets(finalAssets);

      // zip
      const zipBlob = await buildZip(finalAssets);
      setZipUrl(URL.createObjectURL(zipBlob));

      // persist to history (use white studio as thumbnail, or first lifestyle)
      const thumbAsset = finalAssets.find((a) => a.key === "life_a") || finalAssets.find((a) => a.key === "white") || finalAssets[0];
      if (thumbAsset) {
        const pack: RecentPack = {
          id,
          createdAt: Date.now(),
          product: (analysis?.product) || (await collectedAnalysisProduct()) || "Brand pack",
          category: analysis?.category || "",
          analysis: analysis as Analysis,
          thumb: thumbAsset.blob,
          thumbName: thumbAsset.filename,
          assets: finalAssets.map((a) => ({ key: a.key, label: a.label, filename: a.filename, blob: a.blob })),
        };
        await savePack(pack);
        setRecentTick((t) => t + 1);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      setError(msg);
      setSteps((prev) => {
        const next = { ...prev };
        (Object.keys(next) as StepKey[]).forEach((k) => {
          if (next[k] === "running") next[k] = "failed";
        });
        return next;
      });
    } finally {
      setRunning(false);
    }
  };

  // small helper: read the latest analysis from state at the time savePack runs
  // (analysis state may not be flushed yet inside the same tick — fall back gracefully)
  const collectedAnalysisProduct = async () => analysis?.product || "";

  const onOpenRecent = async (pack: RecentPack) => {
    resetForNew();
    setJobId(pack.id);
    setAnalysis(pack.analysis);
    setSteps({
      upload: "done",
      vision: "done",
      cleanup: pack.analysis?.cleanup_prompt && pack.analysis.cleanup_prompt !== "none" ? "done" : "skipped",
      cutout: "done",
      scenes: "done",
      ratios: "done",
    });
    const urls: Record<string, string> = {};
    pack.assets.forEach((a) => { urls[a.key] = URL.createObjectURL(a.blob); });
    setAssetUrls(urls);
    setAssets(pack.assets.map((a) => ({ key: a.key, label: a.label, filename: a.filename, blob: a.blob })));
    const zipBlob = await buildZip(pack.assets);
    setZipUrl(URL.createObjectURL(zipBlob));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="max-w-[1280px] mx-auto px-8 pt-12 pb-20">
      <Header keysOk={keysOk} onOpenSettings={() => setSettingsOpen(true)} />

      <section className="mb-9">
        <div className="font-mono uppercase tracking-widest text-[11px] text-amber font-bold mb-2.5">
          Runflow template · v0.1
        </div>
        <h1 className="font-bold text-[36px] leading-[1.1] tracking-tight mb-2.5">
          Turn one supplier photo into a store-ready brand pack.
        </h1>
        <p className="text-ink-2 text-sm leading-relaxed max-w-[760px]">
          Drop an AliExpress, 1688, or Alibaba product image. We extract the product,
          clean up watermarks, and generate a 7-asset pack: cutout, white-background studio,
          3 lifestyle scenes (auto-picked per product category), 9:16 hero, 1:1 ad creative.
          ~90 seconds per product. Pay-as-you-go via your own Runflow + OpenAI keys.
        </p>
      </section>

      <RecentPacks refreshKey={recentTick} onOpen={onOpenRecent} onNew={onNewPack} />

      <section className="mb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Dropzone
            label="1 · Supplier image"
            required
            hint="Drop the supplier photo"
            subHint="Right-click any AliExpress / 1688 / Alibaba product image → save → drop here"
            file={source}
            onChange={setSource}
          />
          <Dropzone
            label="2 · Reference style"
            hint="Match the look of an ad you like"
            subHint="Save a frame from a Meta / TikTok / IG ad you want to mimic. We'll match its lighting, palette, mood for the 3 lifestyle scenes. Leave empty for AI-picked scenes."
            file={reference}
            onChange={setReference}
          />
        </div>
        <div className="flex items-center gap-3.5 mt-5">
          <button
            onClick={onRun}
            disabled={!ready}
            className="px-5 py-3 bg-ink hover:bg-amber text-white text-sm font-semibold rounded-md transition-colors shadow-soft disabled:bg-faint disabled:cursor-not-allowed"
          >
            Generate brand pack →
          </button>
          <span className="text-muted text-xs">{ctaHint}</span>
        </div>
      </section>

      {jobId ? (
        <Pipeline steps={steps} analysis={analysis} assetUrls={assetUrls} onZoom={onZoom} />
      ) : null}

      {error ? (
        <section className="mb-10 bg-red-soft border border-red/30 rounded-[10px] p-5">
          <h2 className="text-red font-semibold mb-2">Pipeline failed</h2>
          <pre className="font-mono text-xs text-red whitespace-pre-wrap m-0">{error}</pre>
        </section>
      ) : null}

      <ResultGrid assets={assets} assetUrls={assetUrls} zipUrl={zipUrl} jobId={jobId} onZoom={onZoom} />

      <footer className="text-muted text-xs border-t border-line pt-5 mt-16">
        Runflow · Replit template · forks live in your browser only — no servers, no DB,
        keys stored in localStorage. Pay-as-you-go via your own{" "}
        <a href="https://app.runflow.io" target="_blank" rel="noreferrer" className="text-amber hover:underline">Runflow</a>{" "}
        and{" "}
        <a href="https://platform.openai.com" target="_blank" rel="noreferrer" className="text-amber hover:underline">OpenAI</a>{" "}
        accounts.
      </footer>

      <SettingsModal
        open={settingsOpen}
        initial={keys}
        onClose={() => setSettingsOpen(false)}
        onSave={(k) => { setKeys(k); saveKeys(k); setSettingsOpen(false); }}
      />

      {lbItems ? (
        <Lightbox
          items={lbItems}
          index={lbIndex}
          onClose={() => setLbItems(null)}
          onIndexChange={setLbIndex}
        />
      ) : null}
    </div>
  );
}
