import { ArrowLeft, ExternalLink, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { workflowMeta } from "../lib/options";
import type { RecentPack } from "../lib/history";
import { buildZip } from "../lib/zip";

type Props = {
  pack: RecentPack;
  onClose: () => void;
  onZoom: (src: string, label: string, filename: string) => void;
};

export function PackDetail({ pack, onClose, onZoom }: Props) {
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [zipUrl, setZipUrl] = useState<string>("");

  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const a of pack.assets) {
      urls[a.key] = URL.createObjectURL(a.blob);
    }
    setAssetUrls(urls);
    (async () => {
      try {
        const z = await buildZip(pack.assets);
        setZipUrl(URL.createObjectURL(z));
      } catch {
        /* silent — broken pack */
      }
    })();
    return () => {
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack.id]);

  const workflows = pack.workflows || [];

  return (
    <div>
      {/* header bar */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-amber"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to collection
        </button>
        {zipUrl ? (
          <a
            href={zipUrl}
            download={`runflow-pack-${pack.id}.zip`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-ink hover:bg-amber text-white text-sm font-semibold rounded-md transition-colors shadow-soft"
          >
            <Download className="w-3.5 h-3.5" />
            Download all (zip)
          </a>
        ) : null}
      </div>

      {/* product header */}
      <div className="mb-6">
        <div className="font-mono uppercase tracking-wider text-[11px] text-amber font-bold mb-1.5">
          {pack.category || "Pack"} ·{" "}
          {new Date(pack.createdAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
        <h1 className="text-[28px] font-bold tracking-tight leading-snug mb-1">{pack.product}</h1>
        <div className="text-ink-2 text-sm">
          {pack.assets.length} asset{pack.assets.length === 1 ? "" : "s"} in this pack
        </div>
      </div>

      {/* workflows used */}
      {workflows.length > 0 ? (
        <div className="mb-7 p-4 bg-panel-2/50 border border-line rounded-xl">
          <div className="font-mono uppercase tracking-wider text-[11px] text-muted font-bold mb-2.5">
            Workflows under the hood
          </div>
          <div className="flex flex-wrap gap-2">
            {workflows.map((slug) => {
              const meta = workflowMeta(slug);
              return (
                <a
                  key={slug}
                  href={meta.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-panel border border-line hover:border-amber-border hover:shadow-soft rounded-full text-[12px] font-semibold text-ink-2 hover:text-amber transition-all"
                >
                  <code className="font-mono text-[10px] text-amber">{slug}</code>
                  <span>·</span>
                  <span>{meta.label}</span>
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              );
            })}
          </div>
          <p className="text-[11px] text-muted mt-3 leading-relaxed">
            Each chip links to the Runflow workflow page so you can see inputs, outputs,
            and pricing under the hood.
          </p>
        </div>
      ) : null}

      {/* asset grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 mb-10">
        {pack.assets.map((a) => {
          const url = assetUrls[a.key];
          if (!url) return null;
          return (
            <figure
              key={a.key}
              className="bg-panel border border-line rounded-[10px] overflow-hidden flex flex-col hover:border-amber-border hover:shadow-soft transition-all"
            >
              <button
                onClick={() => onZoom(url, a.label, `runflow-pack-${pack.id}-${a.filename}`)}
                className={
                  "aspect-square flex items-center justify-center overflow-hidden cursor-zoom-in " +
                  (a.key === "cutout" ? "checker" : "bg-panel-2")
                }
              >
                <img src={url} loading="lazy" className="max-w-full max-h-full object-contain" />
              </button>
              <figcaption className="p-3 flex flex-col gap-2">
                <div className="text-xs font-semibold leading-snug">{a.label}</div>
                <a
                  href={url}
                  download={`runflow-pack-${pack.id}-${a.filename}`}
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
    </div>
  );
}
