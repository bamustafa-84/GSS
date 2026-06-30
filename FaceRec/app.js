/* =========================================================================
   Face Recognition Attendance Demo  (uses @vladmandic/face-api)
   - Loads a roster of known people from the images/ folder
   - Builds a descriptor for each person
   - Detects + matches every face in an uploaded / captured photo
   - Marks each roster member present or absent
   ========================================================================= */

// ---- 1. CONFIG --------------------------------------------------------------

// Models are loaded from the local models/ folder (downloaded, no CDN).
const MODEL_URL = "models";

// Root folder that holds one sub-folder per person (folder name = label).
const IMAGES_DIR = "images";

// The roster builds itself at runtime from the IMAGES_DIR listing.
// Each entry: { label, images: ["images/<name>/<file>", ...] }
let ROSTER = [];

// Distance below which a face is considered a match (lower = stricter).
const MATCH_THRESHOLD = 0.55;

// ---- 2. DOM REFS ------------------------------------------------------------

const statusEl       = document.getElementById("status");
const fileInput      = document.getElementById("fileInput");
const webcamBtn      = document.getElementById("webcamBtn");
const captureBtn     = document.getElementById("captureBtn");
const sampleBtn      = document.getElementById("sampleBtn");
const overlay        = document.getElementById("overlay");
const placeholder    = document.getElementById("placeholder");
const webcam         = document.getElementById("webcam");
const sampleVideo    = document.getElementById("sampleVideo");
const attendanceList = document.getElementById("attendanceList");
const presentCountEl = document.getElementById("presentCount");
const totalCountEl   = document.getElementById("totalCount");

const loader     = document.getElementById("loader");
const loaderText = document.getElementById("loaderText");
const loaderSub  = document.getElementById("loaderSub");
const loaderBar  = document.getElementById("loaderBar");

let faceMatcher = null;   // built from the roster
let webcamStream = null;

// ---- 3. STATUS HELPER -------------------------------------------------------

const STATUS_BASE = "text-sm px-4 py-2.5 rounded-xl mb-3";
const STATUS_STYLES = {
  loading: "bg-yellow-500/10 text-yellow-300",
  ready:   "bg-green-500/10 text-green-400",
  error:   "bg-red-500/10 text-red-400",
  working: "bg-blue-500/10 text-blue-300",
};

function setStatus(message, type = "loading") {
  statusEl.textContent = message;
  statusEl.className = `${STATUS_BASE} ${STATUS_STYLES[type] || STATUS_STYLES.loading}`;
}

// ---- 3b. FIRST-RUN LOADER ---------------------------------------------------

// Update the loader's headline, sub-text and progress bar (0–1 fraction).
function setLoader(text, sub, fraction) {
  if (text !== undefined) loaderText.textContent = text;
  if (sub !== undefined) loaderSub.textContent = sub;
  if (fraction !== undefined) loaderBar.style.width = `${Math.round(fraction * 100)}%`;
}

function hideLoader() {
  loader.hidden = true;
  loader.style.display = "none";
}

// Fill the attendance panel with shimmering placeholder rows while the
// roster is still being built. Each row shows the person's number + name and
// a "pending" badge that flips to a check as their descriptors finish.
function renderRosterSkeleton(people) {
  attendanceList.innerHTML = "";
  people.forEach((person, i) => {
    const li = document.createElement("li");
    li.id = `roster-row-${person.label}`;
    li.className =
      "flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700";
    li.innerHTML = `
      <span class="capitalize">${i + 1}. ${person.label}</span>
      <span class="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-slate-700 text-slate-300 inline-flex items-center gap-1.5">
        <span class="h-2.5 w-2.5 rounded-full border-2 border-slate-500 border-t-blue-400 animate-spin"></span>
        Scanning…
      </span>
    `;
    attendanceList.appendChild(li);
  });
  totalCountEl.textContent = people.length;
}

