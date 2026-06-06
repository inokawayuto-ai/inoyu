const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const photoInput = document.querySelector("#photoInput");
const dropZone = document.querySelector("#dropZone");
const downloadButton = document.querySelector("#downloadButton");
const resetButton = document.querySelector("#resetButton");
const controls = {
  edge: document.querySelector("#edgeRange"),
  color: document.querySelector("#colorRange"),
  dot: document.querySelector("#dotRange"),
  contrast: document.querySelector("#contrastRange"),
  speedLines: document.querySelector("#speedLines"),
  panelFrame: document.querySelector("#panelFrame"),
  caption: document.querySelector("#captionInput"),
};

let sourceImage = null;
let mode = "color";
let renderTimer = 0;

function drawEmptyState() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fbfaf5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#171717";
  ctx.lineWidth = 8;
  ctx.strokeRect(34, 34, canvas.width - 68, canvas.height - 68);

  ctx.fillStyle = "#171717";
  ctx.textAlign = "center";
  ctx.font = "900 56px sans-serif";
  ctx.fillText("PHOTO → COMIC", canvas.width / 2, canvas.height / 2 - 24);
  ctx.font = "700 28px sans-serif";
  ctx.fillStyle = "#68645b";
  ctx.fillText("写真を読み込むとここに漫画化プレビューが出ます", canvas.width / 2, canvas.height / 2 + 32);
}

function fitImage(image) {
  const margin = 62;
  const availableWidth = canvas.width - margin * 2;
  const availableHeight = canvas.height - margin * 2;
  const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
  };
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}

function quantize(value, steps) {
  return Math.round(value / steps) * steps;
}

function comicFilter(imageData) {
  const data = imageData.data;
  const original = new Uint8ClampedArray(data);
  const width = imageData.width;
  const height = imageData.height;
  const edgePower = Number(controls.edge.value) / 100;
  const saturation = Number(controls.color.value) / 100;
  const contrast = 1 + Number(controls.contrast.value) / 70;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      const left = i - 4;
      const right = i + 4;
      const top = i - width * 4;
      const bottom = i + width * 4;
      const gray = (original[i] + original[i + 1] + original[i + 2]) / 3;
      const edge = Math.abs(original[left] - original[right])
        + Math.abs(original[top] - original[bottom])
        + Math.abs(original[left + 1] - original[right + 1])
        + Math.abs(original[top + 1] - original[bottom + 1])
        + Math.abs(original[left + 2] - original[right + 2])
        + Math.abs(original[top + 2] - original[bottom + 2]);

      let r = (original[i] - 128) * contrast + 128;
      let g = (original[i + 1] - 128) * contrast + 128;
      let b = (original[i + 2] - 128) * contrast + 128;
      r = gray + (r - gray) * (0.55 + saturation * 1.25);
      g = gray + (g - gray) * (0.55 + saturation * 1.25);
      b = gray + (b - gray) * (0.55 + saturation * 1.25);

      if (mode === "mono") {
        const tone = quantize(gray, 42);
        r = tone;
        g = tone;
        b = tone;
      } else if (mode === "poster") {
        r = quantize(r, 64);
        g = quantize(g, 64);
        b = quantize(b, 64);
      } else {
        r = quantize(r, 30);
        g = quantize(g, 30);
        b = quantize(b, 30);
      }

      if (edge * edgePower > 105) {
        data[i] = 12;
        data[i + 1] = 12;
        data[i + 2] = 12;
      } else {
        data[i] = clamp(r);
        data[i + 1] = clamp(g);
        data[i + 2] = clamp(b);
      }
    }
  }
  return imageData;
}

