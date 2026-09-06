"use client";

import * as THREE from "three";

/**
 * 模块级缓存的程序化 Canvas 纹理：虹膜、木地板、格纹。
 * 只在客户端组件内调用（dynamic ssr:false 保证），首次生成后复用。
 */

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const irisCache = new Map<string, THREE.CanvasTexture>();
/** 拟真虹膜：深色 limbal 环 + 中间调 + 近瞳孔亮区 + 放射线。 */
export function irisTexture(base: string): THREE.CanvasTexture {
  const cached = irisCache.get(base);
  if (cached) return cached;

  const { canvas, ctx } = makeCanvas(128);
  const c = 64;
  const baseColor = new THREE.Color(base);

  // 底色盘
  ctx.fillStyle = `#${baseColor.getHexString()}`;
  ctx.fillRect(0, 0, 128, 128);

  // 外圈 limbal 深环
  const rim = baseColor.clone().multiplyScalar(0.32);
  const rimGrad = ctx.createRadialGradient(c, c, 26, c, c, 62);
  rimGrad.addColorStop(0, "rgba(0,0,0,0)");
  rimGrad.addColorStop(0.72, `#${rim.getHexString()}`);
  rimGrad.addColorStop(1, `#${rim.clone().multiplyScalar(0.5).getHexString()}`);
  ctx.fillStyle = rimGrad;
  ctx.fillRect(0, 0, 128, 128);

  // 放射纹理
  ctx.save();
  ctx.translate(c, c);
  for (let i = 0; i < 42; i++) {
    ctx.rotate((Math.PI * 2) / 42);
    const light = baseColor.clone().lerp(new THREE.Color("#ffffff"), 0.16 + (i % 3) * 0.08);
    ctx.strokeStyle = `#${light.getHexString()}`;
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = i % 2 ? 1.4 : 2.6;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(0, -52);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // 近瞳孔亮区
  const inner = baseColor.clone().lerp(new THREE.Color("#ffffff"), 0.34);
  const innerGrad = ctx.createRadialGradient(c, c, 4, c, c, 30);
  innerGrad.addColorStop(0, `#${inner.getHexString()}`);
  innerGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = innerGrad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = toTexture(canvas);
  irisCache.set(base, tex);
  return tex;
}

let woodCache: THREE.CanvasTexture | null = null;
/** 暖胡桃木地板：同心木纹 + 板缝。 */
export function woodFloorTexture(): THREE.CanvasTexture {
  if (woodCache) return woodCache;
  const { canvas, ctx } = makeCanvas(512);
  const base = new THREE.Color("#6a4526");

  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, 512, 512);

  // 同心板纹（以中心为圆心的宽环 + 深色缝）
  for (let r = 500; r > 8; r -= 26) {
    const shade = base.clone().multiplyScalar(0.82 + ((r / 26) % 4) * 0.055);
    ctx.strokeStyle = `#${shade.getHexString()}`;
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(30,16,6,0.5)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(256, 256, r - 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 细木纹噪点
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 250;
    ctx.strokeStyle = Math.random() > 0.5 ? "#3d2410" : "#8a6038";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(256, 256, r, a, a + 0.25 + Math.random() * 0.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = toTexture(canvas);
  woodCache = tex;
  return tex;
}

let plaidCache: THREE.CanvasTexture | null = null;
/** 暖棕格纹（撰稿人围巾）。 */
export function plaidTexture(): THREE.CanvasTexture {
  if (plaidCache) return plaidCache;
  const { canvas, ctx } = makeCanvas(128);
  ctx.fillStyle = "#8a6a4c";
  ctx.fillRect(0, 0, 128, 128);

  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#c9a06a";
  for (let i = 0; i < 128; i += 32) {
    ctx.fillRect(i, 0, 12, 128);
    ctx.fillRect(0, i, 128, 12);
  }
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#4a3423";
  for (let i = 16; i < 128; i += 32) {
    ctx.fillRect(i, 0, 3, 128);
    ctx.fillRect(0, i, 128, 3);
  }
  ctx.globalAlpha = 1;

  const tex = toTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  plaidCache = tex;
  return tex;
}
