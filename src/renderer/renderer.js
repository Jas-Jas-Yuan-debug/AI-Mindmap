(function () {
  const ROOT_LABEL = "Root";
  const ROOT_WIDTH = 160;
  const ROOT_HEIGHT = 64;
  const ROOT_RADIUS = 14;

  let canvas = null;
  let ctx = null;

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    drawScene(cssWidth, cssHeight);
  }

  function drawRoundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawScene(cssWidth, cssHeight) {
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const x = (cssWidth - ROOT_WIDTH) / 2;
    const y = (cssHeight - ROOT_HEIGHT) / 2;

    drawRoundedRect(x, y, ROOT_WIDTH, ROOT_HEIGHT, ROOT_RADIUS);
    ctx.fillStyle = "#2d6cdf";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#5b8def";
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "600 18px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ROOT_LABEL, cssWidth / 2, cssHeight / 2);
  }

  function init() {
    canvas = document.getElementById("mindmap-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    if (!ctx) return;

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const api = window.mindmapAPI;
    console.log("mindmapAPI version:", api && api.version);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
