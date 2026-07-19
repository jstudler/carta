/**
 * convert-media.mjs — produce web-safe, cross-browser media and keep the content
 * folder + HTML/Markdown metadata in sync.
 *
 * It is IDEMPOTENT: run it as often as you like; it only encodes what is missing
 * or invalid. For every source asset it writes a MODERN format plus a UNIVERSAL
 * fallback (see shared/mediaFormats.ts):
 *   - video   : .webm (VP9/Opus)  + .mp4 (H.264/AAC)
 *   - audio   : .webm (Opus)      + .mp3 (MP3)
 *   - picture : .avif + .webp      + .jpg
 *
 * Audio/video rules (context-aware via frontmatter):
 *   - If the same source file is referenced as both kind:audio AND kind:video,
 *     produce a video-only file AND a separate audio-only file. Fail if the video
 *     has no audio stream.
 *   - If a card has a separate audio sidecar, strip audio from its video outputs.
 *   - If a card has NO explicit audio sidecar, keep audio in video files.
 *   - Multiple videos on the same card may all keep their audio.
 *   - Maximum one audio sidecar per card.
 *
 * All converted files target a configurable max size (default 25 MB) to allow
 * hosting on Cloudflare Pages. Bitrate is adjusted for long media.
 *
 * The source directory may contain any depth of subdirectories; all web-rendered
 * output goes to a flat output directory (default `.content-cache/`) that is
 * git-ignored and decoupled from the source tree.
 *
 * Usage:
 *   node tools/convert/convert-media.mjs <source-dir> [output-dir] [--max-size-mb=25]
 */

import { readdirSync, existsSync, statSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, extname, basename, resolve, relative } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import sharp from 'sharp';
import matter from 'gray-matter';
import { WEB_FORMATS, NON_WEB_EXT } from '../../shared/mediaFormats.ts';

// --- CLI args ---------------------------------------------------------------

const args = process.argv.slice(2);
const flagIdx = args.findIndex((a) => a.startsWith('--max-size-mb='));
let MAX_SIZE_MB = 25;
if (flagIdx !== -1) {
  MAX_SIZE_MB = Number(args[flagIdx].split('=')[1]) || 25;
  args.splice(flagIdx, 1);
}
const [srcArg, outArg] = args;

if (!srcArg) {
  console.error('Usage: node tools/convert/convert-media.mjs <source-dir> [output-dir] [--max-size-mb=25]');
  process.exit(1);
}

const SRC = resolve(srcArg);
const OUT = resolve(outArg ?? join(resolve('.'), '.content-cache'));
const MAX_IMAGE_EDGE = 2200;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
/** Hard deployment ceiling (Cloudflare Pages). Passthrough uses this, not the encoding budget. */
const DEPLOY_MAX_BYTES = 25 * 1024 * 1024;

/**
 * LQIP (low-quality image placeholder) for videos: a single frame grabbed at 10%
 * of the duration, downscaled to a thumbnail and stored as a base64 JPEG data URI
 * in `<stem>.lqip.txt`. buildIndex inlines that string into the content index so
 * the canvas can paint a blurred still WITHOUT mounting a <video> or fetching the
 * media file. Kept tiny because it ships inside the JS bundle.
 * `.txt` is deliberately not a media extension, so the file is invisible to both
 * groupByStem() here and collectDeployableMedia() in contentPlugin.ts — it never
 * reaches dist/content.
 */
const LQIP_WIDTH = 64;
const LQIP_QUALITY = 40;
const LQIP_MAX_BYTES = 4096;

