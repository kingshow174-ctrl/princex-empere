// Run once: node make-icons.js
const { createCanvas } = require("canvas");
const fs = require("fs");

function makeIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#0a0e1a";
  ctx.fillRect(0, 0, size, size);

  // Gold circle
  ctx.beginPath();
  ctx.arc(size/2, size/2, size*0.45, 0, Math.PI*2);
  ctx.fillStyle = "#f5c842";
  ctx.fill();

  // Crown emoji text
  ctx.fillStyle = "#0a0e1a";
  ctx.font = `bold ${size*0.45}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("👑", size/2, size/2);

  return canvas.toBuffer("image/png");
}

fs.writeFileSync("icon-192.png", makeIcon(192));
fs.writeFileSync("icon-512.png", makeIcon(512));
console.log("Icons created!");
