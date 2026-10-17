/*
 * geocode.test.js
 * 目的：地名検索（src/geocode.js）の入力の確認・応答の読み取り・失敗の扱いを確かめる。
 * 実行：npm test。通信はしない（偽物の fetch を渡す）。地名は公開されている自治体名だけを使う。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { searchPlaces, parseGsiResponse, findPrefectureName, normalizeQuery, normalizePostalCode, buildPostalAddress } = require('../src/geocode.js');

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
  assert.deepEqual(places, [
    { name: '北海道札幌市', shortName: '札幌市', prefecture: '北海道', latitude: 43.062077, longitude: 141.354401 },
  ]);
  assert.deepEqual(parseGsiResponse({ error: 'x' }), []);
});

test('parseGsiResponse は名前が県名で始まるとき、県名を切り分ける（重複して付けない）', () => {
  const point = { coordinates: [139.48, 35.67], type: 'Point' };
  const [place] = parseGsiResponse([{ geometry: point, properties: { title: '東京都府中市', addressCode: '' } }]);
  assert.equal(place.name, '東京都府中市');
  assert.equal(place.prefecture, '東京都');
  assert.equal(place.shortName, '府中市');
});

test('parseGsiResponse は施設の名前に、市区町村コードから県名を付ける（4桁は先頭の 0 が省かれている）', () => {
  const point = { coordinates: [141.35, 43.06], type: 'Point' };
  const features = [
    { geometry: point, properties: { title: '架空市役所', addressCode: '1105' } }, // 01105 → 北海道
    { geometry: point, properties: { title: '架空町役場', addressCode: '47201' } }, // 沖縄県
    { geometry: point, properties: { title: '架空村役場', addressCode: 13206 } }, // 数でも可 → 東京都
    { geometry: point, properties: { title: '架空センター', addressCode: '' } }, // 分からない
  ];
  const places = parseGsiResponse(features);
  assert.deepEqual(
    places.map((place) => [place.name, place.prefecture, place.shortName]),
    [
      ['北海道架空市役所', '北海道', '架空市役所'],
      ['沖縄県架空町役場', '沖縄県', '架空町役場'],
      ['東京都架空村役場', '東京都', '架空村役場'],
      ['架空センター', '', '架空センター'],
    ]
  );
});

test('parseGsiResponse は「東京都」だけの名前を、県名と地名に分けない', () => {
  const point = { coordinates: [139.69, 35.69], type: 'Point' };
  const [place] = parseGsiResponse([{ geometry: point, properties: { title: '東京都' } }]);
  assert.deepEqual([place.name, place.shortName, place.prefecture], ['東京都', '東京都', '']);
});

test('findPrefectureName は範囲外・おかしなコードに空の文字を返す', () => {
  assert.equal(findPrefectureName('架空', '99999'), '');
  assert.equal(findPrefectureName('架空', '00001'), '');
  assert.equal(findPrefectureName('架空', 'abc'), '');
  assert.equal(findPrefectureName('架空', null), '');
  assert.equal(findPrefectureName('京都府京都市', ''), '京都府');
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

// 郵便番号の検索で使う、zipcloud の応答の見本（住所は架空）
const ZIPCLOUD_SAMPLE = {
  status: 200,
  results: [{ zipcode: '0000001', address1: '架空県', address2: '架空市', address3: '架空町' }],
};

/**
 * 郵便番号の検索用の偽物の fetch を作る（zipcloud と国土地理院を、URL で見分けて応答する）。
 * @param {object} options 応答の中身
 * @param {unknown} [options.zip] zipcloud の応答
 * @param {Object<string, unknown>} [options.gsi] 国土地理院の応答（検索した住所 → 応答）
 * @returns {{fetchFn: Function, calls: string[]}} 偽物の fetch と、呼ばれた URL の記録
 */
function createPostalFakeFetch({ zip = ZIPCLOUD_SAMPLE, gsi = {} } = {}) {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (url.startsWith('https://zipcloud.ibsnet.co.jp/')) return { ok: true, status: 200, json: async () => zip };
    const address = decodeURIComponent(new URL(url).searchParams.get('q'));
    return { ok: true, status: 200, json: async () => gsi[address] || [] };
  };
  return { fetchFn, calls };
}

/**
 * 国土地理院の応答の1件を作る。
 * @param {string} title 名前
 * @returns {object} Feature
 */
