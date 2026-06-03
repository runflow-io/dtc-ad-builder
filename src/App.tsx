import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "./components/Header";
import { SettingsModal } from "./components/SettingsModal";
import { HowToStartModal } from "./components/HowToStartModal";
import { Dropzone } from "./components/Dropzone";
import { OperationPicker } from "./components/OperationPicker";
import { PlatformPicker } from "./components/PlatformPicker";
import { PresetPicker, detectPreset, type PresetKey } from "./components/PresetPicker";
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  // derive which preset matches the current operations
  const currentPreset: PresetKey = detectPreset(operations);

  const onPresetChange = (key: PresetKey, ops: Operation[]) => {
    if (key === "custom") {
      setShowAdvanced(true);
      // keep current ops, just reveal advanced
      return;
    }
    setOperations(ops);
    setShowAdvanced(false);
  };

  // Auto-strip lifestyle_scenes from operations when the user removes the
  // reference image — keeps the selection in a valid state without surprising
  // the user with a downstream "generate disabled" error.
  useEffect(() => {
    if (!reference && operations.includes("lifestyle_scenes")) {
      setOperations((prev) => prev.filter((o) => o !== "lifestyle_scenes"));
    }
  }, [reference, operations]);

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
  // The pack that was just generated and is waiting to be viewed (consumed
  // when the user clicks the 'View your pack' CTA or starts a new pack).
  const [latestPack, setLatestPack] = useState<RecentPack | null>(null);

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
  const lifestyleWithoutRef = operations.includes("lifestyle_scenes") && !reference;
  const ready =
    keysOk && !!source && operations.length > 0 && !running && !lifestyleWithoutRef;

  // Asset-count breakdown — computed independently of upload state so the
  // user can see what they'll get before dropping the image.
  const packBreakdown = useMemo(() => {
    const ratios = uniqueRatios(platforms).filter((r) => r !== "1:1");
    const sceneCount =
      (operations.includes("background_replace") ? 1 : 0) +
      (operations.includes("lifestyle_scenes") ? 3 : 0);
    const ratioCount = sceneCount * ratios.length;
    const cutout = operations.includes("isolate") ? 1 : 0;
    const cleaned = operations.includes("remove_object") ? 1 : 0;
    const ghost = operations.includes("remove_model") ? 1 : 0;
    const baseCount = cutout + cleaned + ghost + sceneCount;
    const total = baseCount + ratioCount;
    const etaSec = 30 + (sceneCount + ratioCount) * 15;
    const parts: string[] = [];
    if (cutout) parts.push("1 cutout");
    if (cleaned) parts.push("1 cleaned");
    if (ghost) parts.push("1 ghost mannequin");
    if (operations.includes("background_replace")) parts.push("1 studio");
    if (operations.includes("lifestyle_scenes")) parts.push("3 lifestyle scenes");
    if (ratios.length) parts.push(`× ${ratios.length} extra ratio${ratios.length === 1 ? "" : "s"}`);
    return { total, etaSec, parts };
  }, [operations, platforms]);

  const ctaHint = useMemo(() => {
    if (!keysOk) return "Add API keys in settings to enable";
    if (!source) return "Drop a supplier image to enable";
    if (operations.length === 0) return "Pick at least one operation to enable";
    if (lifestyleWithoutRef) return "Lifestyle scenes need a reference style image — drop one in slot 2";
    if (running) return "Generating…";
    return `Ready · ~${packBreakdown.etaSec}s`;
  }, [keysOk, source, running, operations, lifestyleWithoutRef, packBreakdown]);

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
    setLatestPack(null);
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
            // labels + description come from the pipeline (dynamic per selection)
            collected.push({
              key: u.key,
              label: u.label,
              description: u.description,
              blob: u.blob,
              filename: u.filename,
            });
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
          assets: finalAssets.map((a) => ({
            key: a.key,
            label: a.label,
            description: a.description,
            filename: a.filename,
            blob: a.blob,
          })),
          workflows: result.workflows || workflowAcc,
        };
        await savePack(pack);
        setLatestPack(pack);
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

      <Tabs
        active={tab}
        onChange={setTab}
        processing={running}
        packReady={!!latestPack}
        packsCount={packsCount}
      />

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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-7">
              {/* 3 — operations (left column) */}
              <div>
                <div className="mb-3">
                  <div className="font-mono uppercase tracking-wider text-[11px] text-muted font-semibold mb-0.5">
                    3 · What to do
                  </div>
                  <div className="text-[12px] text-ink-2">
                    Pick a preset that fits your input — or expand Advanced to mix individually.
                  </div>
                </div>
                <PresetPicker
                  selected={currentPreset}
                  hasReference={!!reference}
                  onChange={onPresetChange}
                />
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="text-xs text-amber font-semibold hover:underline"
                  >
                    {showAdvanced ? "Hide advanced" : "Show advanced — pick individual operations"}
                  </button>
                  {showAdvanced ? (
                    <div className="mt-3">
                      <OperationPicker
                        selected={operations}
                        hasReference={!!reference}
                        onChange={setOperations}
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              {/* 4 — platforms (right column) */}
              <div>
                <div className="mb-3">
                  <div className="font-mono uppercase tracking-wider text-[11px] text-muted font-semibold mb-0.5">
                    4 · Where you'll publish
                  </div>
                  <div className="text-[12px] text-ink-2">
                    Each ratio runs through{" "}
                    <code className="bg-panel-2 px-1 py-0.5 rounded font-mono text-[10px] text-amber">
                      runflow/smart-resize
                    </code>{" "}— one zip with every variant.
                  </div>
                </div>
                <PlatformPicker selected={platforms} onChange={setPlatforms} />
              </div>
            </div>

            <div className="flex items-center gap-3.5 flex-wrap">
              <button
                onClick={onRun}
                disabled={!ready}
                className="px-5 py-3 bg-ink hover:bg-amber text-white text-sm font-semibold rounded-md transition-colors shadow-soft disabled:bg-faint disabled:cursor-not-allowed"
              >
                Generate pack →
              </button>
              {packBreakdown.total > 0 ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-panel border border-line rounded-full">
                  <span className="font-mono font-bold text-[13px] text-amber">
                    {packBreakdown.total}
                  </span>
                  <span className="text-[11px] text-ink-2">
                    image{packBreakdown.total === 1 ? "" : "s"} ·{" "}
                    <span className="text-muted">{packBreakdown.parts.join(" · ")}</span>
                  </span>
                </div>
              ) : null}
              <span className="text-muted text-xs">{ctaHint}</span>
            </div>
          </section>
        </>
      ) : null}

      {/* === TAB 2 — PROCESSING === */}
      {tab === "processing" ? (
        <section className="mb-10">
          {running ? (
            // ---- Running state: live pipeline ----
            <>
              <div className="mb-5">
                <h2 className="text-lg font-semibold mb-1">Building your pack…</h2>
                <p className="text-xs text-muted">
                  Hold tight — this tab updates live as each step finishes.
                </p>
              </div>
              {jobId ? (
                <Pipeline steps={steps} analysis={analysis} assetUrls={assetUrls} onZoom={onZoom} />
              ) : null}
            </>
          ) : error ? (
            // ---- Error state ----
            <>
              <div className="mb-5">
                <h2 className="text-lg font-semibold mb-1 text-red">Pipeline failed</h2>
                <p className="text-xs text-muted">
                  Something went wrong mid-run. Details below.
                </p>
              </div>
              {jobId ? (
                <Pipeline steps={steps} analysis={analysis} assetUrls={assetUrls} onZoom={onZoom} />
              ) : null}
              <section className="mt-7 bg-red-soft border border-red/30 rounded-[10px] p-5">
                <pre className="font-mono text-xs text-red whitespace-pre-wrap m-0">{error}</pre>
              </section>
              <div className="mt-5">
                <button
                  onClick={onNewPack}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink hover:bg-amber text-white text-sm font-semibold rounded-md transition-colors shadow-soft"
                >
                  + Create a new pack
                </button>
              </div>
            </>
          ) : latestPack ? (
            // ---- Just completed: single CTA to view the pack ----
            <div className="bg-panel border border-line rounded-2xl p-10 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-soft text-green mb-4">
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <div className="font-mono uppercase tracking-widest text-[11px] text-amber font-bold mb-2">
                Pack ready
              </div>
              <h2 className="text-2xl font-bold mb-2">{latestPack.product}</h2>
              <p className="text-sm text-muted leading-relaxed max-w-md mx-auto mb-6">
                {latestPack.assets.length} asset{latestPack.assets.length === 1 ? "" : "s"} generated and saved to your collection.
              </p>
              <button
                onClick={() => {
                  setOpenedPack(latestPack);
                  setLatestPack(null);
                  // free the active-pipeline state since the user moved past it
                  resetForNew();
                  setTab("packs");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="inline-flex items-center gap-2 px-6 py-3 bg-ink hover:bg-amber text-white text-sm font-semibold rounded-md transition-colors shadow-soft"
              >
                Open your pack →
              </button>
            </div>
          ) : (
            // ---- Idle / consumed: no active process ----
            <div className="bg-panel border border-line rounded-2xl py-16 px-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-panel-2 text-muted mb-3">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
              <h3 className="text-base font-semibold mb-1.5">No active process</h3>
              <p className="text-sm text-muted leading-relaxed max-w-md mx-auto mb-5">
                Nothing is running right now. Start a new pack to use this tab.
                Past packs live in your collection.
              </p>
              <button
                onClick={onNewPack}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-ink hover:bg-amber text-white text-sm font-semibold rounded-md transition-colors shadow-soft"
              >
                + Create a new pack
              </button>
            </div>
          )}
        </section>
      ) : null}

      {/* === TAB 3 — PACKS COLLECTION === */}
      {tab === "packs" ? (
        openedPack ? (
          <PackDetail pack={openedPack} onClose={onClosePackDetail} onZoom={onZoom} />
        ) : (
          <PacksGallery
            refreshKey={recentTick}
            onOpen={onOpenRecent}
            onNew={onNewPack}
            onAfterDelete={() => setRecentTick((t) => t + 1)}
          />
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