if (!existsSync(SRC)) {
  console.error(`Source folder not found: ${SRC}`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const hasFfprobe = spawnSync('ffprobe', ['-version']).status === 0;
if (!hasFfmpeg || !hasFfprobe) {
  console.error('ffmpeg and ffprobe are required on PATH for audio/video conversion.');
  process.exit(1);
}

// --- File classification ---------------------------------------------------

const IMAGE_EXT = new Set(['avif', 'webp', 'jpg', 'jpeg', 'png', 'tiff', 'tif', 'heic', 'heif']);
const VIDEO_EXT = new Set(['webm', 'mp4', 'mov', 'm4v', 'mkv', 'avi']);
const AUDIO_EXT = new Set(['webm', 'mp3', 'm4a', 'aac', 'wav', 'flac', 'aiff', 'aif', 'ogg', 'opus']);

const nonWeb = (kind, ext) => NON_WEB_EXT[kind].includes(ext);

/** Lowercase extension without the dot. */
function ext(file) {
  return extname(file).slice(1).toLowerCase();
}

/** True for the parked-original naming `<stem>.orig.<ext>`. */
function isOrig(file) {
  return /\.orig\.[^.]+$/i.test(file);
}

/** Get duration of a media file in seconds. */
function getDuration(path) {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
      { encoding: 'utf8' },
    ).trim();
    return parseFloat(out) || 0;
  } catch {
    return 0;
  }
}

