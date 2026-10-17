/*
 * japan-map.js
 * 目的：簡略化した日本地図（SVG）を描き、選んだ地点の位置に印を付ける。
 * 使い方：ブラウザでは <script> で読み込むと window.JapanMap に入る。Node では require('./japan-map.js')（位置の変換だけ使える）。
 * 注意：地図の形は、外部のデータを使わず、このファイルに書いた粗い多角形（緯度・経度）から作る。
 *   通信はしない。位置は目安で、海岸線の細かい形は表していない。
 */
(function (root) {
  'use strict';

  // SVG の名前空間（createElementNS に必要）
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

  // 本土の地図に載せる範囲（度）。北は択捉島、東は択捉島の東、西は五島列島、南は屋久島の南まで
  const MAIN_BOUNDS = { minLatitude: 30.0, maxLatitude: 45.9, minLongitude: 128.6, maxLongitude: 148.9 };

  // 本土の地図の、緯度1度あたりの長さ（図の単位）
  const MAIN_SCALE = 18;

  // 本土の地図の、経度1度あたりの長さ。緯度38度付近の cos で縮める（等距円筒図法）
  const MAIN_LONGITUDE_SCALE = MAIN_SCALE * Math.cos((38 * Math.PI) / 180);

  // 沖縄・奄美の枠（右下の小さな地図）に載せる範囲（度）。緯度30度より南で、与那国島〜奄美大島
  const INSET_BOUNDS = { minLatitude: 23.8, maxLatitude: 30.0, minLongitude: 122.7, maxLongitude: 131.6 };

  // 枠の中の、緯度1度あたりの長さ
  const INSET_SCALE = 8;

  // 枠の中の、経度1度あたりの長さ（緯度26.5度付近の cos で縮める）
  const INSET_LONGITUDE_SCALE = INSET_SCALE * Math.cos((26.5 * Math.PI) / 180);

  // 枠の内側の余白
  const INSET_PADDING = 4;

  // 地図全体の幅と高さ（図の単位）
  const MAP_WIDTH = Math.ceil((MAIN_BOUNDS.maxLongitude - MAIN_BOUNDS.minLongitude) * MAIN_LONGITUDE_SCALE);
  const MAP_HEIGHT = Math.ceil((MAIN_BOUNDS.maxLatitude - MAIN_BOUNDS.minLatitude) * MAIN_SCALE);

  // 沖縄・奄美の枠の位置と大きさ（地図の右下。本州の東の海が空いているところ）
  const INSET_FRAME = { x: MAP_WIDTH - 76, y: MAP_HEIGHT - 62, width: 72, height: 58 };

  // 小さい島を表す楕円の頂点の数
  const ISLAND_VERTEX_COUNT = 8;

  /**
   * 小さい島を、楕円に近い多角形にする。
   * @param {number} longitude 中心の経度（度）
   * @param {number} latitude 中心の緯度（度）
   * @param {number} longitudeRadius 東西の半径（度）
   * @param {number} latitudeRadius 南北の半径（度）
   * @returns {Array<[number, number]>} [経度, 緯度] の頂点の配列
   */
  function makeIsland(longitude, latitude, longitudeRadius, latitudeRadius) {
    const vertices = [];
    for (let index = 0; index < ISLAND_VERTEX_COUNT; index++) {
      const angle = (2 * Math.PI * index) / ISLAND_VERTEX_COUNT;
      vertices.push([longitude + longitudeRadius * Math.cos(angle), latitude + latitudeRadius * Math.sin(angle)]);
    }
    return vertices;
  }

  // 北海道（宗谷岬から時計回り）。[経度, 緯度]
  const HOKKAIDO = [
    [141.95, 45.55], [142.6, 45.05], [143.4, 44.5], [144.3, 44.1], [145.35, 44.4], [145.0, 43.8], [145.5, 43.65],
    [145.9, 43.4], [145.3, 43.1], [144.55, 42.85], [143.5, 42.35], [143.3, 41.95], [142.4, 42.3], [141.7, 42.65],
    [141.0, 42.4], [140.5, 42.5], [141.15, 41.8], [140.7, 41.72], [140.05, 41.4], [139.95, 41.9], [140.1, 42.6],
    [140.3, 43.35], [141.0, 43.25], [141.4, 43.45], [141.65, 44.1], [141.7, 44.9], [141.5, 45.45],
  ];

  // 本州（大間崎から時計回り）。東京湾・伊勢湾・大阪湾などの湾は省いている
  const HONSHU = [
    [140.9, 41.5], [141.45, 41.45], [141.4, 40.7], [141.8, 40.2], [142.05, 39.55], [141.75, 39.0], [141.55, 38.3],
    [141.2, 38.15], [141.0, 37.5], [140.95, 37.0], [140.7, 36.3], [140.87, 35.72], [140.4, 35.4], [139.85, 34.9],
    [139.65, 35.15], [139.15, 34.95], [138.85, 34.65], [138.2, 34.6], [137.3, 34.65], [137.0, 34.6], [136.85, 34.3],
    [135.77, 33.43], [135.15, 34.2], [135.4, 34.6], [134.7, 34.7], [133.9, 34.5], [133.3, 34.4], [132.4, 34.25],
    [131.57, 34.0], [130.93, 33.95], [130.88, 34.25], [131.4, 34.45], [132.1, 34.9], [132.7, 35.6], [133.3, 35.65],
    [134.2, 35.65], [135.2, 35.78], [135.9, 35.6], [136.1, 36.25], [136.4, 36.6], [136.75, 37.1], [137.3, 37.5],
    [137.0, 36.9], [137.85, 37.05], [139.2, 38.15], [139.55, 38.6], [139.85, 38.95], [139.7, 39.9], [139.95, 40.65],
    [140.35, 41.25],
  ];

  // 四国
  const SHIKOKU = [
    [134.65, 34.2], [134.5, 33.8], [134.2, 33.3], [133.6, 33.4], [133.0, 32.75], [132.5, 32.95], [132.3, 33.6],
    [132.8, 34.1], [133.6, 34.15], [134.0, 34.4], [134.4, 34.35],
  ];

  // 九州（門司から時計回り）。鹿児島湾・有明海などの湾は省いている
  const KYUSHU = [
    [130.95, 33.95], [131.55, 33.75], [131.7, 33.4], [131.95, 33.0], [131.8, 32.5], [131.6, 31.9], [131.4, 31.4],
    [131.1, 31.3], [130.7, 31.0], [130.6, 31.3], [130.3, 31.25], [130.15, 31.4], [130.2, 32.0], [130.4, 32.5],
    [130.0, 32.6], [129.75, 32.55], [129.65, 32.95], [129.65, 33.25], [129.95, 33.55], [130.4, 33.7],
  ];

  // 本土の地図に描く陸地（4つの大きな島と、主な島）
  const MAINLAND_POLYGONS = [
    HOKKAIDO,
    HONSHU,
    SHIKOKU,
    KYUSHU,
    makeIsland(138.4, 38.0, 0.2, 0.3), // 佐渡島
    makeIsland(134.85, 34.4, 0.1, 0.22), // 淡路島
    makeIsland(133.2, 36.25, 0.15, 0.1), // 隠岐
    makeIsland(129.3, 34.4, 0.12, 0.3), // 対馬
    makeIsland(128.85, 32.9, 0.15, 0.3), // 五島列島
    makeIsland(131.0, 30.6, 0.1, 0.3), // 種子島
    makeIsland(130.5, 30.35, 0.12, 0.1), // 屋久島
    makeIsland(141.2, 45.2, 0.12, 0.12), // 利尻島・礼文島
    makeIsland(139.5, 42.1, 0.08, 0.12), // 奥尻島
    makeIsland(145.75, 44.0, 0.4, 0.35), // 国後島
    makeIsland(147.7, 45.1, 0.9, 0.45), // 択捉島
    makeIsland(146.75, 43.8, 0.2, 0.1), // 色丹島
    makeIsland(146.1, 43.4, 0.15, 0.07), // 歯舞群島
  ];

  // 沖縄本島（辺戸岬から時計回り）
  const OKINAWA_MAIN_ISLAND = [
    [128.28, 26.88], [128.1, 26.65], [127.98, 26.4], [127.88, 26.15], [127.78, 26.07], [127.65, 26.12],
    [127.6, 26.25], [127.7, 26.45], [127.75, 26.7], [128.0, 26.9],
  ];

  // 沖縄・奄美の枠に描く陸地
  const INSET_POLYGONS = [
    OKINAWA_MAIN_ISLAND,
    makeIsland(126.8, 26.35, 0.07, 0.05), // 久米島
    makeIsland(125.3, 24.78, 0.12, 0.1), // 宮古島
    makeIsland(124.2, 24.42, 0.12, 0.1), // 石垣島
    makeIsland(123.8, 24.35, 0.15, 0.1), // 西表島
    makeIsland(123.0, 24.45, 0.07, 0.05), // 与那国島
    makeIsland(129.4, 28.3, 0.25, 0.25), // 奄美大島
    makeIsland(128.95, 27.8, 0.1, 0.1), // 徳之島
    makeIsland(128.6, 27.35, 0.08, 0.05), // 沖永良部島
  ];

  /**
   * 緯度・経度が、範囲の中に入っているか確かめる。
   * @param {{minLatitude: number, maxLatitude: number, minLongitude: number, maxLongitude: number}} bounds 範囲
   * @param {number} latitude 緯度（度）
   * @param {number} longitude 経度（度）
   * @returns {boolean} 入っていれば true
   */
  function isInBounds(bounds, latitude, longitude) {
    return (
      latitude >= bounds.minLatitude &&
      latitude <= bounds.maxLatitude &&
      longitude >= bounds.minLongitude &&
      longitude <= bounds.maxLongitude
    );
  }

  /**
   * 本土の地図での、緯度・経度の位置（図の単位）。
   * @param {number} latitude 緯度（度）
   * @param {number} longitude 経度（度）
   * @returns {{x: number, y: number}} 位置
   */
  function projectToMainland(latitude, longitude) {
    return {
      x: (longitude - MAIN_BOUNDS.minLongitude) * MAIN_LONGITUDE_SCALE,
      y: (MAIN_BOUNDS.maxLatitude - latitude) * MAIN_SCALE,
    };
  }

  /**
   * 沖縄・奄美の枠の中での、緯度・経度の位置（図の単位）。
   * @param {number} latitude 緯度（度）
   * @param {number} longitude 経度（度）
   * @returns {{x: number, y: number}} 位置
   */
  function projectToInset(latitude, longitude) {
    return {
      x: INSET_FRAME.x + INSET_PADDING + (longitude - INSET_BOUNDS.minLongitude) * INSET_LONGITUDE_SCALE,
      y: INSET_FRAME.y + INSET_PADDING + (INSET_BOUNDS.maxLatitude - latitude) * INSET_SCALE,
    };
  }

  /**
   * 緯度・経度を、地図の上の位置に変える。
   * @param {number} latitude 緯度（度）
   * @param {number} longitude 経度（度）
   * @returns {{x: number, y: number, isInset: boolean}|null} 位置。isInset が true なら沖縄・奄美の枠の中。
   *   地図に載っていない場所（小笠原など）・数でない値は null
   */
  function projectPoint(latitude, longitude) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (isInBounds(MAIN_BOUNDS, latitude, longitude)) {
      return { ...projectToMainland(latitude, longitude), isInset: false };
    }
    if (isInBounds(INSET_BOUNDS, latitude, longitude)) {
      return { ...projectToInset(latitude, longitude), isInset: true };
    }
    return null;
  }

  /**
   * 点が多角形の中にあるか調べる（光線を飛ばして辺と交わる回数を数える方法）。
   * @param {Array<[number, number]>} polygon [経度, 緯度] の頂点の配列
   * @param {number} longitude 経度（度）
   * @param {number} latitude 緯度（度）
   * @returns {boolean} 中にあれば true
   */
  function isInsidePolygon(polygon, longitude, latitude) {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
      const [x1, y1] = polygon[index];
      const [x2, y2] = polygon[previous];
      const crosses = y1 > latitude !== y2 > latitude && longitude < ((x2 - x1) * (latitude - y1)) / (y2 - y1) + x1;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  /**
   * 緯度・経度が、この地図の陸地の中かどうか調べる（テスト用。マーカーが海の上に出ないことの確認に使う）。
   * @param {number} latitude 緯度（度）
   * @param {number} longitude 経度（度）
   * @returns {boolean} 陸地の中なら true
   */
  function isOnLand(latitude, longitude) {
    return [...MAINLAND_POLYGONS, ...INSET_POLYGONS].some((polygon) => isInsidePolygon(polygon, longitude, latitude));
  }

  /**
   * 多角形の一覧を、SVG の path の d 属性の文字にする。
   * @param {Array<Array<[number, number]>>} polygons 多角形の一覧
   * @param {(latitude: number, longitude: number) => {x: number, y: number}} project 緯度・経度を位置に変える関数
   * @returns {string} 「M x,y L x,y … Z」をつないだ文字
   */
  function polygonsToPath(polygons, project) {
    return polygons
      .map((polygon) => {
        const points = polygon.map(([longitude, latitude]) => {
          const { x, y } = project(latitude, longitude);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        return `M${points.join(' L')} Z`;
      })
      .join(' ');
  }

  /**
   * 地図の陸地の path の d 属性を作る。
   * @returns {{mainland: string, inset: string}} 本土と、沖縄・奄美の枠の中の d 属性
   */
  function buildLandPaths() {
    return {
      mainland: polygonsToPath(MAINLAND_POLYGONS, projectToMainland),
      inset: polygonsToPath(INSET_POLYGONS, projectToInset),
    };
  }

  /**
   * SVG の要素を作る。
   * @param {Document} doc 要素を作る document
   * @param {string} tagName 要素の名前
   * @param {Object<string, string|number>} attributes 付ける属性
   * @returns {Element} 作った要素
   */
  function createSvgElement(doc, tagName, attributes) {
    const element = doc.createElementNS(SVG_NAMESPACE, tagName);
    Object.keys(attributes).forEach((name) => element.setAttribute(name, String(attributes[name])));
    return element;
  }

  /**
   * 日本地図を SVG に描き、地点の位置に印を付ける。
   * @param {SVGSVGElement} svg 描く先の svg 要素（中身は消して描き直す）
   * @param {{latitude: number, longitude: number}|null} place 印を付ける地点（null なら地図だけ）
   * @returns {boolean} 地点を地図の上に示せたら true。地図に載っていない場所なら false
   * 注意：色は CSS のクラス（map-sea・map-land など）で決める。属性のスタイルは使わない
   */
  function render(svg, place) {
    const doc = svg.ownerDocument;
    const paths = buildLandPaths();
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`);
    svg.appendChild(createSvgElement(doc, 'rect', { class: 'map-sea', x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT, rx: 10 }));
    svg.appendChild(createSvgElement(doc, 'path', { class: 'map-land', d: paths.mainland }));
    svg.appendChild(createSvgElement(doc, 'rect', { class: 'map-inset-frame', ...INSET_FRAME, rx: 4 }));
    svg.appendChild(createSvgElement(doc, 'path', { class: 'map-land', d: paths.inset }));
    const label = createSvgElement(doc, 'text', { class: 'map-inset-label', x: INSET_FRAME.x + 5, y: INSET_FRAME.y + 10 });
    label.textContent = '沖縄・奄美';
    svg.appendChild(label);

    const point = place ? projectPoint(place.latitude, place.longitude) : null;
    if (point === null) return false;
    svg.appendChild(createSvgElement(doc, 'circle', { class: 'map-marker-ring', cx: point.x.toFixed(1), cy: point.y.toFixed(1), r: 8 }));
    svg.appendChild(createSvgElement(doc, 'circle', { class: 'map-marker', cx: point.x.toFixed(1), cy: point.y.toFixed(1), r: 4.5 }));
    return true;
  }

  const api = { projectPoint, isOnLand, buildLandPaths, render, MAP_WIDTH, MAP_HEIGHT, INSET_FRAME };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.JapanMap = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
