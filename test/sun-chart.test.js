/*
 * sun-chart.test.js
 * 目的：sun-chart.js の位置の計算（太陽の弧の上の位置・昼の進み具合・昼夜のバー）の確認。
 * 使うデータ：架空の時刻だけ。
 * 実行：npm test
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getSunPosition, computeProgress, getDayBarSegment } = require('../src/sun-chart.js');

// 数の比較で許す差
const EPSILON = 1e-9;

test('getSunPosition は日の出で左端、南中で真ん中の頂点、日の入りで右端の地平線に置く', () => {
  const sunrise = getSunPosition(0);
  const noon = getSunPosition(0.5);
  const sunset = getSunPosition(1);
  assert.ok(sunrise.x < noon.x && noon.x < sunset.x);
  assert.ok(Math.abs(sunrise.y - sunset.y) < EPSILON, '日の出と日の入りは同じ高さ');
  assert.ok(noon.y < sunrise.y, '南中は地平線より高い（y は小さい）');
});

test('computeProgress は今日でないとき（null）、南中の位置を返す', () => {
  assert.deepEqual(computeProgress(300, 1100, null), { progress: 0.5, isDaytime: true, isLive: false });
});

test('computeProgress は今日のとき、いまの時刻に合わせて進み具合を返す', () => {
  const midday = computeProgress(300, 1100, 700);
  assert.equal(midday.progress, 0.5);
  assert.equal(midday.isDaytime, true);
  assert.equal(midday.isLive, true);
});

test('computeProgress は夜なら端に置き、昼ではないと伝える', () => {
  assert.deepEqual(computeProgress(300, 1100, 100), { progress: 0, isDaytime: false, isLive: true });
  assert.deepEqual(computeProgress(300, 1100, 1300), { progress: 1, isDaytime: false, isLive: true });
});

test('getDayBarSegment は昼の時間帯を、0時〜24時のバーの上の位置にする', () => {
  const segment = getDayBarSegment(360, 1080); // 6時〜18時
  assert.ok(Math.abs(segment.width - 150) < EPSILON, '12時間はバーの半分');
  assert.ok(Math.abs(segment.x - (10 + 75)) < EPSILON, '6時はバーの4分の1');
});