// Flip one skeleton row from "Scanning…" to a done state once that person's
// reference photos have been analysed.
function markPersonScanned(person, index, total, found) {
  const li = document.getElementById(`roster-row-${person.label}`);
  if (li) {
    const badge = li.querySelector("span:last-child");
    badge.className = found
      ? "text-xs px-2.5 py-0.5 rounded-full font-semibold bg-green-500/15 text-green-400"
      : "text-xs px-2.5 py-0.5 rounded-full font-semibold bg-red-500/15 text-red-400";
    badge.textContent = found ? "Ready ✓" : "No face";
  }
  setLoader(undefined, `${person.label} (${index} of ${total})`);
}

// ---- 4. STARTUP: load models + build roster --------------------------------

async function init() {
  try {
    // Browsers block fetch() on file:// , which breaks model/asset loading.
    if (location.protocol === "file:") {
      setStatus(
        "Please don't open the HTML file directly. Double-click start.bat instead, then visit http://localhost:5500",
        "error"
      );
      return;
    }

    setStatus("Starting compute backend…", "loading");
    setLoader("Starting compute backend…", "Warming up TensorFlow.", 0.05);
    await setupBackend();

    setStatus("Loading face-recognition models…", "loading");
    setLoader("Loading face-recognition models…", "Downloading model weights.", 0.15);
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);

    setStatus("Discovering roster from the images folder…", "loading");
    setLoader("Discovering roster…", "Scanning the images folder.", 0.3);
    ROSTER = await discoverRoster();
    if (!ROSTER.length) {
      throw new Error(`No people found in "${IMAGES_DIR}/". Add one sub-folder per person.`);
    }

    // Show skeleton rows for each discovered person while descriptors build.
    renderRosterSkeleton(ROSTER);

    setStatus("Building roster from reference photos…", "loading");
    setLoader("Building roster…", "Analysing reference photos.", 0.35);
    faceMatcher = await buildRoster();

    hideLoader();
    renderAttendance(new Set()); // everyone absent to start
    setStatus(`Ready. Roster: ${ROSTER.map(r => r.label).join(", ")}. Load a class photo.`, "ready");
  } catch (err) {
    console.error(err);
    hideLoader();
    setStatus("Startup failed: " + err.message + " (serve over http, not file://).", "error");
  }
}

// Pick a TensorFlow backend: WebGL if available, otherwise the local WASM
// build, otherwise the pure-JS CPU backend (slow but always works).
async function setupBackend() {
  const tf = faceapi.tf;

  // Must be set BEFORE any backend is initialized.
  if (typeof tf.setWasmPaths === "function") {
    tf.setWasmPaths("vendor/wasm/");
  }

  for (const backend of ["webgl", "wasm", "cpu"]) {
    try {
      await tf.setBackend(backend);
      await tf.ready();
      if (tf.getBackend() === backend) return backend;
    } catch (_) { /* try the next backend */ }
  }
  throw new Error("No usable TensorFlow backend (webgl/wasm/cpu all failed).");
}

