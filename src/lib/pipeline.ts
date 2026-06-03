// Runflow brand-pack pipeline — selection-driven.
//
// User picks operations + target platforms. Pipeline only runs what's needed:
//   1. Upload (always)
//   2. Vision: gpt-4o reads the image, returns category + cleanup prompt + scene prompts
//      (style-matched if reference provided)
//   3. Cleanup: conditional object-removal/prompt (runs if remove_object selected)
//   4. Cutout: product-isolation (runs if isolate / background_replace / lifestyle selected)
//   5. Scenes (parallel fan-out): white studio + 3 lifestyle scenes (each toggled by selection)
//   6. Ratios (parallel fan-out): smart-resize each scene to each unique platform aspect ratio

import { chat as openaiChat } from "./openai";
import {
  downloadBlob,
  firstUrl,
  runSolution,
  uploadAsset,
  RunflowError,
} from "./runflow";
import type { Operation, Platform, AspectRatio } from "./options";
import { uniqueRatios } from "./options";

export type StepKey =
  | "upload"
  | "vision"
  | "cleanup"
  | "cutout"
  | "scenes"
  | "ratios";

export type StepStatus = "pending" | "running" | "done" | "skipped" | "failed";

export type Analysis = {
  product: string;
  category: string;
  cleanup_prompt: string;
  reference_style?: {
    surface?: string;
    lighting?: string;
    palette?: string;
    mood?: string;
    composition?: string;
    props?: string;
  };
  lifestyle_scenes: string[];
};

export type PipelineUpdate =
  | { type: "step"; key: StepKey; status: StepStatus; message?: string }
  | { type: "analysis"; analysis: Analysis }
  | { type: "asset"; key: string; blob: Blob; filename: string };

export type ProgressFn = (u: PipelineUpdate) => void;

export type Keys = { runflow: string; openai: string };

const VISION_SYSTEM =
  "You analyze supplier product photos (AliExpress / 1688 / Alibaba) so a downstream " +
  "image-edit pipeline can rebrand them for a Shopify or Amazon store. When a reference " +
  "style image is provided, you also extract its visual style. Output STRICT JSON only.";

const VISION_USER_BASE =
  "Look at this supplier product photo. Identify the product and produce:\n" +
  "  - product (3-6 word description)\n" +
  "  - category (kitchen/beauty/fitness/fashion/home/tech/pets/kids/outdoor/accessories/other)\n" +
  "  - cleanup_prompt (≤7-word imperative for object-removal, or 'none')\n" +
  "  - lifestyle_scenes (array of 3 short scene phrases)\n\n" +
  "STRICT SCENE RULES:\n" +
  "1. Product is always hero, in NATURAL use/display position.\n" +
  "2. Must REST on a stable horizontal surface that physically supports it.\n" +
  "3. NEVER inside a bag/container/drawer/box. Never mid-air. Never held by a hand.\n" +
  "4. Avoid people unless category truly requires (apparel/beauty).\n" +
  "5. Each scene is ONE short photographic phrase.\n\n" +
  'Return JSON: { "product": "...", "category": "...", "cleanup_prompt": "...", "lifestyle_scenes": ["...","...","..."] }';

const VISION_USER_WITH_REF =
  "You are analyzing TWO images:\n" +
  "  IMAGE 1 = product to rebrand (supplier photo)\n" +
  "  IMAGE 2 = reference ad creative whose VISUAL STYLE the user wants to match\n\n" +
  "Identify the product in IMAGE 1, extract IMAGE 2's style, and produce 3 lifestyle " +
  "scene prompts that apply IMAGE 2's style (lighting, palette, surface, mood, composition, props) " +
  "to the product. Follow the strict scene rules: product always on a stable surface, no enclosures, " +
  "no mid-air, no hands. Do NOT copy IMAGE 2's actual subject — only its visual treatment.\n\n" +
  'Return JSON: { "product":"...", "category":"...", "cleanup_prompt":"...", "reference_style":{"surface":"...","lighting":"...","palette":"...","mood":"...","composition":"...","props":"..."}, "lifestyle_scenes":["...","...","..."] }';

const WHITE_STUDIO_PROMPT =
  "Place this exact product on a pure white seamless backdrop, clean studio product photography. " +
  "Soft diffuse lighting, subtle natural contact shadow. Centered, three-quarter angle, full visible. " +
  "Preserve every edge, material, color and detail. Amazon main-image style: white background only, no props, no text.";

const PLACEMENT_RULES =
  "\n\nPHYSICAL PLACEMENT RULES — non-negotiable:\n" +
  "- Product MUST sit upright on the horizontal surface described, real-world orientation, photoreal scale + contact shadow.\n" +
  "- Product is the clear hero, centered or slightly off-center, fully visible, not cropped.\n" +
  "- NOT inside bag/container/drawer/box, NOT mid-air, NOT held by a hand.\n" +
  "- Preserve every edge, material, color, texture, detail exactly from the source cutout.\n" +
  "- Photographic style. No text, graphics, or logo overlays.";

