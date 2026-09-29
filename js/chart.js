// 작은 선 그래프 (SVG). 종목 하나의 날짜별 무게처럼 점이 수십 개인 경우용.
// Chart.js 같은 라이브러리 없이, 색은 CSS 변수(.chart-*)로 칠합니다.
import { esc } from './ui.js';

const H = 200;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

// 보기 좋은 눈금 간격 (1, 2, 2.5, 5 × 10^n)
function niceStep(range, count) {
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * mag >= raw) * mag;
  return step;
}

/**
 * @param {HTMLElement} el      그래프를 넣을 곳 (가로 폭을 그대로 씀)
 * @param {{label: string, value: number}[]} points
 * @param {{unit?: string, ariaLabel?: string}} opts
 */
export function renderLineChart(el, points, { unit = '', ariaLabel = '' } = {}) {
  const W = Math.max(260, Math.round(el.clientWidth || 320));
  if (points.length === 0) {
    el.innerHTML = '';
    return;
  }
  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 5; max += 5; }
  const step = niceStep(max - min, 4);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;
  const fmt = (v) => `${Math.round(v * 10) / 10}${unit}`;

  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);

  // x축 라벨은 겹치지 않게 최대 5개 정도만
  const every = Math.max(1, Math.ceil(points.length / 5));
  const xLabels = points
    .map((p, i) => ({ ...p, i }))
    .filter(({ i }) => i % every === 0 || i === points.length - 1)
    .filter((p, k, arr) => k === arr.length - 1 || arr[k + 1].i - p.i >= every * 0.6);

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const area = `${line}L${x(points.length - 1).toFixed(1)},${PAD.top + plotH}L${x(0).toFixed(1)},${PAD.top + plotH}Z`;

  el.innerHTML = `
    <svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(ariaLabel)}">
      ${ticks.map((v) => `
        <line class="chart-grid" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v)}" y2="${y(v)}"/>
        <text class="chart-tick" x="${PAD.left - 8}" y="${y(v)}" text-anchor="end" dominant-baseline="middle">${esc(fmt(v))}</text>`).join('')}
      ${xLabels.map((p) => `
        <text class="chart-tick" x="${x(p.i)}" y="${H - 8}" text-anchor="middle">${esc(p.label)}</text>`).join('')}
      <path class="chart-area" d="${area}"/>
      <path class="chart-line" d="${line}"/>
      ${points.map((p, i) => `
        <circle class="chart-dot" cx="${x(i)}" cy="${y(p.value)}" r="${i === points.length - 1 ? 5 : 3.5}">
          <title>${esc(`${p.label} 최고 ${fmt(p.value)}`)}</title>
        </circle>`).join('')}
    </svg>`;
}
