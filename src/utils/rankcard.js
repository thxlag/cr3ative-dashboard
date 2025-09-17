// src/utils/rankcard.js
import { createCanvas, loadImage } from '@napi-rs/canvas';

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

async function drawAvatar(ctx, url, x, y, size) {
  try {
    const img = await loadImage(url);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  } catch {
    // ignore avatar failures
  }
}

export async function generateRankCard({
  width = 1000,
  height = 300,
  username,
  avatarUrl,
  level,
  totalXp,
  current,
  next,
  rank,
  coins = 0
}) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#0f172a'); // slate-900
  bgGrad.addColorStop(1, '#1e293b'); // slate-800
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Card panel
  const pad = 20;
  const cardX = pad, cardY = pad, cardW = width - pad * 2, cardH = height - pad * 2;
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  roundRect(ctx, cardX, cardY, cardW, cardH, 22);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Avatar
  const avatarSize = 220;
  const avatarX = cardX + 24;
  const avatarY = cardY + (cardH - avatarSize) / 2;
  await drawAvatar(ctx, avatarUrl, avatarX, avatarY, avatarSize);

  // Text setup
  ctx.fillStyle = '#e5e7eb'; // gray-200
  ctx.font = '700 42px Sans';
  ctx.textBaseline = 'top';

  const textX = avatarX + avatarSize + 28;
  const textY = cardY + 28;
  ctx.fillText(username, textX, textY);

  // Level + Rank
  ctx.font = '600 28px Sans';
  ctx.fillStyle = '#93c5fd'; // blue-300
  ctx.fillText(`Level ${level}`, textX, textY + 56);
  ctx.fillStyle = '#c4b5fd'; // violet-300
  ctx.fillText(`Rank #${rank}`, textX + 180, textY + 56);

  // Coins
  ctx.fillStyle = '#fde68a'; // amber-300
  ctx.fillText(`Coins: ${coins}`, textX, textY + 56 + 38);

  // XP bar
  const barW = cardW - (textX - cardX) - 28;
  const barH = 36;
  const barX = textX;
  const barY = cardY + cardH - 28 - barH - 18;
  const pct = Math.max(0, Math.min(1, next > 0 ? current / next : 0));

  // track
  ctx.fillStyle = '#111827';
  roundRect(ctx, barX, barY, barW, barH, 12);
  ctx.fill();

  // progress
  const progW = Math.max(10, Math.floor(barW * pct));
  const grad = ctx.createLinearGradient(barX, barY, barX + progW, barY + barH);
  grad.addColorStop(0, '#60a5fa');
  grad.addColorStop(1, '#a78bfa');
  ctx.fillStyle = grad;
  roundRect(ctx, barX, barY, progW, barH, 12);
  ctx.fill();

  // XP labels
  ctx.font = '600 24px Sans';
  ctx.fillStyle = '#e5e7eb';
  const label = `XP ${totalXp} • ${current}/${next}`;
  ctx.fillText(label, barX, barY - 30);

  return await canvas.encode('png');
}