/** Probe whether a media file has a stream of the given type ('video'|'audio'). */
function hasStream(path, type) {
  if (!existsSync(path)) return false;
  try {
    const out = execFileSync(
      'ffprobe',
      [
        '-v', 'error',
        '-select_streams', type === 'video' ? 'v:0' : 'a:0',
        '-show_entries', 'stream=codec_type',
        '-of', 'csv=p=0',
        path,
      ],
      { encoding: 'utf8' },
    ).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

/** Probe whether a media file is readable + has a stream of the wanted type. */
function isValidMedia(path, wantVideo) {
  if (!existsSync(path)) return false;
  return hasStream(path, wantVideo ? 'video' : 'audio');
}

/** Get the codec name for a given stream type ('video' or 'audio'). Returns null if absent. */
function getCodec(path, type) {
  try {
    const out = execFileSync(
      'ffprobe',
      [
        '-v', 'error',
        '-select_streams', type === 'video' ? 'v:0' : 'a:0',
        '-show_entries', 'stream=codec_name',
        '-of', 'csv=p=0',
        path,
      ],
      { encoding: 'utf8' },
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

/** Acceptable codecs for each web format. */
const WEB_CODECS = {
  mp4: { video: ['h264'], audio: ['aac'] },
  webm: { video: ['vp9', 'vp8'], audio: ['opus', 'vorbis'] },
  mp3: { audio: ['mp3'] },
};

/**
 * Check if a source file can be used as-is for a given output variant.
 * Requirements: same extension, correct codecs, and under the deployment limit.
 * Uses DEPLOY_MAX_BYTES (hard hosting limit), not MAX_SIZE_BYTES (encoding budget).
 */
function canPassthrough(srcPath, srcExt, variantExt, kind, stripAudio) {
  if (srcExt !== variantExt) return false;
  if (statSync(srcPath).size > DEPLOY_MAX_BYTES) return false;

  const spec = WEB_CODECS[variantExt];
  if (!spec) return false;

  if (kind === 'video') {
    const vCodec = getCodec(srcPath, 'video');
    if (!vCodec || !spec.video?.includes(vCodec)) return false;
    if (!stripAudio) {
      const aCodec = getCodec(srcPath, 'audio');
      if (aCodec && !spec.audio?.includes(aCodec)) return false;
    }
  } else if (kind === 'audio') {
    const aCodec = getCodec(srcPath, 'audio');
    if (!aCodec || !spec.audio?.includes(aCodec)) return false;
  }
  return true;
}

function isValidImage(path) {
  if (!existsSync(path)) return false;
  try {
    const r = spawnSync(
      process.execPath,
      ['-e', `import('sharp').then(s=>s.default('${path.replace(/\\/g, '\\\\')}').metadata()).then(m=>process.exit(m.width>0?0:1)).catch(()=>process.exit(1))`],
    );
    return r.status === 0;
  } catch {
    return false;
  }
}

// --- Bitrate calculation (respect max file size) ----------------------------

/**
 * Compute target video bitrate (kbps) to stay within MAX_SIZE_BYTES.
 * Returns 0 when the file would comfortably fit with CRF-only encoding.
 */
function videoBitrate(durationSec, stripAudio) {
  if (durationSec <= 0) return 0;
  const audioBits = stripAudio ? 0 : 128 * 1000 * durationSec;
  const availableBits = MAX_SIZE_BYTES * 8 - audioBits;
  if (availableBits <= 0) return 500;
  const kbps = Math.floor(availableBits / durationSec / 1000);
  // If comfortably under limit at typical CRF quality (~2000kbps), use CRF.
  if (kbps > 4000) return 0;
  return Math.max(500, kbps);
}

/**
 * Compute target audio bitrate (kbps) to stay within MAX_SIZE_BYTES.
 */
function audioBitrate(durationSec) {
  if (durationSec <= 0) return 128;
  const kbps = Math.floor((MAX_SIZE_BYTES * 8) / durationSec / 1000);
  return Math.min(192, Math.max(64, kbps));
}

// --- Encoders --------------------------------------------------------------

function encodeVideoWebm(input, output, { stripAudio = false, maxBitrateKbps = 0 } = {}) {
  if (maxBitrateKbps > 0) {
    // Two-pass encoding for accurate bitrate targeting with VP9.
    const passLogFile = join(OUT, `ffmpeg2pass-${basename(output, '.webm')}`);
    const baseArgs = ['-y', '-loglevel', 'error', '-i', input,
      '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-row-mt', '1',
      '-b:v', `${maxBitrateKbps}k`, '-maxrate', `${Math.round(maxBitrateKbps * 1.45)}k`,
      '-bufsize', `${maxBitrateKbps * 2}k`,
    ];
    // Pass 1: analysis only.
    execFileSync('ffmpeg', [
      ...baseArgs, '-passlogfile', passLogFile,
      '-pass', '1', '-an', '-f', 'null', '/dev/null',
    ], { stdio: 'inherit' });
    // Pass 2: actual encode.
    const a2 = [...baseArgs, '-passlogfile', passLogFile, '-pass', '2'];
    if (stripAudio) {
      a2.push('-an');
    } else {
      a2.push('-c:a', 'libopus', '-b:a', '128k');
    }
    a2.push(output);
    execFileSync('ffmpeg', a2, { stdio: 'inherit' });
    // Clean up pass log files.
    for (const f of readdirSync(OUT)) {
      if (f.startsWith(basename(passLogFile))) unlinkSync(join(OUT, f));
    }
  } else {
    // CRF mode (no bitrate target).
    const a = ['-y', '-loglevel', 'error', '-i', input];
    a.push('-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-row-mt', '1');
    a.push('-b:v', '0', '-crf', '33');
    if (stripAudio) {
      a.push('-an');
    } else {
      a.push('-c:a', 'libopus', '-b:a', '128k');
    }
    a.push(output);
    execFileSync('ffmpeg', a, { stdio: 'inherit' });
  }
}

function encodeVideoMp4(input, output, { stripAudio = false, maxBitrateKbps = 0 } = {}) {
  const a = ['-y', '-loglevel', 'error', '-i', input];
  a.push('-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
  if (maxBitrateKbps > 0) {
    a.push('-b:v', `${maxBitrateKbps}k`, '-maxrate', `${Math.round(maxBitrateKbps * 1.5)}k`, '-bufsize', `${maxBitrateKbps * 2}k`);
  } else {
    a.push('-crf', '21');
  }
  if (stripAudio) {
    a.push('-an');
  } else {
    a.push('-c:a', 'aac', '-b:a', '160k');
  }
  a.push(output);
  execFileSync('ffmpeg', a, { stdio: 'inherit' });
}

function encodeAudioWebm(input, output, { bitrateKbps = 128 } = {}) {
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', input,
    '-vn', '-c:a', 'libopus', '-b:a', `${bitrateKbps}k`,
    output,
  ], { stdio: 'inherit' });
}

function encodeAudioMp3(input, output, { bitrateKbps = 0 } = {}) {
  const a = ['-y', '-loglevel', 'error', '-i', input, '-vn'];
  if (bitrateKbps > 0 && bitrateKbps < 160) {
    a.push('-c:a', 'libmp3lame', '-b:a', `${bitrateKbps}k`);
  } else {
    a.push('-c:a', 'libmp3lame', '-q:a', '2');
  }
  a.push(output);
  execFileSync('ffmpeg', a, { stdio: 'inherit' });
}

async function encodeImage(input, output, format) {
  const pipeline = sharp(input)
    .rotate()
    .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: 'inside', withoutEnlargement: true });
  if (format === 'avif') await pipeline.avif({ quality: 55 }).toFile(output);
  else if (format === 'webp') await pipeline.webp({ quality: 78 }).toFile(output);
  else await pipeline.jpeg({ quality: 82, mozjpeg: true }).toFile(output);
}

/**
 * Write `<stem>.lqip.txt` — a base64 JPEG data URI of a frame at ~10% of the
 * video's duration. Idempotent and never fatal: a missing LQIP just falls back to
 * the flat placeholder tint on the canvas.
 * Returns the byte length written, or 0 when skipped/failed.
 */
async function writeVideoLqip(inputPath, stem) {
  const out = join(OUT, `${stem}.lqip.txt`);
  if (existsSync(out)) return 0;
  try {
    // -ss before -i enables fast (keyframe) seeking, which is plenty for a still.
    const seek = Math.max(0, getDuration(inputPath) * 0.1);
    const frame = execFileSync(
      'ffmpeg',
      [
        '-y', '-loglevel', 'error',
        '-ss', seek.toFixed(3),
        '-i', inputPath,
        '-frames:v', '1', '-f', 'image2', '-vcodec', 'mjpeg',
        '-',
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    if (!frame || frame.length === 0) throw new Error('ffmpeg produced no frame');

    const jpeg = await sharp(frame)
      .resize({ width: LQIP_WIDTH })
      .jpeg({ quality: LQIP_QUALITY, mozjpeg: true })
      .toBuffer();
    const uri = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
    if (uri.length > LQIP_MAX_BYTES) {
      console.warn(`LQIP for ${stem} is ${uri.length} B (over ${LQIP_MAX_BYTES} B) — it ships inside the JS bundle.`);
    }
    writeFileSync(out, uri);
    console.log(`lqip \u2192 ${stem}.lqip.txt (${uri.length} B)`);
    return uri.length;
  } catch (err) {
    console.error(`Failed to build LQIP for ${stem}: ${err.message ?? err}`);
    return 0;
  }
}

// --- Content context (frontmatter analysis) ---------------------------------

/** True for files that should be skipped (drafts, hidden). */
function isIgnoredEntry(name) {
  return name.startsWith('_draft_') || name.startsWith('.');
}

/** Recursively find content files (.html / .md) in the source tree. */
function walkContentFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (isIgnoredEntry(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkContentFiles(full));
    } else {
      const lower = entry.name.toLowerCase();
      if (lower.endsWith('.html') || lower.endsWith('.md')) {
        results.push(full);
      }
    }
  }
  return results;
}

/**
 * Parse all content files to build a context map of how each media stem is used.
 * Returns a Map<stem, { usedAsAudio, usedAsVideo, cardHasSeparateAudio, sharedFile }>
 */
function buildStemContext() {
  const stemContext = new Map();
  const cardMedia = new Map();

  for (const path of walkContentFiles(SRC)) {
    const raw = readFileSync(path, 'utf8');
    const parsed = matter(raw);
    const sidecars = parsed.data?.sidecars ?? [];
    if (!Array.isArray(sidecars) || sidecars.length === 0) continue;

    const contentStem = basename(path, extname(path));
    const audioStems = new Set();
    const videoStems = new Set();

    for (const sc of sidecars) {
      if (!sc?.filename || !sc?.kind) continue;
      const stem = basename(sc.filename, extname(sc.filename));
      const ctx = stemContext.get(stem) ?? {
        usedAsAudio: false,
        usedAsVideo: false,
        cardHasSeparateAudio: false,
        sharedFile: false,
      };
      if (sc.kind === 'audio') {
        ctx.usedAsAudio = true;
        audioStems.add(stem);
      }
      if (sc.kind === 'video') {
        ctx.usedAsVideo = true;
        videoStems.add(stem);
      }
      stemContext.set(stem, ctx);
    }
    cardMedia.set(contentStem, { audioStems, videoStems });
  }

  // Mark stems where the same file is both audio+video.
  for (const [, ctx] of stemContext) {
    if (ctx.usedAsAudio && ctx.usedAsVideo) {
      ctx.sharedFile = true;
    }
  }

  // Mark video stems whose card has a separate audio sidecar (different stem).
  for (const [, { audioStems, videoStems }] of cardMedia) {
    if (audioStems.size > 0) {
      for (const vStem of videoStems) {
        const ctx = stemContext.get(vStem);
        if (ctx && !ctx.sharedFile) {
          ctx.cardHasSeparateAudio = true;
        }
      }
    }
  }

  return stemContext;
}

// --- Group files by stem ---------------------------------------------------

function walkMediaFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (isIgnoredEntry(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMediaFiles(full));
    } else {
      const e = ext(entry.name);
      if (!e) continue;
      if (entry.name.toLowerCase().endsWith('.html') || entry.name.toLowerCase().endsWith('.md')) continue;
      if (IMAGE_EXT.has(e) || VIDEO_EXT.has(e) || AUDIO_EXT.has(e)) {
        results.push({ file: entry.name, absDir: dir });
      }
    }
  }
  return results;
}