function drawHalftone(bounds) {
  const dotAmount = Number(controls.dot.value);
  if (dotAmount <= 4) return;

  const gap = 18 - dotAmount / 12;
  ctx.save();
  ctx.globalAlpha = 0.12 + dotAmount / 420;
  ctx.fillStyle = mode === "mono" ? "#111" : "#083f58";
  for (let y = bounds.y + 8; y < bounds.y + bounds.height; y += gap) {
    for (let x = bounds.x + 8; x < bounds.x + bounds.width; x += gap) {
      const radius = 1.3 + ((x + y) % 9) / 8;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawSpeedLines(bounds) {
  if (!controls.speedLines.checked) return;

  const centerX = bounds.x + bounds.width * 0.52;
  const centerY = bounds.y + bounds.height * 0.45;
  ctx.save();
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.38;
  for (let i = 0; i < 64; i += 1) {
    const angle = (Math.PI * 2 * i) / 64;
    const start = Math.min(canvas.width, canvas.height) * 0.18;
    const end = Math.max(canvas.width, canvas.height) * 0.82;
    ctx.beginPath();
    ctx.moveTo(centerX + Math.cos(angle) * start, centerY + Math.sin(angle) * start);
    ctx.lineTo(centerX + Math.cos(angle) * end, centerY + Math.sin(angle) * end);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFrame(bounds) {
  if (!controls.panelFrame.checked) return;

  ctx.save();
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 10;
  ctx.strokeRect(bounds.x - 16, bounds.y - 16, bounds.width + 32, bounds.height + 32);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#fff";
  ctx.strokeRect(bounds.x - 7, bounds.y - 7, bounds.width + 14, bounds.height + 14);
  ctx.restore();
}

function wrapText(text, maxChars) {
  const rows = [];
  for (let i = 0; i < text.length; i += maxChars) {
    rows.push(text.slice(i, i + maxChars));
  }
  return rows.slice(0, 3);
}

function drawCaption(bounds) {
  const text = controls.caption.value.trim();
  if (!text) return;

  const bubbleWidth = Math.min(360, bounds.width * 0.45);
  const bubbleHeight = 104;
  const x = bounds.x + bounds.width - bubbleWidth - 26;
  const y = bounds.y + 24;

  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(x, y, bubbleWidth, bubbleHeight, 26);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + bubbleWidth * 0.42, y + bubbleHeight - 2);
  ctx.lineTo(x + bubbleWidth * 0.32, y + bubbleHeight + 44);
  ctx.lineTo(x + bubbleWidth * 0.56, y + bubbleHeight - 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 30px sans-serif";
  const lines = wrapText(text, 8);
  const startY = y + bubbleHeight / 2 - (lines.length - 1) * 18;
  lines.forEach((line, index) => {
    ctx.fillText(line, x + bubbleWidth / 2, startY + index * 36, bubbleWidth - 28);
  });
  ctx.restore();
}

function render() {
  if (!sourceImage) {
    drawEmptyState();
    return;
  }

  ctx.fillStyle = "#fffdf7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const bounds = fitImage(sourceImage);
  drawSpeedLines(bounds);
  ctx.drawImage(sourceImage, bounds.x, bounds.y, bounds.width, bounds.height);

  const imageData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.putImageData(comicFilter(imageData), bounds.x, bounds.y);
  drawHalftone(bounds);
  drawFrame(bounds);
  drawCaption(bounds);
}

function scheduleRender() {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(render, 18);
}

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const image = new Image();
  image.onload = () => {
    sourceImage = image;
    dropZone.classList.add("is-hidden");
    downloadButton.disabled = false;
    render();
  };
  image.src = URL.createObjectURL(file);
}

photoInput.addEventListener("change", (event) => {
  loadFile(event.target.files[0]);
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-hot");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("is-hot");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-hot");
  loadFile(event.dataTransfer.files[0]);
});

document.querySelectorAll(".mode").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(".mode.active").classList.remove("active");
    button.classList.add("active");
    mode = button.dataset.mode;
    render();
  });
});

Object.values(controls).forEach((control) => {
  control.addEventListener("input", scheduleRender);
});

resetButton.addEventListener("click", () => {
  controls.edge.value = 72;
  controls.color.value = 70;
  controls.dot.value = 34;
  controls.contrast.value = 58;
  controls.speedLines.checked = true;
  controls.panelFrame.checked = true;
  controls.caption.value = "最高の一枚!";
  mode = "color";
  document.querySelector(".mode.active").classList.remove("active");
  document.querySelector('[data-mode="color"]').classList.add("active");
  render();
});

downloadButton.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "comic-snap.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

drawEmptyState();
