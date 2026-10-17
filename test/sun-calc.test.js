/*
 * sun-calc.test.js
 * 目的：日の出・日の入りの計算（src/sun-calc.js）が、国立天文台の暦の値と ±2 分以内で合うかを確かめる。
 * 実行：npm test（Node 標準の node --test を使う。部品は使わない）
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSunTimes, getSubsolarPoint, isValidDate } = require('../src/sun-calc.js');

// 許す誤差（分）。暦の値は分単位に丸めてあるので、計算値（小数）とは最大 1 分ずれる
const TOLERANCE_MINUTES = 1;

// 日本時間の時差
const JST = 9;

/**
 * 「HH:MM」を 0時からの分にする。
 * @param {string} text 「04:25」の形
 * @returns {number} 分
 */
function toMinutes(text) {
  const [hours, minutes] = text.split(':').map(Number);
  return hours * 60 + minutes;
}

// 比べる値：国立天文台 暦計算室「日の出入り」2026年の表（https://eco.mtk.nao.ac.jp/koyomi/dni/2026/）の値。
// 地点の緯度・経度も同じ表のもの（2026-10-18 に確認）
const REFERENCE_CASES = [
  { name: '東京 夏至', latitude: 35.6581, longitude: 139.7414, date: { year: 2026, month: 6, day: 21 }, sunrise: '04:25', solarNoon: '11:43', sunset: '19:00' },
  { name: '東京 冬至', latitude: 35.6581, longitude: 139.7414, date: { year: 2026, month: 12, day: 22 }, sunrise: '06:47', solarNoon: '11:39', sunset: '16:32' },
  { name: '根室 夏至', latitude: 43.3333, longitude: 145.5833, date: { year: 2026, month: 6, day: 21 }, sunrise: '03:37', solarNoon: '11:19', sunset: '19:02' },
  { name: '鹿児島 冬至', latitude: 31.6, longitude: 130.55, date: { year: 2026, month: 12, day: 22 }, sunrise: '07:13', solarNoon: '12:16', sunset: '17:19' },
];

for (const reference of REFERENCE_CASES) {
  test(`${reference.name} の日の出・南中・日の入りが国立天文台の暦と ±${TOLERANCE_MINUTES} 分で合う`, () => {
    const result = computeSunTimes(reference.date, reference.latitude, reference.longitude, JST);
    assert.equal(result.status, 'normal');
    assert.ok(Math.abs(result.sunriseMinutes - toMinutes(reference.sunrise)) <= TOLERANCE_MINUTES, `日の出 ${result.sunriseMinutes}`);
    assert.ok(Math.abs(result.solarNoonMinutes - toMinutes(reference.solarNoon)) <= TOLERANCE_MINUTES, `南中 ${result.solarNoonMinutes}`);
    assert.ok(Math.abs(result.sunsetMinutes - toMinutes(reference.sunset)) <= TOLERANCE_MINUTES, `日の入り ${result.sunsetMinutes}`);
  });
}

test('南中は日の出と日の入りのほぼ真ん中になる', () => {
  const result = computeSunTimes({ year: 2026, month: 3, day: 20 }, 35.6581, 139.7414, JST);
  const middle = (result.sunriseMinutes + result.sunsetMinutes) / 2;
  assert.ok(Math.abs(result.solarNoonMinutes - middle) < 1);
  assert.ok(Math.abs(result.dayLengthMinutes - (result.sunsetMinutes - result.sunriseMinutes)) < 1e-9);
});

test('北極圏の夏至は白夜（沈まない）、冬至は極夜（昇らない）になる', () => {
  const summer = computeSunTimes({ year: 2026, month: 6, day: 21 }, 78, 15, 1);
  assert.equal(summer.status, 'midnightSun');
  assert.equal(summer.sunriseMinutes, null);
  assert.equal(summer.dayLengthMinutes, 1440);
  const winter = computeSunTimes({ year: 2026, month: 12, day: 22 }, 78, 15, 1);
  assert.equal(winter.status, 'polarNight');
  assert.equal(winter.dayLengthMinutes, 0);
});

test('正しくない日付・緯度・経度は RangeError になる', () => {
  assert.throws(() => computeSunTimes({ year: 2026, month: 2, day: 30 }, 35, 139, JST), RangeError);
  assert.throws(() => computeSunTimes({ year: 2026, month: 6, day: 1 }, 91, 139, JST), RangeError);
  assert.throws(() => computeSunTimes({ year: 2026, month: 6, day: 1 }, 35, Number.NaN, JST), RangeError);
  assert.throws(() => computeSunTimes(null, 35, 139, JST), RangeError);
});

test('isValidDate はうるう年と範囲を正しく判定する', () => {
  assert.equal(isValidDate(2028, 2, 29), true);
  assert.equal(isValidDate(2026, 2, 29), false);
  assert.equal(isValidDate(1900, 1, 1), false);
  assert.equal(isValidDate(2100, 1, 1), false);
});

test('getSubsolarPoint は東京の南中の瞬間に、東京の経度の真上を示す', () => {
  const tokyo = { latitude: 35.6581, longitude: 139.7414 };
  const times = computeSunTimes({ year: 2026, month: 6, day: 21 }, tokyo.latitude, tokyo.longitude, JST);
  const noonUtcMs = Date.UTC(2026, 5, 21, 0, 0) + (times.solarNoonMinutes - JST * 60) * 60000;
  const subsolar = getSubsolarPoint(noonUtcMs);
  assert.ok(Math.abs(subsolar.longitude - tokyo.longitude) < 0.1, `経度 ${subsolar.longitude}`);
  assert.ok(Math.abs(subsolar.latitude - 23.4) < 0.1, `緯度 ${subsolar.latitude}`);
});

test('getSubsolarPoint は夏至・冬至・春分の赤緯と、経度の範囲を正しく返す', () => {
  assert.ok(Math.abs(getSubsolarPoint(Date.UTC(2026, 11, 21, 12)).latitude + 23.4) < 0.1);
  assert.ok(Math.abs(getSubsolarPoint(Date.UTC(2026, 2, 20, 12)).latitude) < 0.6);
  const subsolar = getSubsolarPoint(Date.UTC(2026, 5, 21, 18)); // 世界時18時 → 太陽は経度 -90 度付近の真上
  assert.ok(Math.abs(subsolar.longitude + 90) < 1.5, `経度 ${subsolar.longitude}`);
  assert.throws(() => getSubsolarPoint(Number.NaN), RangeError);
});
