/*
 * japan-map.js
 * 目的：簡略化した日本地図（SVG）を描き、選んだ地点の位置に印を付ける。ある瞬間の昼夜（日の出・日の入りの線、昼の側と夜の側）も重ねる。
 * 使い方：ブラウザでは <script> で読み込むと window.JapanMap に入る。Node では require('./japan-map.js')（位置の変換と昼夜の計算だけ使える）。
 * 注意：地図の形は、このファイルに書いた単純化した海岸線（緯度・経度）から作る。実行時に外部のデータは読まない。通信はしない。
 *   位置は目安で、海岸線の細かい形は表していない。
 */
(function (root) {
  'use strict';

  // SVG の名前空間（createElementNS に必要）
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

  // 日の出・日の入りとみなす太陽の高度（度）。大気による浮き上がりと太陽の半径を考えた値で、時刻の計算（sun-calc.js）と同じ
  const HORIZON_ALTITUDE_DEG = -0.833;

  // 昼夜の境の線を、この間隔（図の単位）ごとの点をつないだ折れ線で描く
  const DAYLIGHT_ROW_HEIGHT = 2;

  // 度をラジアンに変える係数
  const DEGREES_TO_RADIANS = Math.PI / 180;

  // 昼夜の判定（describeDaylight）で調べる点の数（地図の範囲を縦横に区切る数）
  const DAYLIGHT_SAMPLE_STEPS = 4;

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

  // 陸地の形。Natural Earth（https://www.naturalearthdata.com/、パブリックドメイン）の 1:50,000,000 の海岸線を、
  // 0.03 度（約3km）の許容でダグラス・ポイカー法により単純化したもの。[経度, 緯度] の頂点の配列で、島ごとに1つ。
  // 約 0.12 度より小さい島は省いた。国後・択捉・色丹・歯舞は、データの上ではロシア側にあるため、座標で選んで加えている。
  // 作り直すときは、同じデータを同じ方法で単純化して、下の2つの配列を差し替える。

  // 本土の地図に描く陸地（北海道・本州・四国・九州と、主な島。大きい島から並べている）
  const MAINLAND_POLYGONS = [
      [[141.23, 41.37], [141.46, 41.4], [141.4, 41.1], [141.43, 40.72], [141.46, 40.61], [141.8, 40.29], [141.99, 39.79], [141.98, 39.43], [141.9, 39.11], [141.66, 38.97], [141.55, 38.76], [141.47, 38.4], [141.11, 38.34], [140.96, 38.15], [140.93, 37.95], [141.04, 37.47], [141, 37.11], [140.97, 37], [140.73, 36.73], [140.57, 36.23], [140.62, 36.06], [140.87, 35.72], [140.64, 35.66], [140.46, 35.51], [140.35, 35.18], [140.06, 35.04], [139.92, 34.9], [139.84, 34.91], [139.8, 34.96], [139.84, 35.01], [139.83, 35.3], [140.1, 35.59], [139.99, 35.67], [139.83, 35.66], [139.77, 35.49], [139.65, 35.41], [139.74, 35.25], [139.68, 35.15], [139.47, 35.3], [139.25, 35.28], [139.13, 35.15], [139.09, 34.84], [138.98, 34.7], [138.84, 34.62], [138.76, 34.7], [138.8, 34.97], [138.9, 35.03], [138.72, 35.12], [138.58, 35.09], [138.19, 34.6], [137.54, 34.66], [137.06, 34.58], [137.29, 34.7], [137.28, 34.77], [137.03, 34.77], [136.96, 34.83], [136.94, 34.72], [136.87, 34.73], [136.85, 34.98], [136.9, 35.04], [136.8, 35.05], [136.69, 34.98], [136.53, 34.68], [136.88, 34.43], [136.85, 34.32], [136.33, 34.18], [135.92, 33.56], [135.7, 33.49], [135.45, 33.55], [135.13, 34.01], [135.1, 34.29], [135.31, 34.42], [135.42, 34.62], [135.36, 34.65], [135.04, 34.63], [134.74, 34.77], [134.25, 34.71], [133.97, 34.53], [133.45, 34.43], [133.14, 34.3], [133.02, 34.33], [132.66, 34.25], [132.42, 34.35], [132.31, 34.32], [132.24, 34.23], [132.15, 33.84], [131.74, 34.05], [131.23, 33.95], [131.07, 34.02], [130.92, 33.98], [130.89, 34.26], [131, 34.39], [131.35, 34.41], [132.26, 35.02], [132.7, 35.42], [132.92, 35.51], [133.27, 35.56], [133.38, 35.46], [133.62, 35.51], [133.98, 35.51], [135.17, 35.75], [135.27, 35.72], [135.23, 35.59], [135.33, 35.53], [135.68, 35.5], [135.9, 35.61], [136.1, 35.77], [136.01, 35.99], [136.07, 36.12], [136.7, 36.74], [136.75, 36.95], [136.72, 37.2], [136.84, 37.38], [137.32, 37.52], [137.34, 37.44], [136.9, 37.12], [136.99, 37.03], [137.02, 36.84], [137.25, 36.75], [137.34, 36.77], [137.51, 36.95], [138.32, 37.22], [138.63, 37.47], [138.89, 37.84], [139.36, 38.1], [139.52, 38.5], [139.8, 38.88], [139.91, 39.23], [140.04, 39.41], [140.06, 39.62], [139.99, 39.86], [139.74, 39.92], [139.91, 40.02], [140.01, 40.26], [139.92, 40.53], [139.97, 40.67], [140.28, 40.85], [140.34, 41.01], [140.32, 41.16], [140.39, 41.23], [140.63, 41.2], [140.68, 40.89], [140.75, 40.83], [140.94, 40.94], [141.12, 40.88], [141.23, 40.99], [141.24, 41.21], [141.2, 41.24], [140.8, 41.14], [140.8, 41.25], [140.94, 41.51]],
      [[131.17, 33.6], [131.37, 33.57], [131.58, 33.65], [131.7, 33.6], [131.71, 33.5], [131.54, 33.27], [131.9, 33.25], [131.85, 33.12], [131.95, 33.05], [131.91, 32.97], [132, 32.88], [131.66, 32.47], [131.46, 31.88], [131.46, 31.67], [131.34, 31.4], [131.07, 31.44], [131.04, 31.38], [131.1, 31.26], [130.69, 31.02], [130.79, 31.27], [130.7, 31.58], [130.8, 31.62], [130.78, 31.71], [130.66, 31.72], [130.56, 31.56], [130.54, 31.4], [130.64, 31.27], [130.59, 31.18], [130.2, 31.29], [130.15, 31.41], [130.29, 31.45], [130.32, 31.6], [130.19, 31.77], [130.19, 32.09], [130.39, 32.22], [130.64, 32.62], [130.5, 32.66], [130.57, 32.73], [130.55, 32.83], [130.38, 33.09], [130.24, 33.18], [130.13, 33.1], [130.18, 32.85], [130.33, 32.85], [130.34, 32.7], [130.25, 32.68], [130.05, 32.77], [129.77, 32.57], [129.83, 32.73], [129.69, 32.88], [129.68, 33.06], [129.83, 32.89], [129.99, 32.85], [129.9, 33.02], [129.58, 33.24], [129.61, 33.34], [129.84, 33.32], [129.83, 33.44], [130.17, 33.6], [130.37, 33.63], [130.48, 33.83], [130.72, 33.93], [130.95, 33.87], [131.06, 33.67]],
      [[143.82, 44.12], [144.1, 44.1], [144.48, 43.95], [144.72, 43.93], [144.87, 43.98], [145.37, 44.33], [145.13, 43.87], [145.14, 43.66], [145.34, 43.3], [145.49, 43.28], [145.67, 43.39], [145.83, 43.39], [145.62, 43.29], [145.51, 43.17], [145.35, 43.18], [144.92, 43], [144.63, 42.95], [144.2, 42.97], [143.97, 42.88], [143.58, 42.6], [143.43, 42.42], [143.24, 42], [142.51, 42.26], [141.85, 42.58], [141.41, 42.55], [140.99, 42.34], [140.71, 42.56], [140.48, 42.56], [140.35, 42.44], [140.33, 42.29], [140.53, 42.13], [140.73, 42.12], [141.15, 41.81], [141, 41.74], [140.66, 41.82], [140.27, 41.46], [140.15, 41.42], [140.04, 41.47], [140, 41.58], [140.11, 41.91], [140.06, 42.07], [139.84, 42.28], [139.86, 42.58], [139.89, 42.65], [140.11, 42.73], [140.43, 42.95], [140.49, 43.05], [140.4, 43.17], [140.39, 43.3], [140.49, 43.34], [140.82, 43.21], [141.14, 43.18], [141.3, 43.2], [141.37, 43.28], [141.4, 43.64], [141.64, 44.02], [141.66, 44.26], [141.76, 44.48], [141.78, 44.72], [141.58, 45.16], [141.67, 45.4], [141.94, 45.51], [142.88, 44.67]],
      [[134.36, 34.26], [134.64, 34.23], [134.67, 33.85], [134.74, 33.82], [134.38, 33.61], [134.24, 33.44], [134.18, 33.25], [133.96, 33.45], [133.63, 33.51], [133.29, 33.36], [133.15, 33.08], [133.02, 32.98], [132.98, 32.84], [132.8, 32.75], [132.64, 32.76], [132.71, 32.9], [132.5, 32.92], [132.43, 33.06], [132.51, 33.29], [132.41, 33.33], [132.41, 33.43], [132.03, 33.34], [132.64, 33.69], [132.78, 33.99], [132.94, 34.1], [133.13, 33.93], [133.19, 33.93], [133.58, 34.02], [133.64, 34.13], [133.6, 34.24], [133.71, 34.24], [133.95, 34.35], [134.08, 34.36]],
      [[148.6, 45.32], [148.26, 45.22], [147.91, 44.99], [147.66, 44.98], [147.56, 44.84], [147.31, 44.68], [147.21, 44.55], [146.9, 44.4], [146.93, 44.51], [147.14, 44.66], [147.15, 44.77], [147.25, 44.86], [147.89, 45.23], [147.92, 45.38], [148.06, 45.26], [148.32, 45.28], [148.61, 45.48], [148.81, 45.51], [148.84, 45.36]],
      [[146.21, 44.5], [146.36, 44.42], [146.57, 44.44], [146.52, 44.37], [146.11, 44.25], [145.91, 44.1], [145.77, 43.94], [145.59, 43.85], [145.56, 43.66], [145.44, 43.74], [145.46, 43.87], [145.75, 44.07], [146.11, 44.5]],
      [[138.34, 37.82], [138.23, 37.83], [138.32, 37.97], [138.25, 37.99], [138.25, 38.08], [138.5, 38.32], [138.45, 38.08], [138.58, 38.07], [138.5, 37.9]],
      [[134.93, 34.29], [134.82, 34.2], [134.73, 34.21], [134.67, 34.29], [134.83, 34.47], [135, 34.54], [134.91, 34.4]],
      [[130.08, 32.23], [130, 32.19], [129.96, 32.24], [130.02, 32.29], [130.01, 32.52], [130.17, 32.54], [130.2, 32.34]],
      [[129.39, 34.35], [129.37, 34.31], [129.27, 34.37], [129.33, 34.61], [129.45, 34.69], [129.48, 34.54]],
      [[130.62, 30.26], [130.45, 30.26], [130.39, 30.39], [130.5, 30.47], [130.67, 30.37]],
      [[130.96, 30.4], [130.87, 30.39], [130.87, 30.44], [131.06, 30.83], [131.06, 30.64]],
      [[129.28, 34.12], [129.21, 34.08], [129.19, 34.15], [129.21, 34.32], [129.34, 34.28]],
      [[128.67, 32.78], [128.84, 32.76], [128.89, 32.65], [128.75, 32.59], [128.69, 32.6]],
      [[141.3, 45.12], [141.15, 45.15], [141.14, 45.21], [141.25, 45.23], [141.33, 45.15]],
      [[132.27, 33.95], [132.44, 33.91], [132.36, 33.85], [132.21, 33.87], [132.21, 33.95]],
      [[146.71, 43.74], [146.61, 43.74], [146.62, 43.81], [146.82, 43.86], [146.88, 43.83]],
      [[133.37, 36.2], [133.24, 36.18], [133.21, 36.29], [133.3, 36.34]],
      [[130.38, 32.42], [130.24, 32.46], [130.37, 32.53], [130.46, 32.52]],
      [[141.07, 45.33], [141.03, 45.27], [140.97, 45.47], [141.06, 45.45]],
      [[139.48, 42.08], [139.43, 42.08], [139.43, 42.2], [139.56, 42.24]],
      [[134.35, 34.48], [134.25, 34.42], [134.18, 34.52], [134.33, 34.53]],
      [[129.08, 32.84], [129, 32.95], [129.11, 33.13], [129.18, 32.99]],
      [[129.49, 33.22], [129.37, 33.18], [129.46, 33.33], [129.57, 33.36]],
      [[129.8, 33.75], [129.73, 33.71], [129.67, 33.74], [129.72, 33.86]],
      [[129.72, 31.66], [129.69, 31.64], [129.71, 31.72], [129.79, 31.79]],
  ];

  // 沖縄・奄美の枠に描く陸地
  const INSET_POLYGONS = [
      [[128.26, 26.65], [127.87, 26.44], [127.9, 26.33], [127.79, 26.26], [127.8, 26.15], [127.65, 26.09], [127.73, 26.43], [127.95, 26.59], [127.89, 26.63], [127.91, 26.69], [128.05, 26.64], [128.1, 26.67], [128.25, 26.88], [128.33, 26.81]],
      [[124.29, 24.52], [124.23, 24.36], [124.14, 24.35], [124.08, 24.44], [124.21, 24.46], [124.3, 24.59]],
      [[129.45, 28.21], [129.37, 28.13], [129.16, 28.25], [129.69, 28.52], [129.71, 28.43], [129.46, 28.27]],
      [[123.89, 24.28], [123.68, 24.32], [123.77, 24.41], [123.93, 24.36]],
      [[129, 27.72], [128.9, 27.73], [128.88, 27.84], [128.95, 27.91]],
      [[125.44, 24.74], [125.27, 24.73], [125.28, 24.87]],
      [[129.32, 28.1], [129.23, 28.1], [129.19, 28.19]],
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
   * 2つの経度の差を、-180〜180 度の範囲に収める。
   * @param {number} difference 経度の差（度）
   * @returns {number} -180 以上 180 未満の差（度）
   */
  function normalizeLongitudeDifference(difference) {
    return ((((difference + 180) % 360) + 360) % 360) - 180;
  }

  /**
   * ある緯度で、太陽の真下の経度から東西にどこまで昼が続くか（昼の半分の幅）を求める。
   * @param {number} latitude 緯度（度）
   * @param {number} subsolarLatitude 太陽直下点の緯度（度。太陽の赤緯と同じ）
   * @returns {number} 昼の半分の幅（度）。0 なら一日中夜、180 なら一日中昼
   */
  function getDaylightHalfWidth(latitude, subsolarLatitude) {
    const latitudeRad = latitude * DEGREES_TO_RADIANS;
    const declinationRad = subsolarLatitude * DEGREES_TO_RADIANS;
    const denominator = Math.cos(latitudeRad) * Math.cos(declinationRad);
    // 太陽の高度が日の出・日の入りの値になる時角 H は、sin(高度) = sin(緯度)sin(赤緯) + cos(緯度)cos(赤緯)cos(H) から求める
    const numerator = Math.sin(HORIZON_ALTITUDE_DEG * DEGREES_TO_RADIANS) - Math.sin(latitudeRad) * Math.sin(declinationRad);
    if (Math.abs(denominator) < 1e-12) return numerator < 0 ? 180 : 0; // 極
    const cosine = numerator / denominator;
    if (cosine >= 1) return 0; // 一日中夜（極夜）
    if (cosine <= -1) return 180; // 一日中昼（白夜）
    return Math.acos(cosine) / DEGREES_TO_RADIANS;
  }

  /**
   * ある瞬間に、その地点が昼（太陽が日の出・日の入りの高度より上）かどうか。
   * @param {number} latitude 緯度（度）
   * @param {number} longitude 経度（度）
   * @param {{latitude: number, longitude: number}} subsolar 太陽直下点（SunCalc.getSubsolarPoint の結果）
   * @returns {boolean} 昼なら true
   */
  function isDaylight(latitude, longitude, subsolar) {
    const halfWidth = getDaylightHalfWidth(latitude, subsolar.latitude);
    return Math.abs(normalizeLongitudeDifference(longitude - subsolar.longitude)) < halfWidth;
  }

  /**
   * 日本の範囲が、全部昼か・全部夜か・昼と夜が混ざっているかを調べる（地図の下の説明に使う）。
   * @param {{latitude: number, longitude: number}} subsolar 太陽直下点
   * @returns {'day'|'night'|'mixed'} 全部昼なら 'day'、全部夜なら 'night'、混ざっていれば 'mixed'
   */
  function describeDaylight(subsolar) {
    let dayCount = 0;
    let total = 0;
    for (let row = 0; row <= DAYLIGHT_SAMPLE_STEPS; row++) {
      for (let column = 0; column <= DAYLIGHT_SAMPLE_STEPS; column++) {
        const latitude = MAIN_BOUNDS.minLatitude + ((MAIN_BOUNDS.maxLatitude - MAIN_BOUNDS.minLatitude) * row) / DAYLIGHT_SAMPLE_STEPS;
        const longitude = MAIN_BOUNDS.minLongitude + ((MAIN_BOUNDS.maxLongitude - MAIN_BOUNDS.minLongitude) * column) / DAYLIGHT_SAMPLE_STEPS;
        total += 1;
        if (isDaylight(latitude, longitude, subsolar)) dayCount += 1;
      }
    }
    if (dayCount === total) return 'day';
    return dayCount === 0 ? 'night' : 'mixed';
  }

  /**
   * 範囲（本土の地図、または沖縄・奄美の枠）の中の、昼の領域・夜の領域・日の出の線・日の入りの線を作る。
   * @param {{left: number, right: number, top: number, bottom: number, minLongitude: number, maxLongitude: number,
   *          latitudeAt: (y: number) => number, xAt: (longitude: number) => number}} region 範囲（位置は図の単位）
   * @param {{latitude: number, longitude: number}} subsolar 太陽直下点
   * @returns {{night: string, day: string, sunrise: string, sunset: string, sunriseLabel: {x: number, y: number}|null,
   *            sunsetLabel: {x: number, y: number}|null}} SVG の path の d 属性（なければ空の文字）と、線の名札を置く位置
   * 注意：日の出の線は昼の領域の西の端（朝の側）、日の入りの線は東の端（夕方の側）にできる
   */
  function buildDaylightRegion(region, subsolar) {
    const centerLongitude = (region.minLongitude + region.maxLongitude) / 2;
    // 太陽直下点の経度を、範囲の真ん中に近い表し方（±360 度のうち近いほう）にする
    const sunLongitude = centerLongitude - normalizeLongitudeDifference(centerLongitude - subsolar.longitude);
    const clamp = (x) => Math.min(region.right, Math.max(region.left, x));
    const points = [];
    for (let y = region.top; ; y += DAYLIGHT_ROW_HEIGHT) {
      const rowY = Math.min(y, region.bottom);
      const halfWidth = getDaylightHalfWidth(region.latitudeAt(rowY), subsolar.latitude);
      const west = region.xAt(sunLongitude - halfWidth);
      const east = region.xAt(sunLongitude + halfWidth);
      points.push({ y: rowY, west: clamp(west), east: clamp(east), isWestInside: west > region.left && west < region.right, isEastInside: east > region.left && east < region.right });
      if (rowY >= region.bottom) break;
    }
    const format = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;
    const night =
      `M${format(region.left, region.top)} ${points.map((point) => `L${format(point.west, point.y)}`).join(' ')} L${format(region.left, region.bottom)} Z ` +
      `M${format(region.right, region.top)} ${points.map((point) => `L${format(point.east, point.y)}`).join(' ')} L${format(region.right, region.bottom)} Z`;
    const day =
      `M${points.map((point) => format(point.west, point.y)).join(' L')} ` +
      `${points.slice().reverse().map((point) => `L${format(point.east, point.y)}`).join(' ')} Z`;

    // 線は、範囲の中にある点だけをつなぐ（範囲の端に張り付いたところは描かない）
    const buildLine = (xKey, insideKey) => {
      let path = '';
      let isDrawing = false;
      for (const point of points) {
        if (point[insideKey]) {
          path += `${isDrawing ? 'L' : 'M'}${format(point[xKey], point.y)} `;
          isDrawing = true;
        } else {
          isDrawing = false;
        }
      }
      return path.trim();
    };
    // 名札は、範囲の縦の真ん中に一番近い、線の上の点に置く
    const middleY = (region.top + region.bottom) / 2;
    const findLabel = (xKey, insideKey) => {
      const inside = points.filter((point) => point[insideKey]);
      if (inside.length === 0) return null;
      const nearest = inside.reduce((best, point) => (Math.abs(point.y - middleY) < Math.abs(best.y - middleY) ? point : best));
      return { x: nearest[xKey], y: nearest.y };
    };
    return {
      night,
      day,
      sunrise: buildLine('west', 'isWestInside'),
      sunset: buildLine('east', 'isEastInside'),
      sunriseLabel: findLabel('west', 'isWestInside'),
      sunsetLabel: findLabel('east', 'isEastInside'),
    };
  }

  /**
   * 本土の地図と沖縄・奄美の枠の、昼夜の領域と日の出・日の入りの線を作る。
   * @param {{latitude: number, longitude: number}} subsolar 太陽直下点（SunCalc.getSubsolarPoint の結果）
   * @returns {{mainland: object, inset: object}} buildDaylightRegion の結果（本土・枠の中）
   */
  function buildDaylightGeometry(subsolar) {
    const mainland = buildDaylightRegion(
      {
        left: 0,
        right: MAP_WIDTH,
        top: 0,
        bottom: MAP_HEIGHT,
        minLongitude: MAIN_BOUNDS.minLongitude,
        maxLongitude: MAIN_BOUNDS.maxLongitude,
        latitudeAt: (y) => MAIN_BOUNDS.maxLatitude - y / MAIN_SCALE,
        xAt: (longitude) => (longitude - MAIN_BOUNDS.minLongitude) * MAIN_LONGITUDE_SCALE,
      },
      subsolar
    );
    const inset = buildDaylightRegion(
      {
        left: INSET_FRAME.x,
        right: INSET_FRAME.x + INSET_FRAME.width,
        top: INSET_FRAME.y,
        bottom: INSET_FRAME.y + INSET_FRAME.height,
        minLongitude: INSET_BOUNDS.minLongitude,
        maxLongitude: INSET_BOUNDS.maxLongitude,
        latitudeAt: (y) => INSET_BOUNDS.maxLatitude - (y - INSET_FRAME.y - INSET_PADDING) / INSET_SCALE,
        xAt: (longitude) => INSET_FRAME.x + INSET_PADDING + (longitude - INSET_BOUNDS.minLongitude) * INSET_LONGITUDE_SCALE,
      },
      subsolar
    );
    return { mainland, inset };
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
   * 昼夜の領域（昼の側・夜の側）と日の出・日の入りの線を、SVG に描き足す。
   * @param {SVGElement} parent 描き足す先
   * @param {object} region buildDaylightRegion の結果
   * @param {boolean} withLabels 線に「日の出」「日の入り」の名札を付けるか
   */
  function drawDaylightRegion(parent, region, withLabels) {
    const doc = parent.ownerDocument;
    parent.appendChild(createSvgElement(doc, 'path', { class: 'map-day', d: region.day }));
    parent.appendChild(createSvgElement(doc, 'path', { class: 'map-night', d: region.night }));
    if (region.sunrise) parent.appendChild(createSvgElement(doc, 'path', { class: 'map-line-sunrise', d: region.sunrise }));
    if (region.sunset) parent.appendChild(createSvgElement(doc, 'path', { class: 'map-line-sunset', d: region.sunset }));
    if (!withLabels) return;
    [['sunriseLabel', 'map-line-label map-line-label-sunrise', 'end', -4, '日の出'], ['sunsetLabel', 'map-line-label map-line-label-sunset', 'start', 4, '日の入り']].forEach(
      ([key, className, anchor, offset, text]) => {
        if (!region[key]) return;
        const label = createSvgElement(doc, 'text', { class: className, x: (region[key].x + offset).toFixed(1), y: region[key].y.toFixed(1), 'text-anchor': anchor });
        label.textContent = text;
        parent.appendChild(label);
      }
    );
  }

  /**
   * 日本地図を SVG に描き、地点の位置に印を付ける。ある瞬間の昼夜も重ねる。
   * @param {SVGSVGElement} svg 描く先の svg 要素（中身は消して描き直す）
   * @param {{latitude: number, longitude: number}|null} place 印を付ける地点（null なら地図だけ）
   * @param {{latitude: number, longitude: number}|null} [subsolar] 昼夜を示す瞬間の太陽直下点（省略か null なら昼夜は描かない）
   * @returns {boolean} 地点を地図の上に示せたら true。地図に載っていない場所なら false
   * 注意：色は CSS のクラス（map-sea・map-land・map-day・map-night など）で決める。属性のスタイルは使わない
   */
  function render(svg, place, subsolar) {
    const doc = svg.ownerDocument;
    const paths = buildLandPaths();
    const daylight = subsolar ? buildDaylightGeometry(subsolar) : null;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`);

    // 角の丸い地図の外へ、昼夜の色がはみ出さないようにする
    const clipPath = createSvgElement(doc, 'clipPath', { id: 'map-clip' });
    clipPath.appendChild(createSvgElement(doc, 'rect', { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT, rx: 10 }));
    const defs = createSvgElement(doc, 'defs', {});
    defs.appendChild(clipPath);
    svg.appendChild(defs);

    const group = createSvgElement(doc, 'g', { 'clip-path': 'url(#map-clip)' });
    group.appendChild(createSvgElement(doc, 'rect', { class: 'map-sea', x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT }));
    group.appendChild(createSvgElement(doc, 'path', { class: 'map-land', d: paths.mainland }));
    if (daylight) drawDaylightRegion(group, daylight.mainland, true);
    group.appendChild(createSvgElement(doc, 'rect', { class: 'map-inset-frame', ...INSET_FRAME, rx: 4 }));
    group.appendChild(createSvgElement(doc, 'path', { class: 'map-land', d: paths.inset }));
    if (daylight) drawDaylightRegion(group, daylight.inset, false);
    const label = createSvgElement(doc, 'text', { class: 'map-inset-label', x: INSET_FRAME.x + 5, y: INSET_FRAME.y + 10 });
    label.textContent = '沖縄・奄美';
    group.appendChild(label);
    svg.appendChild(group);

    const point = place ? projectPoint(place.latitude, place.longitude) : null;
    if (point === null) return false;
    svg.appendChild(createSvgElement(doc, 'circle', { class: 'map-marker-ring', cx: point.x.toFixed(1), cy: point.y.toFixed(1), r: 8 }));
    svg.appendChild(createSvgElement(doc, 'circle', { class: 'map-marker', cx: point.x.toFixed(1), cy: point.y.toFixed(1), r: 4.5 }));
    return true;
  }

  const api = {
    projectPoint,
    isOnLand,
    buildLandPaths,
    isDaylight,
    describeDaylight,
    getDaylightHalfWidth,
    buildDaylightGeometry,
    render,
    MAP_WIDTH,
    MAP_HEIGHT,
    INSET_FRAME,
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.JapanMap = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
