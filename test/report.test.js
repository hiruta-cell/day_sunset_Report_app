/*
 * report.test.js
 * 目的：時刻の書式・月の表・CSV（src/report.js）を確かめる。
 * 実行：npm test。地点の名前は架空のものを使う。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatTime, formatDuration, formatDurationChange, getDayLengthChangeText, buildMonthRows, toCsv, escapeCsvCell,
} = require('../src/report.js');

// 架空の地点（座標は東京付近）
const SAMPLE_PLACE = { name: '架空県サンプル市', latitude: 35.6581, longitude: 139.7414 };

test('formatTime は分を HH:MM にし、秒を四捨五入し、null を --:-- にする', () => {
  assert.equal(formatTime(265.4), '04:25');
  assert.equal(formatTime(265.6), '04:26');
  assert.equal(formatTime(1439.7), '00:00');
  assert.equal(formatTime(-5), '23:55');
  assert.equal(formatTime(null), '--:--');
});

test('formatDuration は分を「◯時間◯◯分」にする', () => {
  assert.equal(formatDuration(875.2), '14時間35分');
  assert.equal(formatDuration(0), '0時間00分');
});

test('buildMonthRows はその月の日数分の行を作る（うるう年の2月も）', () => {
  assert.equal(buildMonthRows(2026, 2, SAMPLE_PLACE.latitude, SAMPLE_PLACE.longitude).length, 28);
  assert.equal(buildMonthRows(2028, 2, SAMPLE_PLACE.latitude, SAMPLE_PLACE.longitude).length, 29);
  const june = buildMonthRows(2026, 6, SAMPLE_PLACE.latitude, SAMPLE_PLACE.longitude);
  assert.equal(june.length, 30);
  assert.equal(june[20].dateText, '2026-06-21');
  assert.equal(june[20].weekday, '日');
});

test('escapeCsvCell は引用符を重ね、数式とみなされる先頭に \' を付ける', () => {
  assert.equal(escapeCsvCell('a"b'), '"a""b"');
  assert.equal(escapeCsvCell('=1+1'), '"\'=1+1"');
  assert.equal(escapeCsvCell('04:25'), '"04:25"');
});

test('toCsv は地点・注記・見出し・毎日の行を CRLF で出す', () => {
  const rows = buildMonthRows(2026, 6, SAMPLE_PLACE.latitude, SAMPLE_PLACE.longitude);
  const lines = toCsv(rows, SAMPLE_PLACE).split('\r\n');
  assert.equal(lines[0], '"地点","架空県サンプル市","緯度 35.6581","経度 139.7414"');
  assert.equal(lines[2], '"日付","曜日","日の出","南中","日の入り","昼の長さ"');
  assert.equal(lines.length, 3 + 30 + 1); // 前の3行 ＋ 30日 ＋ 最後の改行の後の空
  assert.match(lines[23], /^"2026-06-21","日","04:2\d","11:4\d","1[89]:\d\d","14時間\d\d分"$/);
});

test('formatDurationChange は前日との差を「前日より +◯分◯秒」にする', () => {
  assert.equal(formatDurationChange(1.5), '前日より +1分30秒');
  assert.equal(formatDurationChange(-0.75), '前日より -45秒');
  assert.equal(formatDurationChange(-2), '前日より -2分');
  assert.equal(formatDurationChange(0), '前日と同じ');
  assert.equal(formatDurationChange(0.001), '前日と同じ'); // 0.06 秒は 0 秒に丸まる
});

test('getDayLengthChangeText は春分前は伸び、夏至後は縮み、範囲外・白夜・極夜は空にする', () => {
  assert.match(getDayLengthChangeText({ year: 2026, month: 3, day: 1 }, 35.6581, 139.7414), /^前日より \+/);
  assert.match(getDayLengthChangeText({ year: 2026, month: 7, day: 1 }, 35.6581, 139.7414), /^前日より -/);
  assert.equal(getDayLengthChangeText({ year: 1901, month: 1, day: 1 }, 35.6581, 139.7414), ''); // 前日が範囲外
  assert.equal(getDayLengthChangeText({ year: 2026, month: 12, day: 21 }, 80, 139), ''); // 極夜
});
