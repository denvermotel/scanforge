// generato dal commit 1d28524: non modificare
// Riferimento ScanForge 0.2: il codice qui sotto e' copiato alla lettera da
// scanforge.html del commit 1d28524 (script testbench/tools/make_ref02.py).
// Serve al banco come termine di paragone dell'elaborazione 0.2.
(function () {
  // Stub locali: il codice 0.2 li chiama ma nel riferimento non fanno nulla
  // di grafico. showToast e' agganciato da Ref02.detect per sapere quando
  // autoDetectCorners ha finito (successo o rifiuto).
  const state = {pages: [], currentIdx: 0, projectName: '', a4Compose: false};
  let toastHook = null;
  function showToast() { if (toastHook) toastHook(); }
  function positionHandles() {}
  function renderPreview() {}
  function setMode() {}

function solveLinearSystem(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col+1; row < n; row++)
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-10) continue;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = M[row][col] / M[col][col];
      for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function computeHomography(srcPts, dstPts) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const {x:sx, y:sy} = srcPts[i];
    const {x:dx, y:dy} = dstPts[i];
    A.push([sx, sy, 1, 0, 0, 0, -dx*sx, -dx*sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy*sx, -dy*sy]);
    b.push(dy);
  }
  const h = solveLinearSystem(A, b);
  return [[h[0],h[1],h[2]],[h[3],h[4],h[5]],[h[6],h[7],1]];
}

function applyH(H, x, y) {
  const w = H[2][0]*x + H[2][1]*y + H[2][2];
  return {x: (H[0][0]*x + H[0][1]*y + H[0][2])/w,
          y: (H[1][0]*x + H[1][1]*y + H[1][2])/w};
}

function bilinearSample(data, W, H, fx, fy) {
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0+1, W-1), y1 = Math.min(y0+1, H-1);
  const dx = fx - x0, dy = fy - y0;
  const i00 = (y0*W+x0)*4, i10 = (y0*W+x1)*4;
  const i01 = (y1*W+x0)*4, i11 = (y1*W+x1)*4;
  const r = [0,1,2,3].map(c =>
    data[i00+c]*(1-dx)*(1-dy) + data[i10+c]*dx*(1-dy) +
    data[i01+c]*(1-dx)*dy   + data[i11+c]*dx*dy
  );
  return r;
}

function warpPerspective(srcCanvas, corners_pct, dstW, dstH) {
  const SW = srcCanvas.width, SH = srcCanvas.height;
  const srcCtx = srcCanvas.getContext('2d');
  const srcData = srcCtx.getImageData(0, 0, SW, SH).data;

  // Source points in pixel coords
  const srcPts = ['tl','tr','br','bl'].map(c => ({
    x: corners_pct[c].x / 100 * SW,
    y: corners_pct[c].y / 100 * SH
  }));
  // Destination = full rectangle
  const dstPts = [{x:0,y:0},{x:dstW-1,y:0},{x:dstW-1,y:dstH-1},{x:0,y:dstH-1}];

  // Compute H from dst -> src (inverse mapping)
  const H = computeHomography(dstPts, srcPts);

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = dstW; dstCanvas.height = dstH;
  const dstCtx = dstCanvas.getContext('2d');
  const dstImgData = dstCtx.createImageData(dstW, dstH);
  const dst = dstImgData.data;

  for (let dy = 0; dy < dstH; dy++) {
    for (let dx2 = 0; dx2 < dstW; dx2++) {
      const {x: sx, y: sy} = applyH(H, dx2, dy);
      if (sx < 0 || sx >= SW-1 || sy < 0 || sy >= SH-1) continue;
      const sample = bilinearSample(srcData, SW, SH, sx, sy);
      const outIdx = (dy*dstW + dx2)*4;
      dst[outIdx] = sample[0]; dst[outIdx+1] = sample[1];
      dst[outIdx+2] = sample[2]; dst[outIdx+3] = 255;
    }
  }
  dstCtx.putImageData(dstImgData, 0, 0);
  return dstCanvas;
}

function applyKeystone(canvas, kv, kh) {
  if (!kv && !kh) return canvas;
  const c = {tl: {x:0,y:0}, tr: {x:100,y:0}, br: {x:100,y:100}, bl: {x:0,y:100}};
  if (kv > 0)      { c.tl.x = kv;  c.tr.x = 100 - kv; }
  else if (kv < 0) { c.bl.x = -kv; c.br.x = 100 + kv; }
  if (kh > 0)      { c.tl.y = kh;  c.bl.y = 100 - kh; }
  else if (kh < 0) { c.tr.y = -kh; c.br.y = 100 + kh; }
  return warpPerspective(canvas, c, canvas.width, canvas.height);
}

