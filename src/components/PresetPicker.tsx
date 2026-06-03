import { Check, Package, Sparkles, Shirt, Eraser, Wrench } from "lucide-react";
import type { Operation } from "../lib/options";
import type { LucideIcon } from "lucide-react";

export type PresetKey =
  | "product_pack"
  | "product_lifestyle"
  | "apparel_ghost"
  | "cleanup"
  | "custom";

type PresetDef = {
  key: PresetKey;
  title: string;
  description: string;
  operations: Operation[];
  icon: LucideIcon;
};

export const PRESETS: PresetDef[] = [
  {
    key: "product_pack",
    title: "Product pack",
    description: "Cutout + white studio shot · for PDPs and Amazon main image",
    operations: ["isolate", "background_replace"],
    icon: Package,
  },
  {
    key: "product_lifestyle",
    title: "Product + lifestyle",
    description: "Cutout + studio + 3 AI-picked lifestyle scenes",
    operations: ["isolate", "background_replace", "lifestyle_scenes"],
    icon: Sparkles,
  },
  {
    key: "apparel_ghost",
    title: "Apparel ghost mannequin",
    description: "Strip the model — garment alone on white. Use for clothing on a model.",
    operations: ["remove_model", "background_replace"],
    icon: Shirt,
  },
  {
    key: "cleanup",
    title: "Cleanup only",
    description: "Strip watermarks, supplier text, prop hands · keep the original",
    operations: ["remove_object"],
    icon: Eraser,
  },
  {
    key: "custom",
    title: "Custom",
    description: "Pick any combination of operations · advanced",
    operations: [],
    icon: Wrench,
  },
];

/** Identify which preset (if any) matches the current operations selection. */
export function detectPreset(ops: Operation[]): PresetKey {
  const set = new Set(ops);
  for (const p of PRESETS) {
    if (p.key === "custom") continue;
    if (p.operations.length !== set.size) continue;
    if (p.operations.every((o) => set.has(o))) return p.key;
  }
  return "custom";
}

type Props = {
  selected: PresetKey;
  onChange: (preset: PresetKey, operations: Operation[]) => void;
};

export function PresetPicker({ selected, onChange }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
      {PRESETS.map((p) => {
        const isOn = selected === p.key;
        const Icon = p.icon;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.key, p.operations)}
            className={
              "relative text-left p-3 border rounded-lg transition-all flex flex-col gap-2 " +
              (isOn
                ? "border-amber bg-amber-soft shadow-soft"
                : "border-line bg-panel hover:border-amber-border hover:shadow-soft")
            }
          >
            <div className="flex items-center gap-2">
              <div
                className={
                  "flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center " +
                  (isOn ? "bg-amber text-white" : "bg-panel-2 text-ink-2")
                }
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-sm font-semibold leading-snug">{p.title}</div>
            </div>
            <div className="text-[11px] text-muted leading-snug">{p.description}</div>
            {isOn ? (
              <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-amber text-white flex items-center justify-center">
                <Check className="w-2.5 h-2.5" strokeWidth={3} />
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
