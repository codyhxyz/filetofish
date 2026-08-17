import * as esbuild from "esbuild";
import fs from "node:fs";

const ENT = {"·":"&#183;","—":"&#8212;","→":"&#8594;","×":"&#215;",
             "…":"&#8230;","–":"&#8211;","✓":"&#10003;","✗":"&#10007;",
             "▋":"&#9611;","▌":"&#9612;","°":"&#176;"," ":"&#160;"};

const asciiHtml = t => {
  for (const [k, v] of Object.entries(ENT)) t = t.split(k).join(v);
  return [...t].map(c => c.charCodeAt(0) < 128 ? c : `&#${c.codePointAt(0)};`).join("");
};
const asciiJs = t =>
  [...t].map(c => c.charCodeAt(0) < 128 ? c : "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")).join("");

/* inline a bundled entry into its page shell at the <!--APP_BUNDLE--> marker */
async function page(entry, shell) {
  const out = await esbuild.build({
    entryPoints: [entry],
    bundle: true, minify: true, format: "iife", target: "es2020",
    write: false, legalComments: "none",
  });
  const js = asciiJs(out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script"));
  const html = fs.readFileSync(shell, "utf8");
  if (!html.includes("<!--APP_BUNDLE-->")) throw new Error("missing marker in " + shell);
  const cut = html.indexOf("<!--APP_BUNDLE-->");
  const doc = asciiHtml(html.slice(0, cut)) + `<script>\n${js}\n</script>`
            + asciiHtml(html.slice(cut + "<!--APP_BUNDLE-->".length));
  if ([...doc].some(c => c.charCodeAt(0) > 127)) throw new Error("non-ascii leaked from " + shell);
  return { doc, js };
}

const { doc, js } = await page("src/app.js", "src/page.html");

// 1) artifact build: the host injects <head>, so ship the body only
fs.mkdirSync("mockups", {recursive: true});
fs.writeFileSync("mockups/index.html", doc);

// 2) standalone build: our own <head> -- viewport is what makes it usable on a phone
const ORIGIN = "https://filetofish.codyh.xyz";
const DESC = "Drop in any file. It comes back as a fish.";
const FAVICON = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
  `<rect width="32" height="32" fill="#2E9FC4"/>` +
  `<path d="M6 16 L13 10 L22 10 L26 16 L22 22 L13 22 Z" fill="#E8DCC0" stroke="#0B1517" stroke-width="2" stroke-linejoin="round"/>` +
  `<path d="M6 16 L2 11 L2 21 Z" fill="#E8DCC0" stroke="#0B1517" stroke-width="2" stroke-linejoin="round"/>` +
  `<circle cx="21" cy="15" r="2" fill="#0B1517"/></svg>`);

// a <title> inside <body> is invalid; hoist it into the real head
const titleMatch = doc.match(/<title>([\s\S]*?)<\/title>/i);
const pageTitle = titleMatch ? titleMatch[1] : "filetofish";
const bodyDoc = doc.replace(/<title>[\s\S]*?<\/title>\s*/i, "");

const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${pageTitle}</title>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="${DESC}">
<meta name="theme-color" content="#7EC8E3">
<link rel="icon" href="${FAVICON}">
<meta property="og:type" content="website">
<meta property="og:title" content="filetofish">
<meta property="og:description" content="${DESC}">
<meta property="og:url" content="${ORIGIN}">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="filetofish">
<meta name="twitter:description" content="${DESC}">
<meta name="twitter:image" content="${ORIGIN}/og.png">
</head>
<body>
${bodyDoc}
</body>
</html>`;
fs.mkdirSync("dist", {recursive: true});
fs.writeFileSync("dist/index.html", standalone);
fs.writeFileSync("dist/_headers",
  "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n" +
  "  Permissions-Policy: geolocation=(), microphone=(), camera=()\n" +
  "/sfx/*\n  X-Robots-Tag: noindex\n");

// 3) the sfx audition page -- shares src/sfx.js with the site, so it cannot drift
const aud = await page("src/audition.js", "src/audition.html");
const audTitle = (aud.doc.match(/<title>([\s\S]*?)<\/title>/i) || [, "sfx audition"])[1];
fs.mkdirSync("dist/sfx", {recursive: true});
fs.writeFileSync("dist/sfx/index.html", `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${audTitle}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#081619">
<link rel="icon" href="${FAVICON}">
</head>
<body>
${aud.doc.replace(/<title>[\s\S]*?<\/title>\s*/i, "")}
</body>
</html>`);

console.log(`site ${(doc.length/1024).toFixed(0)} KB | audition ${(aud.doc.length/1024).toFixed(0)} KB`);
