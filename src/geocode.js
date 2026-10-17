/*
 * geocode.js
 * 目的：市区町村名・地名から、候補の地点（名前・緯度・経度）を探す。
 * 使う外部サービス：
 *   ・国土地理院の地名検索 API（https://msearch.gsi.go.jp/address-search/AddressSearch）。無料・API キー不要。日本国内の地名だけを返す。
 *   ・郵便番号の検索には、郵便番号から住所を調べる zipcloud（https://zipcloud.ibsnet.co.jp/api/search）も使う。無料・API キー不要。
 *     住所を得たあと、国土地理院で座標にする。依頼者の許可を得て、index.html の connect-src に足している（2026-10-18）。
 * 使い方：ブラウザでは <script> で読み込むと window.Geocode に入る。Node では require('./geocode.js')。
 * 注意：外部へ送るのは、検索した地名（郵便番号のときは7桁の数字）だけ。保存・ログ出力しない。エラーの文に入力の原文を入れない。
 */
(function (root) {
  'use strict';

  // 国土地理院の地名検索 API の URL（?q= の後に地名を付ける）
  const GSI_SEARCH_URL = 'https://msearch.gsi.go.jp/address-search/AddressSearch';

  // 郵便番号から住所を調べるサービス（zipcloud）の URL（?zipcode= の後に7桁の数字を付ける）
  const ZIPCLOUD_URL = 'https://zipcloud.ibsnet.co.jp/api/search';

  // 1つの郵便番号から調べる住所の最大の数（1つの番号が複数の町域に当たることがある）
  const MAX_POSTAL_ADDRESSES = 5;

  // 郵便番号の町域の欄にある、町域の名前ではない決まり文句。住所に含めない
  const POSTAL_TOWN_PLACEHOLDER_PATTERN = /以下に掲載がない場合|の次に番地がくる場合|一円/;

  // 郵便番号の町域の欄にある、かっこの中の注記（「（１〜１９丁目）」など）。住所に含めない
  const POSTAL_TOWN_NOTE_PATTERN = /[（(][^）)]*[）)]/g;

  // 検索する地名の最大の文字数（長すぎる入力を外へ送らないため）
  const MAX_QUERY_LENGTH = 50;

  // 画面に出す候補の最大の件数
  const MAX_RESULTS = 20;

  // 応答を待つ最長の時間（ミリ秒）
  const REQUEST_TIMEOUT_MS = 10000;

  // 行政区画（都道府県・市区町村）の名前とみなす語尾。あれば施設の名前を候補から外すために使う
  const ADMINISTRATIVE_SUFFIX_PATTERN = /[都道府県市区町村郡]$/;

  // 都道府県の名前（市区町村コードの上2桁の 01〜47 の順）。候補の名前を「県名」と「地名」に分けたり、県名を補ったりするのに使う
  const PREFECTURE_NAMES = [
    '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県',
    '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
    '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
    '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県',
    '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
  ];

  // 国土地理院の市区町村コード（addressCode）の形。4桁のものは、北海道など上2桁が 0 で始まるコードの先頭の 0 が省かれている
  const ADDRESS_CODE_PATTERN = /^\d{4,5}$/;

  // 日本の範囲とみなす緯度・経度（沖ノ鳥島〜択捉島、与那国島〜南鳥島を含む大まかな四角）
  const JAPAN_BOUNDS = { minLatitude: 20, maxLatitude: 46, minLongitude: 122, maxLongitude: 154 };

  /**
   * 検索する地名を整える（前後の空白を取る）。空・長すぎるときは null を返す。
   * @param {string} query 入力された地名
   * @returns {string|null} 整えた地名。使えないときは null
   */
  function normalizeQuery(query) {
    if (typeof query !== 'string') return null;
    const trimmed = query.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_QUERY_LENGTH) return null;
    return trimmed;
  }

  /**
   * 候補の名前や市区町村コードから、都道府県の名前を求める。
   * @param {string} title 候補の名前（「北海道札幌市」のように県名で始まるものがある）
   * @param {unknown} addressCode 国土地理院の市区町村コード（施設の名前には付く。文字でも数でもよい）
   * @returns {string} 都道府県の名前。分からなければ空の文字
   */
  function findPrefectureName(title, addressCode) {
    const fromTitle = PREFECTURE_NAMES.find((prefecture) => title.startsWith(prefecture));
    if (fromTitle) return fromTitle;
    const code = addressCode === null || addressCode === undefined ? '' : String(addressCode);
    if (!ADDRESS_CODE_PATTERN.test(code)) return '';
    return PREFECTURE_NAMES[Number(code.padStart(5, '0').slice(0, 2)) - 1] || '';
  }

  /**
   * 国土地理院の応答（GeoJSON の Feature の配列）を、候補の一覧に変える（絞り込みや件数の制限はしない）。
   * @param {unknown} features API の応答を JSON として読んだもの
   * @returns {Array<{name: string, shortName: string, prefecture: string, latitude: number, longitude: number}>}
   *   候補（同じ名前は1件だけ、API の順のまま）。name は県名を付けた名前（「北海道札幌市」）、
   *   shortName は県名を除いた名前（「札幌市」）、prefecture は県名（分からなければ空）
   * 注意：形が違うもの・日本の範囲外の座標は捨てる。応答が配列でなければ空の配列を返す
   */
  function parseGsiFeatures(features) {
    if (!Array.isArray(features)) return [];
    const places = [];
    const seenNames = new Set();
    for (const feature of features) {
      const coordinates = feature && feature.geometry && feature.geometry.coordinates;
      const name = feature && feature.properties && feature.properties.title;
      if (!Array.isArray(coordinates) || typeof name !== 'string' || name.length === 0) continue;
      // GeoJSON の座標は [経度, 緯度] の順
      const longitude = Number(coordinates[0]);
      const latitude = Number(coordinates[1]);
      if (!isInJapan(latitude, longitude) || seenNames.has(name)) continue;
      seenNames.add(name);
      let prefecture = findPrefectureName(name, feature.properties.addressCode);
      let shortName = name.startsWith(prefecture) ? name.slice(prefecture.length) : name;
      // 「東京都」だけの名前など、県名を除くと何も残らないときは、県名を分けずに名前のまま使う
      if (shortName.length === 0) {
        prefecture = '';
        shortName = name;
      }
      places.push({ name: prefecture + shortName, shortName, prefecture, latitude, longitude });
    }
    return places;
  }

  /**
   * 国土地理院の応答を、画面に出す候補の一覧に変える。
   * @param {unknown} features API の応答を JSON として読んだもの
   * @returns {Array<{name: string, shortName: string, prefecture: string, latitude: number, longitude: number}>}
   *   parseGsiFeatures の結果から、最大 MAX_RESULTS 件。
   *   都道府県・市区町村の名前が1件でもあればそれだけを返し、1件もないときだけ消防署などの施設の名前を返す（API の順のまま）
   */
  function parseGsiResponse(features) {
    const places = parseGsiFeatures(features);
    const administrative = places.filter((place) => ADMINISTRATIVE_SUFFIX_PATTERN.test(place.name));
    return (administrative.length > 0 ? administrative : places).slice(0, MAX_RESULTS);
  }

  /**
   * 緯度・経度が日本の範囲（JAPAN_BOUNDS）に入っているか確かめる。
   * @param {number} latitude 緯度（度）
   * @param {number} longitude 経度（度）
   * @returns {boolean} 範囲内なら true
   */
  function isInJapan(latitude, longitude) {
    return (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= JAPAN_BOUNDS.minLatitude &&
      latitude <= JAPAN_BOUNDS.maxLatitude &&
      longitude >= JAPAN_BOUNDS.minLongitude &&
      longitude <= JAPAN_BOUNDS.maxLongitude
    );
  }

  /**
   * 郵便番号らしい入力を、7桁の数字にそろえる（全角・ハイフン・「〒」・空白に対応）。
   * @param {unknown} query 入力された文字
   * @returns {string|null} 7桁の数字（「1000001」）。郵便番号の形でなければ null
   */
  function normalizePostalCode(query) {
    if (typeof query !== 'string') return null;
    // 全角の数字・ハイフンを半角にし、長音「ー」などのハイフンに似た文字を「-」にそろえる
    const text = query.normalize('NFKC').replace(/[〒\s]/g, '').replace(/[ー−‐‑–—]/g, '-');
    const match = /^(\d{3})-?(\d{4})$/.exec(text);
    return match ? `${match[1]}${match[2]}` : null;
  }

  /**
   * 通信して JSON を受け取る（時間の上限つき。クッキー・参照元は送らない）。
   * @param {string} url 問い合わせ先
   * @param {Function} doFetch 通信に使う関数
   * @param {string} label 失敗の文の先頭に使う名前（「地名の検索」「郵便番号の検索」）
   * @returns {Promise<unknown>} 応答を JSON として読んだもの
   * 注意：失敗の文に入力の原文・URL を入れない
   */
  async function requestJson(url, doFetch, label) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
    try {
      const response = await doFetch(url, {
        signal: controller ? controller.signal : undefined,
        credentials: 'omit', // クッキーなどを送らない
        referrerPolicy: 'no-referrer', // 開いているページの場所を送らない
      });
      if (!response.ok) {
        throw new Error(`${label}に失敗しました（状態 ${response.status}）`);
      }
      return await response.json();
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error(`${label}が時間内に終わりませんでした。通信の状態を確かめてください`);
      }
      if (error && error.message && error.message.startsWith(`${label}に失敗`)) throw error;
      throw new Error(`${label}に失敗しました。通信の状態を確かめてください`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * zipcloud の1件の結果から、国土地理院で探す住所の文字を作る。
   * @param {unknown} item zipcloud の results の1件（address1＝都道府県・address2＝市区町村・address3＝町域）
   * @returns {{full: string, city: string}|null} full は町域まで、city は市区町村まで。形が違えば null
   */
  function buildPostalAddress(item) {
    if (!item || typeof item.address1 !== 'string' || typeof item.address2 !== 'string') return null;
    const town = typeof item.address3 === 'string' && !POSTAL_TOWN_PLACEHOLDER_PATTERN.test(item.address3)
      ? item.address3.replace(POSTAL_TOWN_NOTE_PATTERN, '')
      : '';
    const city = `${item.address1}${item.address2}`;
    return city.length === 0 ? null : { full: `${city}${town}`, city };
  }

  /**
   * 住所の文字を国土地理院で探し、一番合う1件を返す（名前が住所と同じものを優先）。
   * @param {string} address 住所（「東京都千代田区千代田」など）
   * @param {Function} doFetch 通信に使う関数
   * @returns {Promise<{name: string, shortName: string, prefecture: string, latitude: number, longitude: number}|null>} 見つからなければ null
   */
  async function findPlaceByAddress(address, doFetch) {
    const places = parseGsiFeatures(await requestJson(`${GSI_SEARCH_URL}?q=${encodeURIComponent(address)}`, doFetch, '地名の検索'));
    return places.find((place) => place.name === address) || places[0] || null;
  }

  /**
   * 郵便番号で候補の地点を探す（zipcloud で住所にし、国土地理院で座標にする）。
   * @param {string} postalCode 7桁の数字（normalizePostalCode の結果）
   * @param {Function} doFetch 通信に使う関数
   * @returns {Promise<Array<{name: string, shortName: string, prefecture: string, latitude: number, longitude: number}>>}
   *   候補（最大 MAX_POSTAL_ADDRESSES 件）。見つからなければ空
   */
  async function searchByPostalCode(postalCode, doFetch) {
    const body = await requestJson(`${ZIPCLOUD_URL}?zipcode=${postalCode}`, doFetch, '郵便番号の検索');
    if (!body || body.status !== 200) {
      throw new Error('郵便番号の検索に失敗しました');
    }
    const results = Array.isArray(body.results) ? body.results : [];
    const addresses = results.map(buildPostalAddress).filter(Boolean).slice(0, MAX_POSTAL_ADDRESSES);
    const places = [];
    const seenNames = new Set();
    for (const address of addresses) {
      // 町域まで書いた住所で見つからなければ、市区町村までの住所で探す
      const place = (await findPlaceByAddress(address.full, doFetch)) || (await findPlaceByAddress(address.city, doFetch));
      if (place && !seenNames.has(place.name)) {
        seenNames.add(place.name);
        places.push(place);
      }
    }
    return places;
  }

  /**
   * 地名または郵便番号で、候補の地点を探す。
   * @param {string} query 市区町村名などの地名、または郵便番号（「100-0001」「1000001」など）
   * @param {Function} [fetchFn] 通信に使う関数（省略時は fetch。テストでは偽物を渡す）
   * @returns {Promise<Array<{name: string, shortName: string, prefecture: string, latitude: number, longitude: number}>>} 候補の一覧（見つからなければ空）
   * 注意：失敗したときは Error を投げる。文には入力の原文を入れない
   */
  async function searchPlaces(query, fetchFn) {
    const normalized = normalizeQuery(query);
    if (normalized === null) {
      throw new Error(`地名を1〜${MAX_QUERY_LENGTH}文字で入力してください`);
    }
    const doFetch = fetchFn || root.fetch.bind(root);
    const postalCode = normalizePostalCode(normalized);
    if (postalCode !== null) {
      return searchByPostalCode(postalCode, doFetch);
    }
    return parseGsiResponse(await requestJson(`${GSI_SEARCH_URL}?q=${encodeURIComponent(normalized)}`, doFetch, '地名の検索'));
  }

  const api = {
    searchPlaces,
    parseGsiResponse,
    parseGsiFeatures,
    findPrefectureName,
    normalizeQuery,
    normalizePostalCode,
    buildPostalAddress,
    isInJapan,
    MAX_QUERY_LENGTH,
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Geocode = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
