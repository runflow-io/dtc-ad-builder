import { Download } from "lucide-react";
import type { AssetFile } from "../lib/pipeline";
import type { LightboxItem } from "./Lightbox";
import type { ZoomFn } from "./Pipeline";

type Props = {
  assets: AssetFile[];
  assetUrls: Record<string, string>;
  zipUrl: string | null;
  jobId: string;
  onZoom: ZoomFn;
};

function buildItemsFromAssets(assets: AssetFile[], assetUrls: Record<string, string>, jobId: string): LightboxItem[] {
  const items: LightboxItem[] = [];
  const seen = new Set<string>();
  for (const a of assets) {
    const src = assetUrls[a.key];
    if (!src || seen.has(src)) continue;
    seen.add(src);
    items.push({ src, label: a.label, filename: `runflow-pack-${jobId}-${a.filename}` });
  }
  return items;
}

export function ResultGrid({ assets, assetUrls, zipUrl, jobId, onZoom }: Props) {
  if (!assets.length) return null;
  const handleZoom = (clickedSrc: string) => {
    const items = buildItemsFromAssets(assets, assetUrls, jobId);
    if (!items.length) return;
    const idx = Math.max(0, items.findIndex((i) => i.src === clickedSrc));
    onZoom(items, idx);
  };
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="text-base font-semibold">Your brand pack</h2>
        {zipUrl ? (
          <a
            href={zipUrl}
            download={`runflow-pack-${jobId}.zip`}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-ink hover:bg-amber text-white text-sm font-semibold rounded-md transition-colors shadow-soft"
          >
            Download all (zip) →
          </a>
        ) : null}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {assets.map((a) => {
          const url = assetUrls[a.key];
          if (!url) return null;
          return (
            <figure
              key={a.key}
              className="bg-panel border border-line rounded-[10px] overflow-hidden flex flex-col hover:border-amber-border hover:shadow-soft transition-all"
            >
              <button
                onClick={() => handleZoom(url)}
                className={"aspect-square flex items-center justify-center overflow-hidden cursor-zoom-in " + (a.key === "cutout" ? "checker" : "bg-panel-2")}
              >
                <img src={url} loading="lazy" className="max-w-full max-h-full object-contain" />
              </button>
              <figcaption className="p-3 flex flex-col gap-2">
                <div className="text-xs font-semibold leading-snug">{a.label}</div>
                <a
                  href={url}
                  download={`runflow-pack-${jobId}-${a.filename}`}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber hover:underline"
                >
                  <Download className="w-3 h-3" />
                  Download
                </a>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