// Read a directory listing from the server (returns an array of { name, dir }).
async function listDir(dirPath) {
  const res = await fetch(dirPath.replace(/\/?$/, "/"), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Cannot list "${dirPath}" (HTTP ${res.status}).`);
  return res.json();
}

// Build ROSTER automatically: every sub-folder of IMAGES_DIR is a person,
// every image inside it is a reference photo.
async function discoverRoster() {
  const entries = await listDir(IMAGES_DIR);
  const people = entries.filter(e => e.dir).sort((a, b) => a.name.localeCompare(b.name));
  const roster = [];
  for (const person of people) {
    const files = await listDir(`${IMAGES_DIR}/${person.name}`);
    const images = files
      .filter(f => !f.dir && /\.(png|jpe?g|webp|gif)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map(f => `${IMAGES_DIR}/${person.name}/${f.name}`);
    if (images.length) roster.push({ label: person.name, images });
  }
  return roster;
}

// Compute the descriptor for a single reference image.
async function describeImage(imgPath) {
  const img = await faceapi.fetchImage(imgPath);
  // Tightly-cropped faces (face filling the frame) confuse the SSD
  // detector, so add a margin before detecting.
  const detection = await faceapi
    .detectSingleFace(padImage(img))
    .withFaceLandmarks()
    .withFaceDescriptor();
  return detection ? detection.descriptor : null;
}

// For each person, compute a descriptor from their reference images.
// All images across the whole roster are detected concurrently (Promise.all),
// and results are cached in localStorage so subsequent loads skip detection.
async function buildRoster() {
  const cache = loadDescriptorCache();
  const cacheKey = ROSTER.flatMap(p => p.images).sort().join("|");
  const useCache = cache && cache.key === cacheKey;

  const labeledDescriptors = [];

  if (useCache) {
    for (const person of ROSTER) {
      const saved = cache.people[person.label];
      if (saved && saved.length) {
        labeledDescriptors.push(
          new faceapi.LabeledFaceDescriptors(
            person.label,
            saved.map(arr => new Float32Array(arr))
          )
        );
      }
    }
    setLoader("Loaded roster from cache", "Almost ready…", 1);
  } else {
    // Advance the progress bar as each image finishes (build phase = 0.35 → 1).
    const totalImages = ROSTER.reduce((n, p) => n + p.images.length, 0);
    let doneImages = 0;
    const tick = () => {
      doneImages++;
      loaderBar.style.width = `${Math.round((0.35 + 0.65 * (doneImages / totalImages)) * 100)}%`;
    };

    // Announce people in completion order: "3. Howard (3 of 5)".
    let completedPeople = 0;

    // Kick off every image detection at once, then group by person.
    await Promise.all(
      ROSTER.map(async person => {
        const results = await Promise.all(
          person.images.map(imgPath =>
            describeImage(imgPath)
              .catch(e => {
                console.warn(`Could not process ${imgPath}`, e);
                return null;
              })
              .finally(tick)
          )
        );
        const descriptors = results.filter(Boolean);
        if (descriptors.length) {
          labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(person.label, descriptors));
        } else {
          console.warn(`No usable face found for "${person.label}"`);
        }
        markPersonScanned(person, ++completedPeople, ROSTER.length, descriptors.length > 0);
      })
    );
    saveDescriptorCache(cacheKey, labeledDescriptors);
  }

  if (!labeledDescriptors.length) {
    throw new Error("No roster descriptors could be built.");
  }
  return new faceapi.FaceMatcher(labeledDescriptors, MATCH_THRESHOLD);
}

// ---- Descriptor cache (localStorage) ----------------------------------------

const DESCRIPTOR_CACHE_KEY = "faceRosterDescriptors";

function loadDescriptorCache() {
  try {
    return JSON.parse(localStorage.getItem(DESCRIPTOR_CACHE_KEY));
  } catch (_) {
    return null;
  }
}

function saveDescriptorCache(key, labeledDescriptors) {
  try {
    const people = {};
    for (const ld of labeledDescriptors) {
      people[ld.label] = ld.descriptors.map(d => Array.from(d));
    }
    localStorage.setItem(DESCRIPTOR_CACHE_KEY, JSON.stringify({ key, people }));
  } catch (e) {
    console.warn("Could not cache descriptors", e);
  }
}

// Draw an image centred on a larger canvas so the face occupies a smaller
// fraction of the frame. Returns the padded canvas (used for detection only).
function padImage(img, pad = 0.4) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * (1 + pad * 2));
  canvas.height = Math.round(h * (1 + pad * 2));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#7f7f7f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, Math.round(w * pad), Math.round(h * pad));
  return canvas;
}

// ---- 5. PROCESS A PHOTO -----------------------------------------------------

async function processImage(input) {
  if (!faceMatcher) return;
  setStatus("Detecting faces…", "working");
  placeholder.hidden = true;

  // Draw the source onto the overlay canvas at its natural size.
  const width  = input.videoWidth || input.naturalWidth || input.width;
  const height = input.videoHeight || input.naturalHeight || input.height;
  overlay.width = width;
  overlay.height = height;
  const ctx = overlay.getContext("2d");
  ctx.drawImage(input, 0, 0, width, height);

  const detections = await faceapi
    .detectAllFaces(input)
    .withFaceLandmarks()
    .withFaceDescriptors();

  const presentLabels = new Set();

  detections.forEach(det => {
    const best = faceMatcher.findBestMatch(det.descriptor);
    const box = det.detection.box;
    const isKnown = best.label !== "unknown";
    if (isKnown) presentLabels.add(best.label);

    // Draw box
    ctx.lineWidth = Math.max(2, width / 300);
    ctx.strokeStyle = isKnown ? "#29c46b" : "#ff5c7a";
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    // Draw label
    const text = isKnown ? `${best.label} (${best.distance.toFixed(2)})` : "unknown";
    ctx.font = `${Math.max(14, width / 45)}px system-ui, sans-serif`;
    const padding = 6;
    const textWidth = ctx.measureText(text).width;
    const labelHeight = Math.max(20, width / 35);
    ctx.fillStyle = isKnown ? "#29c46b" : "#ff5c7a";
    ctx.fillRect(box.x, box.y - labelHeight, textWidth + padding * 2, labelHeight);
    ctx.fillStyle = "#0a0d18";
    ctx.fillText(text, box.x + padding, box.y - labelHeight / 4);
  });

  renderAttendance(presentLabels);
  setStatus(`Done. Detected ${detections.length} face(s), ${presentLabels.size} matched on roster.`, "ready");
}

// ---- 6. RENDER ATTENDANCE LIST ----------------------------------------------

function renderAttendance(presentLabels) {
  attendanceList.innerHTML = "";
  ROSTER.forEach(person => {
    const present = presentLabels.has(person.label);
    const li = document.createElement("li");
    li.className = "flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700";
    li.innerHTML = `
      <span class="capitalize">${present ? "✅" : "⬜"} ${person.label}</span>
      <span class="text-xs px-2.5 py-0.5 rounded-full font-semibold ${present ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}">${present ? "Present" : "Absent"}</span>
    `;
    attendanceList.appendChild(li);
  });
  presentCountEl.textContent = presentLabels.size;
  totalCountEl.textContent = ROSTER.length;
}

// ---- 7. INPUT SOURCES -------------------------------------------------------

// (a) Upload a photo
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  stopWebcam();
  const img = new Image();
  img.onload = () => processImage(img);
  img.src = URL.createObjectURL(file);
});

// (b) Webcam
webcamBtn.addEventListener("click", async () => {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
    webcam.srcObject = webcamStream;
    webcam.hidden = false;
    overlay.hidden = true;
    placeholder.hidden = true;
    captureBtn.hidden = false;
    setStatus("Webcam on. Frame the class, then press Capture.", "working");
  } catch (e) {
    setStatus("Could not access webcam: " + e.message, "error");
  }
});

captureBtn.addEventListener("click", async () => {
  overlay.hidden = false;
  webcam.hidden = true;
  await processImage(webcam);
  stopWebcam();
  captureBtn.hidden = true;
});

function stopWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
  }
  webcam.hidden = true;
  captureBtn.hidden = true;
}

// (c) Sample frame from the bundled video
sampleBtn.addEventListener("click", () => {
  stopWebcam();
  setStatus("Loading sample video frame…", "working");
  sampleVideo.currentTime = 2; // grab a frame a couple seconds in
  sampleVideo.addEventListener("seeked", function onSeeked() {
    sampleVideo.removeEventListener("seeked", onSeeked);
    processImage(sampleVideo);
  });
  // Some browsers need a load nudge.
  sampleVideo.load();
  sampleVideo.addEventListener("loadeddata", () => { sampleVideo.currentTime = 2; }, { once: true });
});

// ---- 8. GO ------------------------------------------------------------------

init();
