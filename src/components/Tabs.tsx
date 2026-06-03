import { Wand2, Loader2, Library } from "lucide-react";

export type Tab = "generate" | "processing" | "packs";

type Props = {
  active: Tab;
  onChange: (t: Tab) => void;
  processing: boolean;   // is a pipeline currently running?
  packsCount: number;
};

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: "generate", label: "Generate a pack", icon: Wand2 },
  { key: "processing", label: "Active process", icon: Loader2 },
  { key: "packs", label: "Packs collection", icon: Library },
];

export function Tabs({ active, onChange, processing, packsCount }: Props) {
  return (
    <div className="border-b border-line mb-7">
      <div className="flex gap-1 -mb-px">
        {TABS.map((t, i) => {
          const isActive = t.key === active;
          const disabled = t.key === "processing" && !processing;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onChange(t.key)}
              className={
                "relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all -mb-[1px] " +
                (isActive
                  ? "border-amber text-amber"
                  : disabled
                  ? "border-transparent text-faint cursor-not-allowed"
                  : "border-transparent text-ink-2 hover:text-ink hover:border-line")
              }
            >
              <span
                className={
                  "flex-shrink-0 w-5 h-5 rounded-full font-mono font-bold text-[11px] flex items-center justify-center " +
                  (isActive
                    ? "bg-amber text-white"
                    : disabled
                    ? "bg-panel-2 text-faint"
                    : "bg-panel-2 text-muted")
                }
              >
                {i + 1}
              </span>
              <Icon
                className={
                  "w-3.5 h-3.5 " +
                  (t.key === "processing" && processing ? "animate-spin-slow" : "")
                }
              />
              {t.label}
              {t.key === "packs" && packsCount > 0 ? (
                <span className="ml-1 text-[11px] font-mono text-muted">({packsCount})</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
