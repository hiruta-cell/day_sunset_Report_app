/*
 * japan-map.test.js
 * 目的：japan-map.js の位置の変換と、地図の陸地（粗い多角形）の確認。
 * 使うデータ：主な都市の緯度・経度（公開されている地理の値）。個人情報は含まない。
 * 実行：npm test
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { projectPoint, isOnLand, buildLandPaths, MAP_WIDTH, MAP_HEIGHT, INSET_FRAME } = require('../src/japan-map.js');

// 地図の上で陸地に載っていてほしい主な都市（名前, 緯度, 経度）。海の上に印が出ないことの確認
const MAJOR_CITIES = [
  ['札幌', 43.062, 141.354], ['旭川', 43.771, 142.365], ['釧路', 42.985, 144.382], ['函館', 41.769, 140.729],
  ['稚内', 45.416, 141.673], ['網走', 44.021, 144.273], ['根室', 43.33, 145.583], ['青森', 40.825, 140.74],
  ['盛岡', 39.704, 141.153], ['秋田', 39.72, 140.103], ['仙台', 38.269, 140.872], ['新潟', 37.902, 139.023],
  ['水戸', 36.342, 140.447], ['東京', 35.689, 139.692], ['横浜', 35.444, 139.638], ['長野', 36.651, 138.181],
  ['金沢', 36.561, 136.657], ['福井', 36.065, 136.222], ['静岡', 34.977, 138.383], ['名古屋', 35.181, 136.906],
  ['津', 34.73, 136.509], ['大阪', 34.686, 135.52], ['松江', 35.472, 133.051], ['鳥取', 35.504, 134.238],
  ['広島', 34.397, 132.46], ['高松', 34.34, 134.043], ['松山', 33.842, 132.766], ['高知', 33.56, 133.531],
  ['福岡', 33.606, 130.418], ['長崎', 32.745, 129.874], ['熊本', 32.79, 130.742], ['宮崎', 31.911, 131.424],
  ['鹿児島', 31.56, 130.558], ['那覇', 26.212, 127.681],
];

test('projectPoint は東京を札幌より南・東京より西の福岡より東に置く', () => {
  const sapporo = projectPoint(43.062, 141.354);
  const tokyo = projectPoint(35.689, 139.692);
  const fukuoka = projectPoint(33.606, 130.418);
  assert.ok(sapporo.y < tokyo.y, '北にある札幌は上');
  assert.ok(fukuoka.x < tokyo.x, '西にある福岡は左');
});

test('projectPoint は本土の都市を地図の中に置き、那覇は沖縄の枠の中に置く', () => {
  const tokyo = projectPoint(35.689, 139.692);
  assert.equal(tokyo.isInset, false);
  assert.ok(tokyo.x >= 0 && tokyo.x <= MAP_WIDTH && tokyo.y >= 0 && tokyo.y <= MAP_HEIGHT);
  const naha = projectPoint(26.212, 127.681);
  assert.equal(naha.isInset, true);
  assert.ok(naha.x >= INSET_FRAME.x && naha.x <= INSET_FRAME.x + INSET_FRAME.width);
  assert.ok(naha.y >= INSET_FRAME.y && naha.y <= INSET_FRAME.y + INSET_FRAME.height);
});

test('projectPoint は地図に載っていない場所・数でない値に null を返す', () => {
  assert.equal(projectPoint(27.09, 142.2), null); // 小笠原諸島
  assert.equal(projectPoint(0, 0), null);
  assert.equal(projectPoint(Number.NaN, 139), null);
  assert.equal(projectPoint(35, undefined), null);
});

// 海岸線を約 3km の許容で単純化しているので、岬の先の都市は数 km だけ陸の外になることがある。その許容（度）
const COASTAL_TOLERANCE_DEGREES = 0.05;

/**
 * 緯度・経度が、陸地の中か、陸地から COASTAL_TOLERANCE_DEGREES 以内かを調べる。
 * @param {number} latitude 緯度（度）
 * @param {number} longitude 経度（度）
 * @returns {boolean} 陸地とその岸の近くなら true
 */
function isNearLand(latitude, longitude) {
  const offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  return offsets.some(([dLat, dLon]) =>
    isOnLand(latitude + dLat * COASTAL_TOLERANCE_DEGREES, longitude + dLon * COASTAL_TOLERANCE_DEGREES));
}

test('主な都市は、地図の陸地の上か岸のすぐそばにある（印が海に出ない）', () => {
  const missing = MAJOR_CITIES.filter(([, latitude, longitude]) => !isNearLand(latitude, longitude)).map(([name]) => name);
  assert.deepEqual(missing, []);
});

test('内陸の都市は、陸地の中にある', () => {
  const inland = ['旭川', '盛岡', '長野', '熊本'];
  const missing = MAJOR_CITIES.filter(([name]) => inland.includes(name)).filter(([, la, lo]) => !isOnLand(la, lo)).map(([name]) => name);
  assert.deepEqual(missing, []);
});

test('海の上の点は、陸地ではない', () => {
  assert.equal(isOnLand(38.0, 133.0), false); // 日本海の真ん中
  assert.equal(isOnLand(32.0, 145.0), false); // 太平洋の真ん中
});

test('buildLandPaths は本土と枠の中の d 属性を返す', () => {
  const paths = buildLandPaths();
  assert.match(paths.mainland, /^M[\d.,\sLZM-]+$/);
  assert.match(paths.inset, /^M[\d.,\sLZM-]+$/);
});