function applyFineRotation(canvas, deg) {
  if (!deg) return canvas;
  const W = canvas.width, H = canvas.height;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2);
  ctx.rotate(deg * Math.PI / 180);
  ctx.drawImage(canvas, -W / 2, -H / 2);
  return out;
}

function removeShadows(canvas) {
  const W = canvas.width, H = canvas.height;
  const sw = Math.max(2, Math.round(W / 24)), sh = Math.max(2, Math.round(H / 24));
  const small = document.createElement('canvas');
  small.width = sw; small.height = sh;
  const sctx = small.getContext('2d');
  sctx.drawImage(canvas, 0, 0, sw, sh);

  // Max-filter 3x3 (2 passate) sulla versione ridotta: il testo scuro non
  // deve inquinare la stima dello sfondo chiaro
  let sd = sctx.getImageData(0, 0, sw, sh);
  for (let pass = 0; pass < 2; pass++) {
    const src = sd.data.slice();
    const dst = sd.data;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        for (let ch = 0; ch < 3; ch++) {
          let m = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const yy = Math.max(0, Math.min(sh-1, y+dy));
            const xx = Math.max(0, Math.min(sw-1, x+dx));
            const v = src[(yy*sw+xx)*4+ch];
            if (v > m) m = v;
          }
          dst[(y*sw+x)*4+ch] = m;
        }
      }
    }
  }
  sctx.putImageData(sd, 0, 0);

  // Riespandi lo sfondo alle dimensioni piene (l'interpolazione fa da blur)
  const bg = document.createElement('canvas');
  bg.width = W; bg.height = H;
  const bctx = bg.getContext('2d');
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(small, 0, 0, W, H);
  const bgData = bctx.getImageData(0, 0, W, H).data;

  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, W, H);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    for (let ch = 0; ch < 3; ch++) {
      const b = Math.max(40, bgData[i + ch]);
      d[i + ch] = Math.max(0, Math.min(255, d[i + ch] / b * 240));
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

function enhanceCanvas(canvas, settings) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, W, H);
  const d = imgData.data;

  const contrast = settings.contrast / 100;  // -1..1
  const brightness = settings.brightness;     // -100..100
  const bw = settings.bw;
  const autoEnh = settings.autoEnhance;

  // Contrast factor
  const factor = contrast > 0 ? 1 + contrast * 2 : 1 + contrast;

  // Auto-enhance: vero stretch dell'istogramma sui percentili 2-98
  // della luminanza (robusto contro pixel isolati bruciati o neri)
  let lo = 0, hi = 255;
  if (autoEnh) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < d.length; i += 4)
      hist[Math.round(0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2])]++;
    const total = d.length / 4;
    let acc = 0;
    for (let t = 0; t < 256; t++) { acc += hist[t]; if (acc >= total * 0.02) { lo = t; break; } }
    acc = 0;
    for (let t = 255; t >= 0; t--) { acc += hist[t]; if (acc >= total * 0.02) { hi = t; break; } }
    if (hi - lo < 10) { lo = 0; hi = 255; } // immagine piatta: non toccare
  }
  const stretch = 255 / (hi - lo);

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i+1], b = d[i+2];

    // Stretch istogramma (prima di tutto: normalizza la gamma tonale)
    if (autoEnh) {
      r = (r - lo) * stretch;
      g = (g - lo) * stretch;
      b = (b - lo) * stretch;
    }

    // Brightness
    r += brightness; g += brightness; b += brightness;

    // Contrast (from midpoint 128)
    r = factor * (r - 128) + 128;
    g = factor * (g - 128) + 128;
    b = factor * (b - 128) + 128;

    // B&W
    if (bw) {
      const gray = 0.299*r + 0.587*g + 0.114*b;
      r = g = b = gray;
    }

    d[i]   = Math.max(0, Math.min(255, r));
    d[i+1] = Math.max(0, Math.min(255, g));
    d[i+2] = Math.max(0, Math.min(255, b));
  }
  ctx.putImageData(imgData, 0, 0);

  // Sharpen via convolution
  if (settings.sharpen > 0) {
    applySharpening(canvas, settings.sharpen);
  }

  return canvas;
}

