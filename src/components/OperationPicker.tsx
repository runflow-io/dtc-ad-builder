import { Check } from "lucide-react";
import { OPERATIONS, type Operation } from "../lib/options";

type Props = {
  selected: Operation[];
  onChange: (next: Operation[]) => void;
};

export function OperationPicker({ selected, onChange }: Props) {
  const toggle = (key: Operation) => {
    if (selected.includes(key)) onChange(selected.filter((k) => k !== key));
    else onChange([...selected, key]);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      {OPERATIONS.map((op) => {
        const isOn = selected.includes(op.key);
        const Icon = op.icon;
        return (
          <button
            key={op.key}
            type="button"
            disabled={op.soon}
            onClick={() => !op.soon && toggle(op.key)}
            className={
              "relative text-left p-3 border rounded-lg transition-all flex gap-3 items-start " +
              (op.soon
                ? "border-line bg-panel-2/30 opacity-60 cursor-not-allowed"
                : isOn
                ? "border-amber bg-amber-soft shadow-soft"
                : "border-line bg-panel hover:border-amber-border hover:shadow-soft")
            }
          >
            <div
              className={
                "flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center " +
                (isOn ? "bg-amber text-white" : "bg-panel-2 text-ink-2")
              }
            >
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className="text-sm font-semibold leading-snug">{op.title}</div>
                {op.soon ? (
                  <span className="font-mono uppercase text-[8px] tracking-wider px-1 py-[2px] rounded bg-panel-2 text-muted border border-line font-bold">
                    SOON
                  </span>
                ) : null}
              </div>
              <div className="text-[11px] text-muted leading-snug">{op.description}</div>
            </div>
            {isOn && !op.soon ? (
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
