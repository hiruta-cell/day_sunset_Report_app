/*
 * weather.test.js
 * 目的：weather.js の URL の作り方（緯度・経度を丸める）、応答の読み取り、風向・天気の名前、失敗の扱いの確認。
 * 使うデータ：架空の応答と座標だけ。実際には通信しない（偽物の fetch を渡す）。
 * 実行：npm test
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchCurrentWeather, buildWeatherUrl, parseWeatherResponse, getWindDirectionLabel, getWeatherLabel } = require('../src/weather.js');

// Open-Meteo の応答と同じ形の見本（数値は架空）
const SAMPLE_BODY = {
  current: { time: '2026-10-18T06:45', interval: 900, temperature_2m: 13.04, wind_speed_10m: 1.21, wind_direction_10m: 336, weather_code: 1 },
};

/**
 * 決まった応答を返す偽物の fetch を作る。
 * @param {{ok?: boolean, status?: number, body?: unknown}} options 応答の中身
 * @returns {{fetchFn: Function, calls: string[]}} 偽物の fetch と、呼ばれた URL の記録
 */
function createFakeFetch({ ok = true, status = 200, body = SAMPLE_BODY } = {}) {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    return { ok, status, json: async () => body };
  };
  return { fetchFn, calls };
}

test('buildWeatherUrl は緯度・経度を小数2桁に丸め、必要な項目と日本時間・m/s を指定する', () => {
  const url = new URL(buildWeatherUrl(35.658123, 139.741456));
  assert.equal(url.origin, 'https://api.open-meteo.com');
  assert.equal(url.searchParams.get('latitude'), '35.66');
  assert.equal(url.searchParams.get('longitude'), '139.74');
  assert.equal(url.searchParams.get('current'), 'temperature_2m,wind_speed_10m,wind_direction_10m,weather_code');
  assert.equal(url.searchParams.get('wind_speed_unit'), 'ms');
  assert.equal(url.searchParams.get('timezone'), 'Asia/Tokyo');
});

test('buildWeatherUrl は正しくない緯度・経度で RangeError を投げ、文に値を入れない', () => {
  assert.throws(() => buildWeatherUrl(91, 139), (error) => error instanceof RangeError && !/91/.test(error.message));
  assert.throws(() => buildWeatherUrl(35, Number.NaN), RangeError);
});

test('getWindDirectionLabel は風向（度）を16方位にする', () => {
  assert.equal(getWindDirectionLabel(0), '北');
  assert.equal(getWindDirectionLabel(90), '東');
  assert.equal(getWindDirectionLabel(180), '南');
  assert.equal(getWindDirectionLabel(270), '西');
  assert.equal(getWindDirectionLabel(336), '北北西');
  assert.equal(getWindDirectionLabel(359), '北'); // 360 度に近いときは北へ戻る
  assert.equal(getWindDirectionLabel(360), '北');
});

test('getWeatherLabel は天気コードを日本語にし、知らないコードは「不明」にする', () => {
  assert.equal(getWeatherLabel(0), '快晴');
  assert.equal(getWeatherLabel(63), '雨');
  assert.equal(getWeatherLabel(95), '雷雨');
  assert.equal(getWeatherLabel(1234), '不明');
  assert.equal(getWeatherLabel(undefined), '不明');
});

test('parseWeatherResponse は応答を画面に出す形にする', () => {
  assert.deepEqual(parseWeatherResponse(SAMPLE_BODY), {
    temperature: 13.04,
    windSpeed: 1.21,
    windDirectionDegrees: 336,
    windDirectionLabel: '北北西',
    isCalm: false,
    weatherLabel: '晴れ',
    observedTime: '06:45',
  });
});

test('parseWeatherResponse は風速が小さいとき isCalm を true にする', () => {
  const calm = { current: { ...SAMPLE_BODY.current, wind_speed_10m: 0.1 } };
  assert.equal(parseWeatherResponse(calm).isCalm, true);
});

test('parseWeatherResponse は形が違う・範囲外の値に null を返す', () => {
  assert.equal(parseWeatherResponse(null), null);
  assert.equal(parseWeatherResponse({}), null);
  assert.equal(parseWeatherResponse({ current: { ...SAMPLE_BODY.current, temperature_2m: 999 } }), null);
  assert.equal(parseWeatherResponse({ current: { ...SAMPLE_BODY.current, wind_direction_10m: 'x' } }), null);
  assert.equal(parseWeatherResponse({ current: { ...SAMPLE_BODY.current, wind_speed_10m: -1 } }), null);
});

test('fetchCurrentWeather は丸めた座標で1回だけ問い合わせて結果を返す', async () => {
  const { fetchFn, calls } = createFakeFetch();
  const weather = await fetchCurrentWeather(35.658123, 139.741456, fetchFn);
  assert.equal(weather.weatherLabel, '晴れ');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /latitude=35\.66&longitude=139\.74/);
});

test('fetchCurrentWeather の失敗の文に、緯度・経度を含めない', async () => {
  const failures = [
    createFakeFetch({ ok: false, status: 500 }),
    createFakeFetch({ body: { error: true } }),
    { fetchFn: async () => { throw new TypeError('network 35.658123'); }, calls: [] },
  ];
  for (const { fetchFn } of failures) {
    await assert.rejects(fetchCurrentWeather(35.658123, 139.741456, fetchFn), (error) => !/35\.6|139\.7/.test(error.message));
  }
});
