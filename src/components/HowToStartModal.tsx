import { X, ExternalLink, Github, Settings as SettingsIcon, ArrowRight } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
};

export function HowToStartModal({ open, onClose, onOpenSettings }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(20,20,20,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="bg-panel border border-line rounded-xl w-full max-w-2xl max-h-[88vh] overflow-y-auto shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 pb-4 border-b border-line">
          <div>
            <div className="font-mono uppercase tracking-widest text-[10px] text-amber font-bold mb-1">
              Onboarding · 3 steps · ~3 minutes
            </div>
            <h2 className="text-lg font-semibold">Get started</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-panel-2 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-7">

          {/* STEP 1 */}
          <Step n={1} title="Make it yours">
            <p className="text-sm text-ink-2 leading-relaxed mb-3">
              If you're on a shared demo, fork the repo so you have your own copy that you can
              tweak, host, and run on your own credits.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <a
                href="https://replit.com/github/runflow-io/dtc-ad-builder"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-ink hover:bg-amber text-white text-xs font-semibold rounded-md transition-colors"
              >
                Open in Replit
                <ArrowRight className="w-3 h-3" />
              </a>
              <a
                href="https://github.com/runflow-io/dtc-ad-builder"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-panel-2 hover:bg-line text-ink text-xs font-semibold rounded-md transition-colors"
              >
                <Github className="w-3.5 h-3.5" />
                Fork on GitHub
              </a>
            </div>
            <details className="mt-3 group">
              <summary className="text-xs text-muted cursor-pointer hover:text-ink">
                Prefer to run it locally?
              </summary>
              <pre className="mt-2 p-3 bg-panel-2 border border-line rounded-md text-[11px] font-mono text-ink-2 overflow-x-auto">
{`git clone https://github.com/runflow-io/dtc-ad-builder.git
cd dtc-ad-builder
npm install
npm run dev`}
              </pre>
            </details>
          </Step>

          {/* STEP 2 */}
          <Step n={2} title="Grab your two API keys">
            <p className="text-sm text-ink-2 leading-relaxed mb-3">
              Pay-as-you-go on your own accounts — no subscription, no middleman.
              The app talks to Runflow + OpenAI directly using your keys. Total cost
              per brand pack: <span className="font-semibold">~$0.26</span>.
            </p>

            <div className="space-y-2.5">
              <KeyCard
                label="Runflow API key"
                href="https://app.runflow.io/settings/api-keys"
                purpose="Object removal, product isolation, gpt-image-2 generation, outpaint, smart-resize"
                cost="~$0.25 per pack"
                placeholder="rf_..."
              />
              <KeyCard
                label="OpenAI API key"
                href="https://platform.openai.com/api-keys"
                purpose="gpt-4o vision · reads your product photo to pick scenes"
                cost="~$0.01 per pack"
                placeholder="sk-..."
              />
            </div>
          </Step>

          {/* STEP 3 */}
          <Step n={3} title="Paste keys and run">
            <p className="text-sm text-ink-2 leading-relaxed mb-3">
              Open Settings, paste both keys, drop a supplier image (AliExpress / 1688 /
              Alibaba), and click <span className="font-semibold">Generate brand pack</span>.
              First output in ~90 seconds.
            </p>
            <button
              onClick={() => { onClose(); onOpenSettings(); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber hover:bg-amber/90 text-white text-sm font-semibold rounded-md transition-colors shadow-soft"
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              Open Settings
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <p className="text-[11px] text-muted mt-3 leading-relaxed">
              Your keys never leave this browser — they sit in localStorage and are
              sent only to api.runflow.io and api.openai.com via the Vite dev-server proxy.
              Past brand packs live in IndexedDB on this device.
            </p>
          </Step>

        </div>

        <div className="border-t border-line p-4 flex items-center justify-between gap-3 bg-panel-2/40">
          <div className="text-[11px] text-muted">
            Stuck? See the{" "}
            <a
              href="https://github.com/runflow-io/dtc-ad-builder#readme"
              target="_blank"
              rel="noreferrer"
              className="text-amber hover:underline inline-flex items-center gap-0.5"
            >
              README <ExternalLink className="w-2.5 h-2.5" />
            </a>{" "}
            or open an issue.
          </div>
          <button
            onClick={onClose}
            className="text-xs text-ink-2 hover:bg-panel-2 px-3 py-1.5 rounded-md"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0">
        <div className="w-7 h-7 rounded-full bg-amber-soft border border-amber-border text-amber font-mono font-bold text-xs flex items-center justify-center">
          {n}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-ink mb-2">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function KeyCard({
  label,
  href,
  purpose,
  cost,
  placeholder,
}: {
  label: string;
  href: string;
  purpose: string;
  cost: string;
  placeholder: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="block p-3 bg-panel border border-line rounded-lg hover:border-amber-border hover:shadow-soft transition-all group"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-ink">{label}</span>
          <code className="font-mono text-[10px] text-amber bg-amber-soft px-1.5 py-0.5 rounded">
            {placeholder}
          </code>
        </div>
        <span className="text-amber group-hover:translate-x-0.5 transition-transform">
          <ExternalLink className="w-3.5 h-3.5" />
        </span>
      </div>
      <div className="text-[11px] text-muted leading-snug">{purpose}</div>
      <div className="text-[11px] text-ink-2 mt-1 font-mono">{cost}</div>
    </a>
  );
}