function applySharpening(canvas, amount) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const orig = ctx.getImageData(0, 0, W, H);
  const out = ctx.createImageData(W, H);
  const s = amount * 0.1; // scale
  const kernel = [0, -s, 0, -s, 1+4*s, -s, 0, -s, 0];
  const d = orig.data; const o = out.data;
  // Copia l'originale: i pixel di bordo (non toccati dalla convoluzione)
  // restano intatti invece di risultare trasparenti/neri
  o.set(d);
  for (let y = 1; y < H-1; y++) {
    for (let x = 1; x < W-1; x++) {
      const idx = (y*W+x)*4;
      for (let c = 0; c < 3; c++) {
        let val = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            val += d[((y+ky)*W+(x+kx))*4+c] * kernel[(ky+1)*3+(kx+1)];
          }
        }
        o[idx+c] = Math.max(0, Math.min(255, val));
      }
      o[idx+3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

function processPage(page) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const src = document.createElement('canvas');
      src.width = img.naturalWidth; src.height = img.naturalHeight;
      src.getContext('2d').drawImage(img, 0, 0);

      let result;
      if (page.settings.perspective && page.corners) {
        // Calculate output dimensions from corner distances
        const W = img.naturalWidth, H = img.naturalHeight;
        const tl = page.corners.tl, tr = page.corners.tr;
        const br = page.corners.br, bl = page.corners.bl;
        const toPixel = (p) => ({x: p.x/100*W, y: p.y/100*H});
        const ptl = toPixel(tl), ptr = toPixel(tr);
        const pbr = toPixel(br), pbl = toPixel(bl);
        const topW = Math.hypot(ptr.x-ptl.x, ptr.y-ptl.y);
        const botW = Math.hypot(pbr.x-pbl.x, pbr.y-pbl.y);
        const leftH = Math.hypot(pbl.x-ptl.x, pbl.y-ptl.y);
        const rightH = Math.hypot(pbr.x-ptr.x, pbr.y-ptr.y);
        const dstW = Math.round(Math.max(topW, botW));
        const dstH = Math.round(Math.max(leftH, rightH));
        if (dstW > 10 && dstH > 10)
          result = warpPerspective(src, page.corners, dstW, dstH);
        else result = src;
      } else result = src;

      // Pipeline: keystone -> rotazione fine -> ombre -> enhance/sharpen
      const s = page.settings;
      result = applyKeystone(result, s.keystoneV, s.keystoneH);
      result = applyFineRotation(result, s.rotFine);
      if (s.shadows) removeShadows(result);
      enhanceCanvas(result, s);
      resolve(result);
    };
    img.src = page.originalSrc;
  });
}

function autoDetectCorners() {
  const page = state.pages[state.currentIdx];
  if (!page) return;

  const img = new Image();
  img.onload = () => {
    const MAXD = 400;
    const scale = Math.min(1, MAXD / Math.max(img.naturalWidth, img.naturalHeight));
    const W = Math.max(2, Math.round(img.naturalWidth * scale));
    const H = Math.max(2, Math.round(img.naturalHeight * scale));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;

    // Luminanza
    const lum = new Float32Array(W * H);
    for (let i = 0, p = 0; i < data.length; i += 4, p++)
      lum[p] = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];

    // Blur 3x3 (riduce il rumore prima della soglia)
    const blurred = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let sum = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < H && xx >= 0 && xx < W) { sum += lum[yy * W + xx]; cnt++; }
        }
        blurred[y * W + x] = sum / cnt;
      }
    }

    // Soglia di Otsu sull'istogramma della luminanza
    const hist = new Array(256).fill(0);
    for (let p = 0; p < blurred.length; p++) hist[Math.round(blurred[p])]++;
    const totalPx = W * H;
    let sumAll = 0;
    for (let t = 0; t < 256; t++) sumAll += t * hist[t];
    let sumB = 0, wB = 0, bestVar = 0, threshold = 127;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = totalPx - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sumAll - sumB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > bestVar) { bestVar = v; threshold = t; }
    }

    // Maschera binaria: pixel chiari (candidato "carta")
    const mask = new Uint8Array(W * H);
    for (let p = 0; p < blurred.length; p++) mask[p] = blurred[p] > threshold ? 1 : 0;

    // Componente connessa più grande (flood fill iterativo)
    const labels = new Int32Array(W * H); // 0 = non visitato
    const stack = new Int32Array(W * H);
    let bestLabel = 0, bestSize = 0, label = 0;
    for (let seed = 0; seed < mask.length; seed++) {
      if (!mask[seed] || labels[seed]) continue;
      label++;
      let sp = 0, size = 0;
      stack[sp++] = seed;
      labels[seed] = label;
      while (sp > 0) {
        const p = stack[--sp];
        size++;
        const x = p % W, y = (p / W) | 0;
        if (x > 0     && mask[p-1] && !labels[p-1]) { labels[p-1] = label; stack[sp++] = p-1; }
        if (x < W-1   && mask[p+1] && !labels[p+1]) { labels[p+1] = label; stack[sp++] = p+1; }
        if (y > 0     && mask[p-W] && !labels[p-W]) { labels[p-W] = label; stack[sp++] = p-W; }
        if (y < H-1   && mask[p+W] && !labels[p+W]) { labels[p+W] = label; stack[sp++] = p+W; }
      }
      if (size > bestSize) { bestSize = size; bestLabel = label; }
    }

    // Se la zona chiara è troppo piccola la rilevazione non è affidabile
    if (bestSize < totalPx * 0.05) {
      showToast('⚠️ Documento non rilevato: regola gli angoli a mano');
      return;
    }

    // Angoli del quadrilatero come punti estremali della componente:
    // tl = min(x+y), br = max(x+y), tr = max(x-y), bl = min(x-y)
    let tl = null, br = null, tr = null, bl = null;
    let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;
    for (let p = 0; p < labels.length; p++) {
      if (labels[p] !== bestLabel) continue;
      const x = p % W, y = (p / W) | 0;
      const s = x + y, d = x - y;
      if (s < minSum)  { minSum = s;  tl = {x, y}; }
      if (s > maxSum)  { maxSum = s;  br = {x, y}; }
      if (d > maxDiff) { maxDiff = d; tr = {x, y}; }
      if (d < minDiff) { minDiff = d; bl = {x, y}; }
    }

    const toPct = pt => ({
      x: Math.max(0, Math.min(100, pt.x / (W - 1) * 100)),
      y: Math.max(0, Math.min(100, pt.y / (H - 1) * 100))
    });
    page.corners = { tl: toPct(tl), tr: toPct(tr), br: toPct(br), bl: toPct(bl) };
    positionHandles();
    if (state.mode === 'preview') renderPreview();
    showToast('🔍 Documento rilevato!', true);
  };
  img.src = page.originalSrc;
}

