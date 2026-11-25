import { PhysicalDeviceSlot } from '../types/device';

export function renderVirtualScreenshotBase64(device: PhysicalDeviceSlot): string {
  const width = 540;
  const height = 960;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const vs = device.virtualState;
  const activeApp = vs?.activeApp || 'launcher';

  // Background
  if (activeApp === 'launcher') {
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.55, '#1e293b');
    grad.addColorStop(1, '#1d4ed8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }

  // Status bar
  ctx.fillStyle = activeApp === 'launcher' ? 'rgba(0,0,0,0.28)' : '#0f172a';
  ctx.fillRect(0, 0, width, 44);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 18px sans-serif';
  ctx.fillText(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 22, 29);
  ctx.textAlign = 'right';
  ctx.fillText(`5G  ${device.battery ?? 85}%`, width - 22, 29);
  ctx.textAlign = 'left';

  if (activeApp === 'chrome') {
    // Chrome bar
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 44, width, 74);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(18, 56, width - 36, 48);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(18, 56, width - 36, 48);
    ctx.fillStyle = '#0f172a';
    ctx.font = '500 17px monospace';
    ctx.fillText((device.currentUrl || 'about:blank').slice(0, 36), 32, 86);

    const snap = vs?.pageSnapshot;
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 26px sans-serif';
    ctx.fillText((snap?.title || 'Chrome Browser').slice(0, 30), 24, 168);

    ctx.fillStyle = '#475569';
    ctx.font = '400 18px sans-serif';
    const desc = snap?.description || 'Authorized mobile browser session active.';
    wrapText(ctx, desc, 24, 208, width - 48, 28, 4);

    if (snap?.headings?.length) {
      let y = 340;
      ctx.fillStyle = '#1e293b';
      ctx.font = '600 19px sans-serif';
      for (const h of snap.headings.slice(0, 5)) {
        ctx.fillText(`• ${h.slice(0, 36)}`, 24, y);
        y += 38;
      }
    }
  } else if (activeApp === 'settings') {
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 28px sans-serif';
    ctx.fillText('Settings', 24, 100);
    const rows = [
      ['Device', device.name],
      ['Model', device.model],
      ['Android Version', `Android ${device.androidVersion}`],
      ['Resolution', device.resolution],
      ['Battery', `${device.battery ?? 85}%`],
      ['Serial', device.serial || 'Virtual'],
    ];
    let y = 160;
    for (const [k, v] of rows) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(20, y, width - 40, 68);
      ctx.fillStyle = '#64748b';
      ctx.font = '500 16px sans-serif';
      ctx.fillText(k, 36, y + 26);
      ctx.fillStyle = '#0f172a';
      ctx.font = '600 18px monospace';
      ctx.fillText(v, 36, y + 52);
      y += 82;
    }
  } else if (activeApp === 'notes') {
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 28px sans-serif';
    ctx.fillText('Notes', 24, 100);
    ctx.fillStyle = '#fefce8';
    ctx.fillRect(24, 130, width - 48, 680);
    ctx.fillStyle = '#1e293b';
    ctx.font = '400 20px sans-serif';
    wrapText(ctx, vs?.noteText || 'Device QA Notes...', 42, 174, width - 84, 30, 14);
  } else {
    // Launcher
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 32px sans-serif';
    ctx.fillText(device.name, 28, 120);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '400 18px sans-serif';
    ctx.fillText(`${device.model} · Android ${device.androidVersion}`, 28, 152);

    const icons = [
      { label: 'Chrome', color: '#2563eb' },
      { label: 'Settings', color: '#475569' },
      { label: 'Notes', color: '#ca8a04' },
      { label: 'Calc', color: '#059669' },
    ];
    icons.forEach((ic, idx) => {
      const x = 44 + idx * 120;
      const y = 240;
      ctx.fillStyle = ic.color;
      ctx.beginPath();
      ctx.roundRect(x, y, 76, 76, 18);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ic.label, x + 38, y + 102);
      ctx.textAlign = 'left';
    });
  }

  // Android nav bar
  ctx.fillStyle = 'rgba(15,23,42,0.92)';
  ctx.fillRect(0, height - 56, width, 56);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '600 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('◀          ●          ■', width / 2, height - 22);
  ctx.textAlign = 'left';

  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1] || '';
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const words = text.split(/\s+/);
  let line = '';
  let lineCount = 0;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
      lineCount += 1;
      if (lineCount >= maxLines) break;
    } else {
      line = testLine;
    }
  }
  if (line && lineCount < maxLines) {
    ctx.fillText(line, x, y);
  }
}
