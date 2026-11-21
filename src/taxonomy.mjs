/* taxonomy -- where a file sits in the tree of files.

   A fish used to be dealt: the hash picked a body plan and a name, so two
   photos taken a second apart could come back as a shark and a sole. Now it is
   classified. Every rank is one true thing about the file, read broadest
   first, and each one narrows what the animal can be:

     domain    how it came to exist      written | captured | sealed | empty
     kingdom   what medium it is         image, video, audio, code, ...
     phylum    its lineage of format     raster, lossless, markup, ...
     class     how heavy it is           small fry ... leviathan
     order     the body plan             chosen from kingdom and class
     family    the extension             .png
     genus     its weight, to a doubling 2 MB
     species   the noun                  chosen from family and genus

   The hash is left with the individual and nothing else: the adjective, the
   coat, the proportions, the rarity. So two files of one kind and one size are
   the same species, and still two animals.

   This module owns the ranks that are facts about the file. Order and species
   are picked by whoever owns the bestiary -- the dock and the ocean each keep
   their own table of body plans -- but both pick with `cohortOf` and
   `genusOf`, never with the hash. */

/* kingdom -> phylum -> the extensions in it. `a|b` are two spellings of one
   family, so a .jpg and a .jpeg of the same size are the same fish. */
const TREE = {
  image: { domain: "captured", label: "image", phyla: {
    raster: "jpg|jpeg png gif webp bmp tif|tiff heic heif avif ico icns",
    vector: "svg ai eps",
    "camera raw": "raw dng cr2 nef arw orf",
    layered: "psd",
  } },
  video: { domain: "captured", label: "video", phyla: {
    quicktime: "mov mp4 m4v 3gp prores",
    matroska: "mkv webm",
    "mpeg stream": "mpg|mpeg mts m2ts",
    legacy: "avi wmv flv",
  } },
  audio: { domain: "captured", label: "audio", phyla: {
    lossy: "mp3 m4a aac ogg opus wma",
    lossless: "wav flac aif|aiff alac caf",
    notation: "mid|midi",
  } },
  code: { domain: "written", label: "code", phyla: {
    source: "js mjs cjs ts tsx jsx py rb rs go c h cpp hpp cc cs java kt swift php pl lua r vue svelte astro",
    shell: "sh bash zsh fish",
    markup: "html|htm xml md mdx",
    style: "css scss sass less",
    data: "json json5 sql graphql proto map",
    config: "yml|yaml toml ini cfg conf lock env plist gitignore dockerfile make|makefile cmake gradle tf hcl",
  } },
  doc: { domain: "written", label: "document", phyla: {
    page: "pdf djvu",
    office: "doc docx xls xlsx ppt pptx pages numbers key odt ods odp rtf",
    "plain text": "txt log tex bib",
    tabular: "csv tsv",
    book: "epub mobi",
  } },
  archive: { domain: "sealed", label: "archive", phyla: {
    compressed: "zip tar gz bz2 xz 7z rar zst sit sitx cab",
    "disk image": "dmg iso",
    package: "pkg deb rpm jar war apk ipa",
  } },
  font: { domain: "written", label: "font", phyla: {
    outline: "ttf otf",
    web: "woff woff2 eot",
  } },
  /* nothing recognises it, so nothing can say what is inside */
  other: { domain: "sealed", label: "unknown", phyla: {} },
};
export const KINGDOMS = Object.keys(TREE);

/* names that are a type with no dot in them at all */
const BARE = new Set(["makefile", "dockerfile"]);
/* an extension nobody listed can still arrive with a media type attached */
const MIME = [[/^image\//, "image"], [/^video\//, "video"], [/^audio\//, "audio"],
  [/^font\//, "font"], [/^text\//, "code"]];

function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) & 255; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/* one shared record per family: a drive has millions of files and a few
   hundred extensions, so the file keeps a pointer and the tree is walked once */
const kin = (ext, canon, kingdom, phylum, label) => Object.freeze({
  ext, kingdom, phylum, label,
  domain: TREE[kingdom].domain,
  seed: fnv1a(canon),
});
const KNOWN = new Map(), STRAY = new Map();
for (const kingdom of KINGDOMS)
  for (const [phylum, list] of Object.entries(TREE[kingdom].phyla))
    for (const group of list.split(" ")) {
      const spellings = group.split("|");
      for (const ext of spellings)
        KNOWN.set(ext, kin(ext, spellings[0], kingdom, phylum, BARE.has(ext) ? ext : "." + ext));
    }

/* the family a file belongs to, read from its name. A dotfile is all
   extension (.gitignore), and so is a bare name that is itself a type
   (Makefile); anything else with no dot has no family to speak of. */
export function kinOf(name, mime = "") {
  const dot = name.lastIndexOf(".");
  const ext = (dot < 0 ? name : name.slice(dot + 1)).toLowerCase();
  const known = KNOWN.get(ext);
  if (known && (dot >= 0 || BARE.has(ext))) return known;
  const stray = dot < 0 ? "" : ext;
  const route = mime && MIME.find(m => m[0].test(mime));
  const kingdom = route ? route[1] : "other";
  const key = kingdom + "|" + stray;
  let k = STRAY.get(key);
  if (!k) STRAY.set(key, k = kin(stray, stray, kingdom, "unsorted", stray ? "." + stray : "no extension"));
  return k;
}

/* the class breaks, in log2(bytes): 32 KB, 32 MB, 2 GB. The ocean's pools and
   the dock's body plans both hang off these, so they live here. */
export const CLASS_BREAK = [15, 25, 31];
export const CLASSES = ["small fry", "middleweight", "heavyweight", "leviathan"];
export const classOf = lb => lb < CLASS_BREAK[0] ? 0 : lb < CLASS_BREAK[1] ? 1
  : lb < CLASS_BREAK[2] ? 2 : 3;

/* weight to the nearest doubling: the genus. It is the same number the ocean
   schools by, which is what makes a school one species. */
export const stepOf = size => Math.log2(size + 1) | 0;
const UNIT = ["B", "KB", "MB", "GB", "TB", "PB"];
export const stepLabel = step => (2 ** (step % 10)) + " " + UNIT[(step / 10) | 0];

/* which noun, out of the `n` an order has. Stepping through them by weight
   means one kind of file at eight sizes is eight species, so a drive with
   nothing exotic on it can still fill a dex. */
export const genusOf = (k, step, n) => (k.seed + step) % n;

/* a well-mixed number that every file of one family and one weight shares:
   what a bestiary rolls with when a kingdom leaves it more than one body plan */
export function cohortOf(k, step) {
  let h = (k.seed ^ Math.imul(step + 1, 0x9E3779B1)) >>> 0;
  h = Math.imul(h ^ h >>> 16, 0x85EBCA6B);
  h = Math.imul(h ^ h >>> 13, 0xC2B2AE35);
  return (h ^ h >>> 16) >>> 0;
}

/* the whole ladder, broadest first, as [rank, value] pairs. Zero bytes is its
   own domain: there is nothing in there to classify any further. */
export function ranksOf(k, size, order, species) {
  if (size === 0) return [["domain", "empty"], ["species", species]];
  const step = stepOf(size);
  return [
    ["domain", k.domain],
    ["kingdom", TREE[k.kingdom].label],
    ["phylum", k.phylum],
    ["class", CLASSES[classOf(step)]],
    ["order", order],
    ["family", k.label],
    ["genus", stepLabel(step)],
    ["species", species],
  ];
}