function defaultSettings() {
  return {
    contrast: 0, brightness: 0, sharpen: 0,
    bw: false, autoEnhance: false, shadows: false,
    perspective: true,
    rotFine: 0, keystoneV: 0, keystoneH: 0
  };
}

function defaultCorners() {
  return {
    tl: {x: 5, y: 5}, tr: {x: 95, y: 5},
    br: {x: 95, y: 95}, bl: {x: 5, y: 95}
  };
}

function slugifyProjectName() {
  const raw = state.projectName.trim();
  if (!raw) return '';
  return raw
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // via accenti
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function buildPdf(images) { // images: [{bytes: Uint8Array, width, height}]
  const enc = new TextEncoder();
  const chunks = [];
  let offset = 0;
  const offsets = [];
  const push = data => {
    const b = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(b);
    offset += b.length;
  };
  const beginObj = n => { offsets[n] = offset; push(n + ' 0 obj\n'); };

  push('%PDF-1.4\n');
  const n = images.length;
  // Oggetti: 1 = catalog, 2 = pages; per ogni pagina i: page, content, xobject
  const pageIds = images.map((_, i) => 3 + i * 3);

  beginObj(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  beginObj(2);
  push(`<< /Type /Pages /Kids [${pageIds.map(id => id + ' 0 R').join(' ')}] /Count ${n} >>\nendobj\n`);

  images.forEach((img, i) => {
    const pid = 3 + i * 3, cid = pid + 1, xid = pid + 2;
    // Conversione px (96dpi) -> punti PDF (72dpi), oppure punti espliciti
    // (usati dalle pagine A4 composite, la cui risoluzione non è 96dpi)
    const wPt = (img.ptW || img.width * 72 / 96).toFixed(2);
    const hPt = (img.ptH || img.height * 72 / 96).toFixed(2);

    beginObj(pid);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /Resources << /XObject << /Im${i} ${xid} 0 R >> >> /Contents ${cid} 0 R >>\nendobj\n`);

    const content = `q ${wPt} 0 0 ${hPt} 0 0 cm /Im${i} Do Q\n`;
    beginObj(cid);
    push(`<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

    beginObj(xid);
    push(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
    push(img.bytes);
    push('\nendstream\nendobj\n');
  });

  const xrefStart = offset;
  const total = 3 + n * 3; // incluso l'oggetto 0 (free)
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) {
    push(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
  }
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Blob(chunks, {type: 'application/pdf'});
}

function serializeProject() {
  return JSON.stringify({
    scanforgeProject: 1, // versione del formato, per compatibilità futura
    projectName: state.projectName,
    a4Compose: state.a4Compose,
    pages: state.pages.map(p => ({
      originalSrc: p.originalSrc,
      name: p.name,
      settings: p.settings,
      corners: p.corners,
      width: p.width, height: p.height,
      docGroup: p.docGroup, docSide: p.docSide
    }))
  });
}

function canvasToJpegBytes(canvas, quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async blob => {
      if (!blob) { reject(new Error('toBlob fallito')); return; }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/jpeg', quality);
  });
}

function groupPagesForA4(pagesWithCanvas) {
  const groupsMap = new Map();
  let autoGroup = 0;
  pagesWithCanvas.forEach(pc => {
    let gid = pc.page.docGroup;
    if (gid == null) { autoGroup++; gid = 'auto' + autoGroup; }
    if (!groupsMap.has(gid)) groupsMap.set(gid, { fronte: null, retro: null });
    const side = pc.page.docSide === 'retro' ? 'retro' : 'fronte';
    groupsMap.get(gid)[side] = pc.canvas;
  });
  return [...groupsMap.entries()].map(([gid, sidesMap]) => ({ gid, sidesMap }));
}

function drawContain(ctx, srcCanvas, x, y, w, h) {
  const srcRatio = srcCanvas.width / srcCanvas.height;
  const boxRatio = w / h;
  let dw, dh;
  if (srcRatio > boxRatio) { dw = w; dh = w / srcRatio; }
  else { dh = h; dw = h * srcRatio; }
  const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
  ctx.drawImage(srcCanvas, dx, dy, dw, dh);
}

function composeA4Page(groups) {
  const DPI = 200;
  const ptW = 595.28, ptH = 841.89; // A4 in punti PDF (72dpi)
  const scale = DPI / 72;
  const W = Math.round(ptW * scale), H = Math.round(ptH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  const margin = Math.round(W * 0.035);
  const gutter = Math.round(W * 0.03);
  const innerW = W - margin * 2;
  const innerH = H - margin * 2;

  if (groups.length === 1) {
    const cellH = (innerH - gutter) / 2;
    const sidesMap = groups[0].sidesMap;
    ['fronte', 'retro'].forEach((side, idx) => {
      const c = sidesMap[side];
      if (!c) return;
      const cellY = margin + idx * (cellH + gutter);
      drawContain(ctx, c, margin, cellY, innerW, cellH);
    });
  } else {
    const rowH = (innerH - gutter) / 2;
    const cellW = (innerW - gutter) / 2;
    groups.forEach((g, gi) => {
      const rowY = margin + gi * (rowH + gutter);
      ['fronte', 'retro'].forEach((side, si) => {
        const c = g.sidesMap[side];
        if (!c) return;
        const cellX = margin + si * (cellW + gutter);
        drawContain(ctx, c, cellX, rowY, cellW, rowH);
      });
    });
  }

  return { canvas, ptW, ptH };
}

const PRESETS = {
  document: {contrast: 25, brightness: 5,  sharpen: 3, bw: false, autoEnhance: true,  shadows: true,  perspective: true},
  photo:    {contrast: 10, brightness: 0,  sharpen: 1, bw: false, autoEnhance: false, shadows: false, perspective: false},
  id:       {contrast: 20, brightness: 5,  sharpen: 4, bw: false, autoEnhance: true,  shadows: true,  perspective: true},
  receipt:  {contrast: 45, brightness: 10, sharpen: 5, bw: true,  autoEnhance: true,  shadows: true,  perspective: true},
};

  // ---- API del riferimento (unico codice scritto a mano, fuori dal 0.2) ----
  window.Ref02 = {
    // Rileva gli angoli con autoDetectCorners 0.2. Risolve con page.corners
    // quando lo stub showToast viene chiamato: oggetto in caso di successo,
    // null se il documento non e' stato rilevato.
    detect(src) {
      return new Promise(resolve => {
        const page = {originalSrc: src, corners: null, settings: defaultSettings()};
        state.pages = [page];
        state.currentIdx = 0;
        toastHook = () => { toastHook = null; resolve(page.corners); };
        autoDetectCorners();
      });
    },
    process(page) { return processPage(page); },
    buildPdf(images) { return buildPdf(images); },
    serializeProject(st) {
      state.projectName = st.projectName || '';
      state.a4Compose = !!st.a4Compose;
      state.pages = st.pages || [];
      return serializeProject();
    },
    slugify(name) {
      state.projectName = name;
      return slugifyProjectName();
    },
    PRESETS,
    defaultSettings,
    defaultCorners,
    composeA4Page,
    groupPagesForA4,
    canvasToJpegBytes,
  };
})();