function gsiFeature(title) {
  return { geometry: { coordinates: [139.75, 35.68], type: 'Point' }, type: 'Feature', properties: { title, addressCode: '' } };
}

test('normalizePostalCode は全角・ハイフン・「〒」・空白をそろえて7桁にし、郵便番号でなければ null にする', () => {
  assert.equal(normalizePostalCode('1000001'), '1000001');
  assert.equal(normalizePostalCode('100-0001'), '1000001');
  assert.equal(normalizePostalCode('〒100-0001'), '1000001');
  assert.equal(normalizePostalCode('〒 １００－０００１'), '1000001');
  assert.equal(normalizePostalCode('100ー0001'), '1000001'); // 長音「ー」をハイフンのつもりで打った場合
  assert.equal(normalizePostalCode('札幌市'), null);
  assert.equal(normalizePostalCode('100-000'), null);
  assert.equal(normalizePostalCode('10000011'), null);
  assert.equal(normalizePostalCode(undefined), null);
});

test('buildPostalAddress は町域の決まり文句とかっこの注記を除く', () => {
  const base = { address1: '架空県', address2: '架空市' };
  assert.deepEqual(buildPostalAddress({ ...base, address3: '架空町' }), { full: '架空県架空市架空町', city: '架空県架空市' });
  assert.deepEqual(buildPostalAddress({ ...base, address3: '以下に掲載がない場合' }), { full: '架空県架空市', city: '架空県架空市' });
  assert.deepEqual(buildPostalAddress({ ...base, address3: '架空通（１〜１９丁目）' }), { full: '架空県架空市架空通', city: '架空県架空市' });
  assert.deepEqual(buildPostalAddress({ ...base, address3: '架空町の次に番地がくる場合' }), { full: '架空県架空市', city: '架空県架空市' });
  assert.equal(buildPostalAddress(null), null);
  assert.equal(buildPostalAddress({ address1: '架空県' }), null);
});

test('searchPlaces は郵便番号なら、zipcloud へ7桁の数字だけを送り、得た住所で国土地理院を探す', async () => {
  const { fetchFn, calls } = createPostalFakeFetch({ gsi: { 架空県架空市架空町: [gsiFeature('架空県架空市架空町')] } });
  const places = await searchPlaces('〒000-0001', fetchFn);
  assert.equal(places.length, 1);
  assert.deepEqual([places[0].name, places[0].prefecture, places[0].shortName], ['架空県架空市架空町', '', '架空県架空市架空町']);
  assert.equal(calls[0], 'https://zipcloud.ibsnet.co.jp/api/search?zipcode=0000001');
  assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => !url.includes('〒') && !url.includes('000-0001')), '入力の原文を送らない');
});

test('searchPlaces は町域で見つからなければ、市区町村の住所で探し直す', async () => {
  const { fetchFn, calls } = createPostalFakeFetch({ gsi: { 架空県架空市: [gsiFeature('架空県架空市')] } });
  const places = await searchPlaces('000-0001', fetchFn);
  assert.deepEqual(places.map((place) => place.name), ['架空県架空市']);
  assert.equal(calls.length, 3); // zipcloud、町域まで、市区町村まで
});

test('searchPlaces は郵便番号が見つからないとき空の配列を返し、zipcloud の失敗は Error にする', async () => {
  assert.deepEqual(await searchPlaces('000-0001', createPostalFakeFetch({ zip: { status: 200, results: null } }).fetchFn), []);
  await assert.rejects(
    searchPlaces('000-0001', createPostalFakeFetch({ zip: { status: 400, results: null, message: '入力値が不正です' } }).fetchFn),
    (error) => /^郵便番号の検索に失敗/.test(error.message) && !error.message.includes('0001')
  );
  const failingFetch = async () => { throw new TypeError('network 000-0001'); };
  await assert.rejects(searchPlaces('000-0001', failingFetch), (error) => /郵便番号の検索に失敗/.test(error.message) && !error.message.includes('0001'));
});

test('地名の検索は、郵便番号の形でなければ zipcloud を使わない', async () => {
  const { fetchFn, calls } = createFakeFetch({ body: SAMPLE_RESPONSE });
  await searchPlaces('札幌市', fetchFn);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].startsWith('https://msearch.gsi.go.jp/'));
});
