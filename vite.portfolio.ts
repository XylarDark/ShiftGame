import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/** Swap player-visible shell copy in index.html for the portfolio embed build. */
export function portfolioIndexHtml(portfolio: boolean): Plugin {
  return {
    name: "portfolio-index-html",
    transformIndexHtml(html) {
      if (!portfolio) return html;
      return html
        .replace(/content="Kindling"/g, 'content="Shift"')
        .replace(
          /content="One Kindling shift: run the shop, then deliver with ID checks\. 9 AM–11 PM\."/,
          'content="One shop shift, then deliveries with ID checks. 9 AM–11 PM."',
        )
        .replace(/<title>Kindling<\/title>/, "<title>Shift</title>")
        .replace(/<span>Kindling<\/span>/g, "<span>Shift</span>")
        .replace(
          /Turn your phone sideways to run Kindling\./,
          "Turn your phone sideways to play Shift.",
        )
        .replace(/Loading Kindling…/, "Loading Shift…");
    },
  };
}

/** Write the Shift web manifest into the embed bundle output. */
export function portfolioManifest(outDir: string, portfolio: boolean): Plugin {
  return {
    name: "portfolio-manifest",
    apply: "build",
    closeBundle() {
      if (!portfolio) return;
      const src = join("public", "manifest.embed.webmanifest");
      const dest = join(outDir, "manifest.webmanifest");
      copyFileSync(src, dest);
    },
  };
}

/** Post-build sanity check: no build (main site or embed) may ship Kindling player copy. */
export function portfolioEmbedGuard(outDir: string, _portfolio: boolean): Plugin {
  return {
    name: "portfolio-embed-guard",
    apply: "build",
    closeBundle() {
      const indexPath = join(outDir, "index.html");
      const manifestPath = join(outDir, "manifest.webmanifest");
      let html: string;
      try {
        html = readFileSync(indexPath, "utf8");
      } catch {
        throw new Error(`portfolio-embed-guard: ${indexPath} missing after embed build`);
      }
      const forbidden = [
        /<title>Kindling<\/title>/,
        /Loading Kindling/,
        /Turn your phone sideways to run Kindling/,
        /<span>Kindling<\/span>/,
        /Kindling Cannabis/,
        /content="Kindling"/,
        /One Kindling shift/,
      ];
      for (const pattern of forbidden) {
        if (pattern.test(html)) {
          throw new Error(`portfolio-embed-guard: index.html still matches ${pattern}`);
        }
      }
      let manifest: string;
      try {
        manifest = readFileSync(manifestPath, "utf8");
      } catch {
        throw new Error(`portfolio-embed-guard: ${manifestPath} missing after embed build`);
      }
      if (/Kindling/i.test(manifest)) {
        throw new Error("portfolio-embed-guard: manifest.webmanifest still names Kindling");
      }
    },
  };
}
