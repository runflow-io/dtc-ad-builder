import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "./components/Header";
import { SettingsModal } from "./components/SettingsModal";
import { HowToStartModal } from "./components/HowToStartModal";
import { Dropzone } from "./components/Dropzone";
import { OperationPicker } from "./components/OperationPicker";
import { PlatformPicker } from "./components/PlatformPicker";
import { Pipeline } from "./components/Pipeline";
import { ResultGrid } from "./components/ResultGrid";
import { HowItWorks } from "./components/HowItWorks";
import { Tabs, type Tab } from "./components/Tabs";
import { PacksGallery } from "./components/PacksGallery";
import { PackDetail } from "./components/PackDetail";
import { Lightbox, type LightboxItem } from "./components/Lightbox";
import { loadKeys, saveKeys, type Keys } from "./lib/keys";
import { runPipeline, type Analysis, type AssetFile, type StepKey, type StepStatus } from "./lib/pipeline";
import { savePack, listPacks, type RecentPack } from "./lib/history";
import { buildZip } from "./lib/zip";
import type { Operation, Platform } from "./lib/options";
import { uniqueRatios } from "./lib/options";

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
  const [howToOpen, setHowToOpen] = useState(false);

  const [source, setSource] = useState<File | null>(null);
  const [reference, setReference] = useState<File | null>(null);

  // Sensible defaults — closest equivalent to the original 7-asset brand pack.
  const [operations, setOperations] = useState<Operation[]>([
    "isolate",
    "background_replace",
    "lifestyle_scenes",
  ]);
  const [platforms, setPlatforms] = useState<Platform[]>([
    "tiktok",
    "instagram_feed",
  ]);

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

  // tab state + pack-detail state
  const [tab, setTab] = useState<Tab>("generate");
  const [openedPack, setOpenedPack] = useState<RecentPack | null>(null);
  const [workflowsUsed, setWorkflowsUsed] = useState<string[]>([]);
  const [packsCount, setPacksCount] = useState(0);

  // count of packs (for tab badge) — refreshed whenever recentTick bumps
  useEffect(() => {
    listPacks(100).then((p) => setPacksCount(p.length));
  }, [recentTick]);

  // open how-to-start automatically on first ever visit (no keys yet, no prior pack)
  const firstMount = useRef(true);
  useEffect(() => {
    if (firstMount.current) {
      firstMount.current = false;
      if (!keys.runflow || !keys.openai) setHowToOpen(true);
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
  const ready = keysOk && !!source && operations.length > 0 && !running;

  const ctaHint = useMemo(() => {
    if (!keysOk) return "Add API keys in settings to enable";
    if (!source) return "Drop a supplier image to enable";
    if (operations.length === 0) return "Pick at least one operation to enable";
    if (running) return "Generating…";
    const ratios = uniqueRatios(platforms).filter((r) => r !== "1:1");
    const sceneCount =
      (operations.includes("background_replace") ? 1 : 0) +
      (operations.includes("lifestyle_scenes") ? 3 : 0);
    const ratioCount = sceneCount * ratios.length;
    const baseCount =
      (operations.includes("isolate") ? 1 : 0) +
      sceneCount +
      (operations.includes("remove_object") ? 1 : 0);
    const total = baseCount + ratioCount;
    return `Ready · ${total} asset${total === 1 ? "" : "s"} · ~${30 + (sceneCount + ratioCount) * 15}s`;
  }, [keysOk, source, running, operations, platforms]);

  // Each consumer (Pipeline, ResultGrid, PackDetail) builds its OWN ordered
  // list of LightboxItems and hands it to onZoom. This decouples the lightbox
  // from any single source of truth for assetUrls — important because
  // PackDetail's URLs are local to that component.
  const onZoom = (items: LightboxItem[], startIndex: number) => {
    if (!items.length) return;
    setLbItems(items);
    setLbIndex(startIndex >= 0 && startIndex < items.length ? startIndex : 0);
  };

  const resetForNew = () => {
    setSteps(INITIAL_STEPS);
    setAnalysis(null);
    setAssets([]);
    setError(null);
    setWorkflowsUsed([]);
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
    setOpenedPack(null);
    setTab("generate");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onRun = async () => {
    if (!source) return;
    if (!keysOk) { setSettingsOpen(true); return; }

    resetForNew();
    setRunning(true);
    setTab("processing"); // auto-switch the user to the Processing tab
    const id = newJobId();
    setJobId(id);

    // show source thumbnail immediately
    const sourceUrl = URL.createObjectURL(source);
    setAssetUrls((prev) => ({ ...prev, __source: sourceUrl }));

    setSteps({ ...INITIAL_STEPS, upload: "running" });

    const collected: AssetFile[] = [];
    const workflowAcc: string[] = [];

    try {
      const result = await runPipeline(
        { source, reference, operations, platforms, keys },
        (u) => {
          if (u.type === "step") {
            setSteps((prev) => ({ ...prev, [u.key]: u.status }));
          } else if (u.type === "analysis") {
            setAnalysis(u.analysis);
          } else if (u.type === "asset") {
            // labels come from the pipeline itself now (dynamic per selection)
            collected.push({ key: u.key, blob: u.blob, filename: u.filename, label: "" });
            const blobUrl = URL.createObjectURL(u.blob);
            setAssetUrls((prev) => ({ ...prev, [u.key]: blobUrl }));
          } else if (u.type === "workflow") {
            workflowAcc.push(u.slug);
            setWorkflowsUsed((prev) => (prev.includes(u.slug) ? prev : [...prev, u.slug]));
          }
        }
      );

      // pipeline owns the labels — App just preserves them via the AssetFile
      const finalAssets: AssetFile[] = collected;
      setAssets(finalAssets);

      // zip
      const zipBlob = await buildZip(finalAssets);
      setZipUrl(URL.createObjectURL(zipBlob));

      // persist to history (use white studio as thumbnail, or first lifestyle, or cutout)
      const thumbAsset =
        finalAssets.find((a) => a.key === "life_a") ||
        finalAssets.find((a) => a.key === "white") ||
        finalAssets.find((a) => a.key === "cutout") ||
        finalAssets[0];
      if (thumbAsset) {
        const pack: RecentPack = {
          id,
          createdAt: Date.now(),
          product: (analysis?.product) || (await collectedAnalysisProduct()) || "Pack",
          category: analysis?.category || "",
          analysis: analysis as Analysis,
          thumb: thumbAsset.blob,
          thumbName: thumbAsset.filename,
          assets: finalAssets.map((a) => ({ key: a.key, label: a.label, filename: a.filename, blob: a.blob })),
          workflows: result.workflows || workflowAcc,
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

  const onOpenRecent = (pack: RecentPack) => {
    setOpenedPack(pack);
    setTab("packs");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onClosePackDetail = () => {
    setOpenedPack(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="max-w-[1280px] mx-auto px-8 pt-12 pb-20">
      <Header
        keysOk={keysOk}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHowToStart={() => setHowToOpen(true)}
      />

      <section className="mb-7">
        <div className="font-mono uppercase tracking-widest text-[11px] text-amber font-bold mb-2.5">
          Runflow template · v0.3
        </div>
        <h1 className="font-bold text-[34px] leading-[1.1] tracking-tight mb-2.5">
          Upload one supplier photo. Pick what to do. Get a store-ready pack.
        </h1>
      </section>

      <Tabs active={tab} onChange={setTab} processing={running} packsCount={packsCount} />

      {/* === TAB 1 — GENERATE === */}
      {tab === "generate" ? (
        <>
          <HowItWorks />

          <section className="mb-10 space-y-7">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Dropzone
                label="1 · Supplier image"
                required
                hint="Drop the supplier photo"
                subHint="Any AliExpress / 1688 / Alibaba / supplier image you saved"
                file={source}
                onChange={setSource}
              />
              <Dropzone
                label="2 · Reference style"
                hint="Match the look of an ad you like"
                subHint="Save a frame from a Meta / TikTok / IG ad you want to mimic. We'll match its lighting, palette, mood for the lifestyle scenes. Skip for AI-picked scenes."
                file={reference}
                onChange={setReference}
              />
            </div>

            <div>
              <div className="flex items-end justify-between mb-3">
                <div>
                  <div className="font-mono uppercase tracking-wider text-[11px] text-muted font-semibold mb-0.5">
                    3 · What to do
                  </div>
                  <div className="text-[12px] text-ink-2">
                    Pick one or more. Mask-based ops auto-detect their region via{" "}
                    <code className="bg-panel-2 px-1.5 py-0.5 rounded font-mono text-[10px] text-amber">
                      runflow/smart-segmentation
                    </code>{" "}— no manual masking.
                  </div>
                </div>
              </div>
              <OperationPicker selected={operations} onChange={setOperations} />
            </div>

            <div>
              <div className="flex items-end justify-between mb-3">
                <div>
                  <div className="font-mono uppercase tracking-wider text-[11px] text-muted font-semibold mb-0.5">
                    4 · Where you'll publish
                  </div>
                  <div className="text-[12px] text-ink-2">
                    Each picked platform's aspect ratios run through{" "}
                    <code className="bg-panel-2 px-1.5 py-0.5 rounded font-mono text-[10px] text-amber">
                      runflow/smart-resize
                    </code>{" "}— one zip with every variant. Skip to keep base 1:1 only.
                  </div>
                </div>
              </div>
              <PlatformPicker selected={platforms} onChange={setPlatforms} />
            </div>

            <div className="flex items-center gap-3.5">
              <button
                onClick={onRun}
                disabled={!ready}
                className="px-5 py-3 bg-ink hover:bg-amber text-white text-sm font-semibold rounded-md transition-colors shadow-soft disabled:bg-faint disabled:cursor-not-allowed"
              >
                Generate pack →
              </button>
              <span className="text-muted text-xs">{ctaHint}</span>
            </div>
          </section>
        </>
      ) : null}

      {/* === TAB 2 — PROCESSING === */}
      {tab === "processing" ? (
        <section className="mb-10">
          <div className="mb-5">
            <h2 className="text-lg font-semibold mb-1">
              {running ? "Building your pack…" : error ? "Pipeline failed" : "Pack ready"}
            </h2>
            <p className="text-xs text-muted">
              {running
                ? "Hold tight — this tab updates live as each step finishes."
                : error
                ? "Something went wrong mid-run. Details below."
                : "All assets generated. Download below or jump to your collection."}
            </p>
          </div>

          {jobId ? (
            <Pipeline steps={steps} analysis={analysis} assetUrls={assetUrls} onZoom={onZoom} />
          ) : null}

          {error ? (
            <section className="mb-10 bg-red-soft border border-red/30 rounded-[10px] p-5">
              <h2 className="text-red font-semibold mb-2">Pipeline failed</h2>
              <pre className="font-mono text-xs text-red whitespace-pre-wrap m-0">{error}</pre>
            </section>
          ) : null}

          {!running && assets.length > 0 ? (
            <>
              <ResultGrid
                assets={assets}
                assetUrls={assetUrls}
                zipUrl={zipUrl}
                jobId={jobId}
                onZoom={onZoom}
              />
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setTab("packs")}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-ink hover:bg-amber text-white text-sm font-semibold rounded-md transition-colors shadow-soft"
                >
                  View in Packs collection →
                </button>
                <button
                  onClick={onNewPack}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-ink-2 hover:bg-panel-2 text-sm font-semibold rounded-md transition-colors"
                >
                  Generate another
                </button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {/* === TAB 3 — PACKS COLLECTION === */}
      {tab === "packs" ? (
        openedPack ? (
          <PackDetail pack={openedPack} onClose={onClosePackDetail} onZoom={onZoom} />
        ) : (
          <PacksGallery refreshKey={recentTick} onOpen={onOpenRecent} onNew={onNewPack} />
        )
      ) : null}

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

      <HowToStartModal
        open={howToOpen}
        onClose={() => setHowToOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
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