async function analyzeProduct(
  sourceUrl: string,
  referenceUrl: string | null,
  keys: Keys
): Promise<Analysis> {
  const content: Array<Record<string, unknown>> = [];
  if (referenceUrl) {
    content.push({ type: "text", text: VISION_USER_WITH_REF });
    content.push({ type: "text", text: "IMAGE 1 — product to rebrand:" });
    content.push({ type: "image_url", image_url: { url: sourceUrl } });
    content.push({ type: "text", text: "IMAGE 2 — reference style:" });
    content.push({ type: "image_url", image_url: { url: referenceUrl } });
  } else {
    content.push({ type: "text", text: VISION_USER_BASE });
    content.push({ type: "image_url", image_url: { url: sourceUrl } });
  }

  const resp = await openaiChat(
    {
      model: "gpt-4o",
      messages: [
        { role: "system", content: VISION_SYSTEM },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    },
    keys.openai
  );
  return JSON.parse(resp.choices[0].message.content) as Analysis;
}

async function removeOriginalProduct(sourceUrl: string, prompt: string, apiKey: string): Promise<string> {
  const short = prompt.split(/\s+/).slice(0, 7).join(" ");
  const run = await runSolution("runflow/object-removal/prompt", { image_url: sourceUrl, prompt: short }, apiKey);
  const url = firstUrl(run);
  if (!url) throw new RunflowError("object-removal returned no url");
  return url;
}

async function isolateProduct(sourceUrl: string, apiKey: string): Promise<string> {
  const run = await runSolution("runflow/product-isolation", {
    image_url: sourceUrl,
    aspect_ratio: "1:1",
    resolution: "1K",
    prompt: "Isolate the main product. Remove background entirely.",
  }, apiKey);
  const url = firstUrl(run);
  if (!url) throw new RunflowError("product-isolation returned no url");
  return url;
}

async function genWhiteStudio(cutoutUrl: string, apiKey: string): Promise<string> {
  const run = await runSolution("openai/gpt-image-2/edit", {
    prompt: WHITE_STUDIO_PROMPT,
    image_urls: [cutoutUrl],
    image_size: "square_hd",
    quality: "high",
    output_format: "jpeg",
  }, apiKey, { timeoutMs: 420_000 });
  const url = firstUrl(run);
  if (!url) throw new RunflowError("white studio returned no url");
  return url;
}

async function genLifestyle(
  cutoutUrl: string,
  scene: string,
  referenceUrl: string | null,
  apiKey: string
): Promise<string> {
  const imageUrls = [cutoutUrl];
  let styleClause = "";
  if (referenceUrl) {
    imageUrls.push(referenceUrl);
    styleClause =
      "\n\nSTYLE MATCHING — IMAGE 2 is a reference ad creative whose VISUAL STYLE you must match:\n" +
      "- IMAGE 1 is the product cutout — preserve its EXACT identity, color, material, edges.\n" +
      "- IMAGE 2 is the style reference — match its lighting, palette, surface texture, mood, treatment.\n" +
      "- DO NOT copy IMAGE 2's product, props, or subject one-for-one. Borrow only the visual treatment.";
  }
  const prompt =
    `Place this exact product in the following scene: ${scene}.` + PLACEMENT_RULES + styleClause;
  const run = await runSolution("openai/gpt-image-2/edit", {
    prompt,
    image_urls: imageUrls,
    image_size: "square_hd",
    quality: "high",
    output_format: "jpeg",
  }, apiKey, { timeoutMs: 420_000 });
  const url = firstUrl(run);
  if (!url) throw new RunflowError("lifestyle returned no url");
  return url;
}

async function smartResize(url: string, ratio: AspectRatio, apiKey: string): Promise<string> {
  const run = await runSolution("runflow/smart-resize", {
    image_url: url,
    aspect_ratio: ratio,
    resolution: "1K",
  }, apiKey);
  const u = firstUrl(run);
  if (!u) throw new RunflowError(`smart-resize ${ratio} returned no url`);
  return u;
}

// ---------- public orchestrator ----------

export type PipelineInput = {
  source: File;
  reference?: File | null;
  operations: Operation[];
  platforms: Platform[];
  keys: Keys;
};

export type AssetFile = {
  key: string;
  label: string;
  filename: string;
  blob: Blob;
};

export async function runPipeline(input: PipelineInput, onProgress: ProgressFn): Promise<{
  analysis: Analysis;
  assets: AssetFile[];
}> {
  const { source, reference, operations, platforms, keys } = input;
  const ops = new Set(operations);
  const assets: AssetFile[] = [];

  const emit = (key: StepKey, status: StepStatus, message?: string) =>
    onProgress({ type: "step", key, status, message });

  const pushAsset = (a: AssetFile) => {
    assets.push(a);
    onProgress({ type: "asset", key: a.key, blob: a.blob, filename: a.filename });
  };

  // 1 — upload
  emit("upload", "running");
  const sourceUrl = await uploadAsset(source, source.name || "source.jpg", keys.runflow);
  let referenceUrl: string | null = null;
  if (reference) {
    referenceUrl = await uploadAsset(reference, reference.name || "reference.jpg", keys.runflow);
  }
  emit("upload", "done");

  // 2 — vision
  emit("vision", "running");
  const analysis = await analyzeProduct(sourceUrl, referenceUrl, keys);
  onProgress({ type: "analysis", analysis });
  emit("vision", "done");

  // 3 — cleanup (only if user picked remove_object)
  let cleanedUrl = sourceUrl;
  const wantsCleanup = ops.has("remove_object");
  if (wantsCleanup) {
    const cp = (analysis.cleanup_prompt || "").trim().toLowerCase();
    if (cp && cp !== "none" && cp !== "n/a") {
      emit("cleanup", "running", analysis.cleanup_prompt);
      cleanedUrl = await removeOriginalProduct(sourceUrl, analysis.cleanup_prompt, keys.runflow);
      const cleanedBlob = await downloadBlob(cleanedUrl);
      pushAsset({ key: "cleaned", label: "Cleaned source", filename: "00_cleaned.jpg", blob: cleanedBlob });
      emit("cleanup", "done");
    } else {
      emit("cleanup", "skipped");
    }
  } else {
    emit("cleanup", "skipped");
  }

  // 4 — cutout (required for isolate, background_replace, lifestyle_scenes)
  const needsCutout = ops.has("isolate") || ops.has("background_replace") || ops.has("lifestyle_scenes");
  let cutoutUrl: string | null = null;
  if (needsCutout) {
    emit("cutout", "running");
    cutoutUrl = await isolateProduct(cleanedUrl, keys.runflow);
    if (ops.has("isolate")) {
      const cutoutBlob = await downloadBlob(cutoutUrl);
      pushAsset({ key: "cutout", label: "RGBA cutout", filename: "01_cutout.png", blob: cutoutBlob });
    }
    emit("cutout", "done");
  } else {
    emit("cutout", "skipped");
  }

  // 5 — scenes (parallel fan-out of white studio + 3 lifestyle)
  // Track these for the ratios fan-out step.
  type SceneOutput = { key: string; url: string; label: string };
  const sceneOutputs: SceneOutput[] = [];

  const wantsWhite = ops.has("background_replace");
  const wantsLifestyle = ops.has("lifestyle_scenes");

  if ((wantsWhite || wantsLifestyle) && cutoutUrl) {
    emit("scenes", "running");
    const tasks: Promise<SceneOutput>[] = [];

    if (wantsWhite) {
      tasks.push(
        genWhiteStudio(cutoutUrl, keys.runflow).then((url) => ({
          key: "white",
          url,
          label: "White studio (Amazon main)",
        }))
      );
    }

    let scenes: string[] = [];
    if (wantsLifestyle) {
      scenes = [...(analysis.lifestyle_scenes || [])].slice(0, 3);
      while (scenes.length < 3) scenes.push("on a neutral wood surface with soft side light");
      const tags = ["a", "b", "c"];
      scenes.forEach((scene, i) => {
        tasks.push(
          genLifestyle(cutoutUrl!, scene, referenceUrl, keys.runflow).then((url) => ({
            key: `life_${tags[i]}`,
            url,
            label: `Lifestyle ${tags[i].toUpperCase()} — ${scene}`,
          }))
        );
      });
    }

    const results = await Promise.all(tasks);
    sceneOutputs.push(...results);

    // Download and emit each base scene asset
    let idx = 2; // start filename numbering after cutout
    for (const r of results) {
      const blob = await downloadBlob(r.url);
      const filename = `${String(idx).padStart(2, "0")}_${r.key}.jpg`;
      pushAsset({ key: r.key, label: r.label, filename, blob });
      idx++;
    }
    emit("scenes", "done");
  } else {
    emit("scenes", "skipped");
  }

  // 6 — ratios (smart-resize per selected platform aspect ratio)
  const ratios: AspectRatio[] = uniqueRatios(platforms);
  if (ratios.length > 0 && sceneOutputs.length > 0) {
    emit("ratios", "running");
    const resizeTasks: Array<Promise<AssetFile>> = [];
    let slot = 10;
    for (const scene of sceneOutputs) {
      for (const ratio of ratios) {
        // Skip 1:1 since base scenes are already square_hd
        if (ratio === "1:1") continue;
        const ratioSlug = ratio.replace(":", "x");
        const filename = `${String(slot).padStart(2, "0")}_${scene.key}_${ratioSlug}.jpg`;
        const key = `${scene.key}_${ratioSlug}`;
        const label = `${scene.label.split(" — ")[0]} · ${ratio}`;
        slot++;
        resizeTasks.push(
          smartResize(scene.url, ratio, keys.runflow).then(async (url) => {
            const blob = await downloadBlob(url);
            return { key, label, filename, blob };
          })
        );
      }
    }
    if (resizeTasks.length > 0) {
      const ratioResults = await Promise.all(resizeTasks);
      for (const r of ratioResults) pushAsset(r);
    }
    emit("ratios", "done");
  } else {
    emit("ratios", "skipped");
  }

  return { analysis, assets };
}
