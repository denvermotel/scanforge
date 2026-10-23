// Rotazione della foto a passi di 90 gradi in senso orario, per annotatore e banco.
// Rotate.size(w, h, deg) -> { w, h } dimensioni dell'immagine ruotata
// Rotate.draw(ctx, src, sw, sh, deg, dw, dh) disegna src (di sw x sh) ruotata nel
//   rettangolo dw x dh, che e' gia' nelle dimensioni dell'immagine ruotata
// Rotate.canvas(src, sw, sh, deg) -> canvas ruotato a grandezza piena
(function () {
  function size(w, h, deg) {
    return deg === 90 || deg === 270 ? { w: h, h: w } : { w: w, h: h };
  }

  function draw(ctx, src, sw, sh, deg, dw, dh) {
    ctx.save();
    if (deg === 90) {
      ctx.translate(dw, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(src, 0, 0, dh, dw);
    } else if (deg === 180) {
      ctx.translate(dw, dh); ctx.rotate(Math.PI); ctx.drawImage(src, 0, 0, dw, dh);
    } else if (deg === 270) {
      ctx.translate(0, dh); ctx.rotate(Math.PI * 1.5); ctx.drawImage(src, 0, 0, dh, dw);
    } else {
      ctx.drawImage(src, 0, 0, dw, dh);
    }
    ctx.restore();
  }

  function canvas(src, sw, sh, deg) {
    var d = size(sw, sh, deg);
    var c = document.createElement('canvas');
    c.width = d.w; c.height = d.h;
    draw(c.getContext('2d'), src, sw, sh, deg, d.w, d.h);
    return c;
  }

  window.Rotate = { size: size, draw: draw, canvas: canvas };
})();