function groupByStem() {
  const groups = new Map();
  for (const { file, absDir } of walkMediaFiles(SRC)) {
    let stem;
    let e;
    if (isOrig(file)) {
      e = ext(file);
      stem = basename(file).replace(/\.orig\.[^.]+$/i, '');
    } else {
      e = ext(file);
      if (!e) continue;
      stem = basename(file, extname(file));
    }
    if (!IMAGE_EXT.has(e) && !VIDEO_EXT.has(e) && !AUDIO_EXT.has(e)) continue;
    const g = groups.get(stem) ?? { files: [] };
    g.files.push({ file, ext: e, orig: isOrig(file), absDir });
    groups.set(stem, g);
  }
  return groups;
}

function kindOf(files) {
  const exts = files.map((f) => f.ext);
  if (exts.some((e) => IMAGE_EXT.has(e) && !VIDEO_EXT.has(e) && !AUDIO_EXT.has(e))) return 'picture';
  if (exts.some((e) => VIDEO_EXT.has(e) && e !== 'webm')) return 'video';
  if (exts.some((e) => AUDIO_EXT.has(e) && e !== 'webm')) return 'audio';
  const webm = files.find((f) => f.ext === 'webm');
  if (webm) return isValidMedia(join(webm.absDir, webm.file), true) ? 'video' : 'audio';
  return null;
}

