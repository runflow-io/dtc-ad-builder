import { useRef, useState, useEffect } from "react";

type Props = {
  label: string;
  required?: boolean;
  hint?: string;
  subHint?: string;
  file: File | null;
  onChange: (file: File | null) => void;
};

export function Dropzone({ label, required, hint, subHint, file, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const accept = (f: File | null | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return;
    onChange(f);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="font-mono uppercase tracking-wider text-[11px] text-muted font-semibold">
          {label}
        </span>
        {required ? (
          <span className="font-mono uppercase tracking-wider text-[9px] px-1.5 py-[3px] rounded text-amber bg-amber-soft border border-amber-border font-bold">
            REQUIRED
          </span>
        ) : (
          <span className="font-mono uppercase tracking-wider text-[9px] px-1.5 py-[3px] rounded text-muted bg-panel-2 border border-line font-bold">
            OPTIONAL
          </span>
        )}
      </div>

      <div
        // NB: do NOT add onClick={() => inputRef.current?.click()} here — the
        // <input> below covers the entire area (absolute inset-0) and already
        // opens the file picker on click. Adding a parent onClick causes the
        // click to bubble + fire a second picker.
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          accept(e.dataTransfer.files[0]);
          // reset input so re-uploading the same filename still fires onChange
          if (inputRef.current) inputRef.current.value = "";
        }}
        className={
          "relative rounded-xl transition-colors overflow-hidden flex items-center justify-center min-h-[300px] " +
          (file
            ? "border border-line bg-panel"
            : drag
            ? "border-2 border-dashed border-amber bg-amber-soft"
            : "border-2 border-dashed border-line bg-panel hover:border-amber-border hover:bg-amber-soft")
        }
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="absolute inset-0 opacity-0 cursor-pointer z-10"
          onChange={(e) => {
            accept(e.target.files?.[0]);
            // reset so re-uploading the same file still triggers onChange next time
            e.target.value = "";
          }}
        />
        {preview ? (
          <img src={preview} className="max-w-full max-h-[460px] block pointer-events-none" />
        ) : (
          <div className="text-center px-5 pointer-events-none">
            <div className="font-semibold text-[15px] mb-2">{hint}</div>
            {subHint ? <div className="text-muted text-[13px] leading-relaxed">{subHint}</div> : null}
            <div className="text-faint text-[11px] mt-1.5">JPG / PNG / WebP · or click to browse</div>
          </div>
        )}
      </div>
    </div>
  );
}
