import type { GuideStep } from '../../../shared/types';

/** 스텝 이미지에 박스(번호)·블러를 그려 평탄화한 PNG dataURL을 만든다. */
export const flattenStep = (step: GuideStep): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(step.imageDataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0);

      const px = (box: { x: number; y: number; w: number; h: number }) => ({
        x: box.x * canvas.width,
        y: box.y * canvas.height,
        w: box.w * canvas.width,
        h: box.h * canvas.height,
      });

      // 블러 먼저 (그 위에 번호 박스가 가려지지 않도록)
      for (const box of step.boxes.filter((item) => item.kind === 'blur')) {
        const r = px(box);
        ctx.save();
        ctx.filter = 'blur(9px)';
        ctx.drawImage(canvas, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
        ctx.restore();
      }

      const lineWidth = Math.max(2, canvas.width / 400);
      const radius = Math.max(12, canvas.width / 70);
      ctx.lineWidth = lineWidth;
      ctx.font = `${radius}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const box of step.boxes.filter((item) => item.kind === 'box')) {
        const r = px(box);
        ctx.strokeStyle = '#1677ff';
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = '#1677ff';
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(String(box.number), r.x, r.y);
      }
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = step.imageDataUrl;
  });
