/*
 * geocode.test.js
 * 目的：地名検索（src/geocode.js）の入力の確認・応答の読み取り・失敗の扱いを確かめる。
 * 実行：npm test。通信はしない（偽物の fetch を渡す）。地名は公開されている自治体名だけを使う。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { searchPlaces, parseGsiResponse, normalizeQuery } = require('../src/geocode.js');

// 国土地理院の応答と同じ形の見本（座標は [経度, 緯度]）
const SAMPLE_RESPONSE = [
  { geometry: { coordinates: [141.354401, 43.062077], type: 'Point' }, type: 'Feature', properties: { title: '北海道札幌市' } },
  { geometry: { coordinates: [141.354401, 43.062077], type: 'Point' }, type: 'Feature', properties: { title: '北海道札幌市' } },
  { geometry: { coordinates: [0, 0], type: 'Point' }, type: 'Feature', properties: { title: '範囲外の地点' } },
  { geometry: null, type: 'Feature', properties: { title: '座標のない地点' } },
];

/**
 * 決まった応答を返す偽物の fetch を作る。
 * @param {object} options 応答の中身
 * @param {boolean} [options.ok] 成功なら true
 * @param {number} [options.status] HTTP の状態
 * @param {unknown} [options.body] 返す JSON
 * @returns {{fetchFn: Function, calls: string[]}} 偽物の fetch と、呼ばれた URL の記録
 */
function createFakeFetch({ ok = true, status = 200, body = [] } = {}) {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    return { ok, status, json: async () => body };
  };
  return { fetchFn, calls };
}

test('normalizeQuery は空白を取り、空・長すぎる入力を null にする', () => {
  assert.equal(normalizeQuery('  札幌市 '), '札幌市');
  assert.equal(normalizeQuery('   '), null);
  assert.equal(normalizeQuery('あ'.repeat(51)), null);
  assert.equal(normalizeQuery(undefined), null);
});

test('parseGsiResponse は緯度・経度の順を直し、重複・範囲外・壊れた行を捨てる', () => {
  const places = parseGsiResponse(SAMPLE_RESPONSE);
  assert.deepEqual(places, [{ name: '北海道札幌市', latitude: 43.062077, longitude: 141.354401 }]);
  assert.deepEqual(parseGsiResponse({ error: 'x' }), []);
});

test('parseGsiResponse は市区町村の名前があれば、施設の名前を外す', () => {
  const point = { coordinates: [141.35, 43.06], type: 'Point' };
  const features = [
    { geometry: point, properties: { title: '架空市中央消防署' } },
    { geometry: point, properties: { title: '北海道架空市' } },
    { geometry: point, properties: { title: '架空市南区' } },
  ];
  assert.deepEqual(parseGsiResponse(features).map((place) => place.name), ['北海道架空市', '架空市南区']);
  // 31 件目にあっても、市区町村の名前は拾う
  const many = Array.from({ length: 30 }, (_, index) => ({ geometry: point, properties: { title: `施設${index}` } }));
  many.push({ geometry: point, properties: { title: '架空町' } });
  assert.deepEqual(parseGsiResponse(many).map((place) => place.name), ['架空町']);
});

test('parseGsiResponse は市区町村の名前がなければ、施設の名前を最大 20 件返す', () => {
  const point = { coordinates: [139.75, 35.66], type: 'Point' };
  const many = Array.from({ length: 30 }, (_, index) => ({ geometry: point, properties: { title: `架空タワー${index}` } }));
  const places = parseGsiResponse(many);
  assert.equal(places.length, 20);
  assert.equal(places[0].name, '架空タワー0');
});

test('searchPlaces は地名を URL エンコードして送り、候補を返す', async () => {
  const { fetchFn, calls } = createFakeFetch({ body: SAMPLE_RESPONSE });
  const places = await searchPlaces(' 札幌市 ', fetchFn);
  assert.equal(places.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent('札幌市')}`);
});

test('searchPlaces は空の入力では通信せずに Error を投げる', async () => {
  const { fetchFn, calls } = createFakeFetch();
  await assert.rejects(() => searchPlaces('', fetchFn), /1〜50文字/);
  assert.equal(calls.length, 0);
});

test('searchPlaces の失敗の文に、入力した地名を含めない', async () => {
  const { fetchFn } = createFakeFetch({ ok: false, status: 500 });
  await assert.rejects(() => searchPlaces('架空町', fetchFn), (error) => {
    assert.match(error.message, /状態 500/);
    assert.equal(error.message.includes('架空町'), false);
    return true;
  });
  const failingFetch = async () => { throw new TypeError('Failed to fetch 架空町'); };
  await assert.rejects(() => searchPlaces('架空町', failingFetch), (error) => {
    assert.equal(error.message.includes('架空町'), false);
    return true;
  });
});
