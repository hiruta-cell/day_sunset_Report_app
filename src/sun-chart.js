/*
 * sun-chart.js
 * 目的：選んだ日の「太陽の通り道」の図（日の出から日の入りまでの弧）と、一日24時間のうち昼の時間帯を示すバーを SVG に描く。
 * 使い方：ブラウザでは <script> で読み込むと window.SunChart に入る。Node では require('./sun-chart.js')（位置の計算だけ使える）。
 * 注意：通信はしない。色は CSS のクラスで決める（属性のスタイルは使わない）。文字は textContent で入れる。
 */
(function (root) {
  'use strict';

  // SVG の名前空間（createElementNS に必要）
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

  // 図全体の大きさ（図の単位）
  const CHART_WIDTH = 320;
  const CHART_HEIGHT = 196;

  // 太陽の通り道の弧。地平線の高さ（baseY）を中心にした、半楕円
  const ARC = { centerX: 160, baseY: 96, radiusX: 130, radiusY: 76 };

  // 昼夜のバーの位置と大きさ
  const DAY_BAR = { x: 10, y: 160, width: 300, height: 14 };

  // 1日の分の数
  const MINUTES_PER_DAY = 1440;

  // 太陽の位置を弧の上のどこに置くかを決める、昼の進み具合（0＝日の出、0.5＝南中、1＝日の入り）
  const NOON_PROGRESS = 0.5;

  // バーの目盛りの時刻
  const TICK_HOURS = [0, 6, 12, 18, 24];

  /**
   * 昼の進み具合（0〜1）から、太陽の弧の上の位置を求める。
   * @param {number} progress 0＝日の出、0.5＝南中、1＝日の入り
   * @returns {{x: number, y: number}} 図の上の位置
   */
  function getSunPosition(progress) {
    const angle = Math.PI * progress;
    return {
      x: ARC.centerX - ARC.radiusX * Math.cos(angle),
      y: ARC.baseY - ARC.radiusY * Math.sin(angle),
    };
  }

  /**
   * いまの時刻から、昼の進み具合を求める。
   * @param {number} sunriseMinutes 日の出（0時からの分）
   * @param {number} sunsetMinutes 日の入り（0時からの分）
   * @param {number|null} nowMinutes いまの時刻（0時からの分）。選んだ日が今日でないときは null
   * @returns {{progress: number, isDaytime: boolean, isLive: boolean}}
   *   progress は 0〜1。夜は日の出前なら 0、日の入り後なら 1。isLive は「いま」の位置を示しているか
   */
  function computeProgress(sunriseMinutes, sunsetMinutes, nowMinutes) {
    if (nowMinutes === null || nowMinutes === undefined) {
      return { progress: NOON_PROGRESS, isDaytime: true, isLive: false };
    }
    const rawProgress = (nowMinutes - sunriseMinutes) / (sunsetMinutes - sunriseMinutes);
    return { progress: Math.min(1, Math.max(0, rawProgress)), isDaytime: rawProgress >= 0 && rawProgress <= 1, isLive: true };
  }

  /**
   * 昼の時間帯を、バーの上の位置と幅にする。
   * @param {number} sunriseMinutes 日の出（0時からの分）
   * @param {number} sunsetMinutes 日の入り（0時からの分）
   * @returns {{x: number, width: number}} バーの上の位置と幅（図の単位）
   */
  function getDayBarSegment(sunriseMinutes, sunsetMinutes) {
    return {
      x: DAY_BAR.x + (sunriseMinutes / MINUTES_PER_DAY) * DAY_BAR.width,
      width: ((sunsetMinutes - sunriseMinutes) / MINUTES_PER_DAY) * DAY_BAR.width,
    };
  }

  /**
   * SVG の要素を作る。
   * @param {Document} doc 要素を作る document
   * @param {string} tagName 要素の名前
   * @param {Object<string, string|number>} attributes 付ける属性
   * @param {string} [text] 要素の文字
   * @returns {Element} 作った要素
   */
  function createSvgElement(doc, tagName, attributes, text) {
    const element = doc.createElementNS(SVG_NAMESPACE, tagName);
    Object.keys(attributes).forEach((name) => element.setAttribute(name, String(attributes[name])));
    if (text !== undefined) element.textContent = text;
    return element;
  }

  /**
   * 太陽の通り道の図と昼夜のバーを SVG に描く。
   * @param {SVGSVGElement} svg 描く先の svg 要素（中身は消して描き直す）
   * @param {{sunriseMinutes: number, solarNoonMinutes: number, sunsetMinutes: number,
   *          sunriseText: string, noonText: string, sunsetText: string, nowMinutes: number|null}} info
   *   日の出・南中・日の入りの時刻（0時からの分と表示の文字）と、いまの時刻（今日でなければ null）
   * 注意：白夜・極夜の日は呼ばない（日の出・日の入りの時刻がないため）
   */
  function render(svg, info) {
    const doc = svg.ownerDocument;
    const { progress, isDaytime, isLive } = computeProgress(info.sunriseMinutes, info.sunsetMinutes, info.nowMinutes);
    const sun = getSunPosition(progress);
    const arcStartX = ARC.centerX - ARC.radiusX;
    const arcEndX = ARC.centerX + ARC.radiusX;
    const segment = getDayBarSegment(info.sunriseMinutes, info.sunsetMinutes);

    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`);
    svg.setAttribute(
      'aria-label',
      `太陽の通り道。日の出 ${info.sunriseText}、南中 ${info.noonText}、日の入り ${info.sunsetText}`
    );

    // 空の色（上から下へ）
    const gradient = createSvgElement(doc, 'linearGradient', { id: 'chart-sky-gradient', x1: 0, y1: 0, x2: 0, y2: 1 });
    gradient.appendChild(createSvgElement(doc, 'stop', { class: 'chart-sky-top', offset: 0 }));
    gradient.appendChild(createSvgElement(doc, 'stop', { class: 'chart-sky-bottom', offset: 1 }));
    const defs = createSvgElement(doc, 'defs', {});
    defs.appendChild(gradient);
    svg.appendChild(defs);

    svg.appendChild(createSvgElement(doc, 'rect', { x: 0, y: 0, width: CHART_WIDTH, height: ARC.baseY + 18, rx: 10, fill: 'url(#chart-sky-gradient)' }));
    svg.appendChild(createSvgElement(doc, 'rect', { class: 'chart-ground', x: 0, y: ARC.baseY, width: CHART_WIDTH, height: 18, rx: 0 }));
    svg.appendChild(
      createSvgElement(doc, 'path', { class: 'chart-track', d: `M${arcStartX},${ARC.baseY} A${ARC.radiusX},${ARC.radiusY} 0 0 1 ${arcEndX},${ARC.baseY}` })
    );
    if (progress > 0) {
      svg.appendChild(
        createSvgElement(doc, 'path', {
          class: 'chart-passed',
          d: `M${arcStartX},${ARC.baseY} A${ARC.radiusX},${ARC.radiusY} 0 0 1 ${sun.x.toFixed(1)},${sun.y.toFixed(1)}`,
        })
      );
    }
    svg.appendChild(createSvgElement(doc, 'circle', { class: 'chart-sun-halo', cx: sun.x.toFixed(1), cy: sun.y.toFixed(1), r: 16 }));
    svg.appendChild(
      createSvgElement(doc, 'circle', {
        class: isDaytime ? 'chart-sun' : 'chart-sun is-night',
        cx: sun.x.toFixed(1),
        cy: sun.y.toFixed(1),
        r: 9,
      })
    );

    // 日の出・南中・日の入りの文字（弧の下）
    svg.appendChild(createSvgElement(doc, 'text', { class: 'chart-label', x: 10, y: 132, 'text-anchor': 'start' }, `日の出 ${info.sunriseText}`));
    svg.appendChild(createSvgElement(doc, 'text', { class: 'chart-label', x: ARC.centerX, y: 132, 'text-anchor': 'middle' }, `南中 ${info.noonText}`));
    svg.appendChild(createSvgElement(doc, 'text', { class: 'chart-label', x: CHART_WIDTH - 10, y: 132, 'text-anchor': 'end' }, `日の入り ${info.sunsetText}`));

    // 昼夜のバー（0時〜24時）
    svg.appendChild(createSvgElement(doc, 'text', { class: 'chart-caption-text', x: DAY_BAR.x, y: 152 }, '一日のうちの昼（0〜24時）'));
    svg.appendChild(createSvgElement(doc, 'rect', { class: 'chart-bar-night', x: DAY_BAR.x, y: DAY_BAR.y, width: DAY_BAR.width, height: DAY_BAR.height, rx: 7 }));
    svg.appendChild(createSvgElement(doc, 'rect', { class: 'chart-bar-day', x: segment.x.toFixed(1), y: DAY_BAR.y, width: segment.width.toFixed(1), height: DAY_BAR.height }));
    if (isLive) {
      const nowX = DAY_BAR.x + (info.nowMinutes / MINUTES_PER_DAY) * DAY_BAR.width;
      svg.appendChild(createSvgElement(doc, 'rect', { class: 'chart-bar-now', x: (nowX - 1.5).toFixed(1), y: DAY_BAR.y - 4, width: 3, height: DAY_BAR.height + 8, rx: 1.5 }));
    }
    TICK_HOURS.forEach((hour) => {
      const tickX = DAY_BAR.x + (hour / 24) * DAY_BAR.width;
      const anchor = hour === 0 ? 'start' : hour === 24 ? 'end' : 'middle';
      svg.appendChild(createSvgElement(doc, 'text', { class: 'chart-tick', x: tickX, y: 190, 'text-anchor': anchor }, `${hour}`));
    });
  }

  const api = { getSunPosition, computeProgress, getDayBarSegment, render };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SunChart = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