function pickMaster(kind, files) {
  const orig = files.find((f) => f.orig);
  if (orig) return { file: orig.file, absDir: orig.absDir };
  const original = files.find((f) => nonWeb(kind, f.ext));
  if (original) return { file: original.file, absDir: original.absDir };
  const fallbackExt = WEB_FORMATS[kind][WEB_FORMATS[kind].length - 1].ext;
  const fallback = files.find((f) => f.ext === fallbackExt || (kind === 'picture' && f.ext === 'jpeg'));
  if (fallback) return { file: fallback.file, absDir: fallback.absDir };
  const modern = files.find((f) => f.ext === WEB_FORMATS[kind][0].ext);
  const pick = modern ?? files[0];
  return { file: pick.file, absDir: pick.absDir };
}

// --- Main ------------------------------------------------------------------

console.log(`Max output file size: ${MAX_SIZE_MB} MB`);

const stemContext = buildStemContext();
const groups = groupByStem();
let encoded = 0;
let skipped = 0;
let lqipBytes = 0;

for (const [stem, group] of groups) {
  const kind = kindOf(group.files);
  if (!kind) continue;
  const master = pickMaster(kind, group.files);
  const masterPath = join(master.absDir, master.file);

  const ctx = stemContext.get(stem) ?? {
    usedAsAudio: false,
    usedAsVideo: false,
    cardHasSeparateAudio: false,
    sharedFile: false,
  };

  // --- Shared file case: same file referenced as both kind:audio + kind:video
  if (ctx.sharedFile && kind === 'video') {
    if (!hasStream(masterPath, 'audio')) {
      console.error(`FATAL: "${stem}" is referenced as kind:audio but the video has no audio stream.`);
      process.exit(1);
    }

    const duration = getDuration(masterPath);
    const vBitrate = videoBitrate(duration, true);
    const aBitrate = audioBitrate(duration);

    // Video-only web variants.
    for (const variant of WEB_FORMATS.video) {
      const out = join(OUT, `${stem}.${variant.ext}`);
      if (isValidMedia(out, true)) { skipped += 1; continue; }
      try {
        if (variant.ext === 'webm') encodeVideoWebm(masterPath, out, { stripAudio: true, maxBitrateKbps: vBitrate });
        else encodeVideoMp4(masterPath, out, { stripAudio: true, maxBitrateKbps: vBitrate });
        console.log(`video (no audio) \u2192 ${stem}.${variant.ext}`);
        encoded += 1;
      } catch (err) {
        console.error(`Failed to encode ${stem}.${variant.ext}: ${err.message ?? err}`);
      }
    }

    // Audio-only web variants. The .webm extension would collide with the video
    // .webm above, so we only produce .mp3 for the audio track of shared files.
    for (const variant of WEB_FORMATS.audio) {
      if (variant.ext === 'webm') { skipped += 1; continue; }
      const out = join(OUT, `${stem}.${variant.ext}`);
      if (isValidMedia(out, false)) { skipped += 1; continue; }
      try {
        encodeAudioMp3(masterPath, out, { bitrateKbps: aBitrate });
        console.log(`audio (extracted) \u2192 ${stem}.${variant.ext}`);
        encoded += 1;
      } catch (err) {
        console.error(`Failed to encode ${stem}.${variant.ext}: ${err.message ?? err}`);
      }
    }

    lqipBytes += await writeVideoLqip(masterPath, stem);
    continue;
  }

  // --- Normal video: strip audio if the card has a separate audio sidecar ----
  if (kind === 'video') {
    const stripAudio = ctx.cardHasSeparateAudio;
    const masterExt = ext(master.file);
    const duration = getDuration(masterPath);
    const vBitrate = videoBitrate(duration, stripAudio);

    for (const variant of WEB_FORMATS.video) {
      const out = join(OUT, `${stem}.${variant.ext}`);
      // Passthrough: source already has correct format, codecs, and fits deploy limit.
      if (!stripAudio && canPassthrough(masterPath, masterExt, variant.ext, 'video', false)) {
        const srcSize = statSync(masterPath).size;
        if (existsSync(out) && statSync(out).size <= srcSize) { skipped += 1; continue; }
        copyFileSync(masterPath, out);
        console.log(`video (passthrough) \u2192 ${stem}.${variant.ext}`);
        encoded += 1;
        continue;
      }
      if (isValidMedia(out, true)) { skipped += 1; continue; }
      try {
        if (variant.ext === 'webm') encodeVideoWebm(masterPath, out, { stripAudio, maxBitrateKbps: vBitrate });
        else encodeVideoMp4(masterPath, out, { stripAudio, maxBitrateKbps: vBitrate });
        console.log(`video${stripAudio ? ' (no audio)' : ''} \u2192 ${stem}.${variant.ext}`);
        encoded += 1;
      } catch (err) {
        console.error(`Failed to encode ${stem}.${variant.ext}: ${err.message ?? err}`);
      }
    }

    lqipBytes += await writeVideoLqip(masterPath, stem);
    continue;
  }

  // --- Normal audio ----------------------------------------------------------
  if (kind === 'audio') {
    const masterExt = ext(master.file);
    const duration = getDuration(masterPath);
    const aBitrate = audioBitrate(duration);

    for (const variant of WEB_FORMATS.audio) {
      const out = join(OUT, `${stem}.${variant.ext}`);
      // Passthrough: source already has correct format, codec, and fits deploy limit.
      if (canPassthrough(masterPath, masterExt, variant.ext, 'audio', false)) {
        const srcSize = statSync(masterPath).size;
        if (existsSync(out) && statSync(out).size <= srcSize) { skipped += 1; continue; }
        copyFileSync(masterPath, out);
        console.log(`audio (passthrough) \u2192 ${stem}.${variant.ext}`);
        encoded += 1;
        continue;
      }
      if (isValidMedia(out, false)) { skipped += 1; continue; }
      try {
        if (variant.ext === 'webm') encodeAudioWebm(masterPath, out, { bitrateKbps: aBitrate });
        else encodeAudioMp3(masterPath, out, { bitrateKbps: aBitrate });
        console.log(`audio \u2192 ${stem}.${variant.ext}`);
        encoded += 1;
      } catch (err) {
        console.error(`Failed to encode ${stem}.${variant.ext}: ${err.message ?? err}`);
      }
    }
    continue;
  }

  // --- Images ----------------------------------------------------------------
  for (const variant of WEB_FORMATS.picture) {
    const out = join(OUT, `${stem}.${variant.ext}`);
    if (isValidImage(out)) { skipped += 1; continue; }
    try {
      await encodeImage(masterPath, out, variant.ext);
      console.log(`picture \u2192 ${stem}.${variant.ext}`);
      encoded += 1;
    } catch (err) {
      console.error(`Failed to encode ${stem}.${variant.ext}: ${err.message ?? err}`);
    }
  }

  // --- Mixed picture+audio: stem has image files but is also used as audio ---
  if (kind === 'picture' && ctx.usedAsAudio) {
    const audioFile = group.files.find((f) => AUDIO_EXT.has(f.ext) && !VIDEO_EXT.has(f.ext));
    if (audioFile) {
      const audioPath = join(audioFile.absDir, audioFile.file);
      const duration = getDuration(audioPath);
      const aBitrate = audioBitrate(duration);
      for (const variant of WEB_FORMATS.audio) {
        const out = join(OUT, `${stem}.${variant.ext}`);
        if (isValidMedia(out, false)) { skipped += 1; continue; }
        try {
          if (variant.ext === 'webm') encodeAudioWebm(audioPath, out, { bitrateKbps: aBitrate });
          else encodeAudioMp3(audioPath, out, { bitrateKbps: aBitrate });
          console.log(`audio (from picture+audio stem) \u2192 ${stem}.${variant.ext}`);
          encoded += 1;
        } catch (err) {
          console.error(`Failed to encode ${stem}.${variant.ext}: ${err.message ?? err}`);
        }
      }
    }
  }
}

// --- Size check: warn about any output files exceeding the limit ------------

let oversized = 0;
if (existsSync(OUT)) {
  for (const f of readdirSync(OUT)) {
    const fp = join(OUT, f);
    const st = statSync(fp);
    if (!st.isFile()) continue;
    if (st.size > MAX_SIZE_BYTES) {
      console.warn(`WARNING: ${f} is ${(st.size / 1024 / 1024).toFixed(1)} MB (exceeds ${MAX_SIZE_MB} MB limit)`);
      oversized += 1;
    }
  }
}

console.log(
  `Done. Encoded ${encoded}, skipped ${skipped} valid. Output in: ${OUT}` +
    (lqipBytes ? ` (+${(lqipBytes / 1024).toFixed(1)} kB of video LQIPs inlined into the bundle)` : '') +
    (oversized ? ` (${oversized} file(s) exceed ${MAX_SIZE_MB} MB limit!)` : ''),
);
