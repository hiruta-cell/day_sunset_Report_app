/*
 * geocode.js
 * 目的：市区町村名・地名から、候補の地点（名前・緯度・経度）を探す。
 * 使う外部サービス：国土地理院の地名検索 API（https://msearch.gsi.go.jp/address-search/AddressSearch）。
 *   無料・API キー不要。日本国内の地名だけを返す。
 * 使い方：ブラウザでは <script> で読み込むと window.Geocode に入る。Node では require('./geocode.js')。
 * 注意：外部へ送るのは、検索した地名だけ。地名を保存・ログ出力しない。エラーの文に入力の原文を入れない。
 */
(function (root) {
  'use strict';

  // 国土地理院の地名検索 API の URL（?q= の後に地名を付ける）
  const GSI_SEARCH_URL = 'https://msearch.gsi.go.jp/address-search/AddressSearch';

  // 検索する地名の最大の文字数（長すぎる入力を外へ送らないため）
  const MAX_QUERY_LENGTH = 50;

  // 画面に出す候補の最大の件数
  const MAX_RESULTS = 20;

  // 応答を待つ最長の時間（ミリ秒）
  const REQUEST_TIMEOUT_MS = 10000;

  // 行政区画（都道府県・市区町村）の名前とみなす語尾。あれば施設の名前を候補から外すために使う
  const ADMINISTRATIVE_SUFFIX_PATTERN = /[都道府県市区町村郡]$/;

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
   * 国土地理院の応答（GeoJSON の Feature の配列）を、候補の一覧に変える。
   * @param {unknown} features API の応答を JSON として読んだもの
   * @returns {Array<{name: string, latitude: number, longitude: number}>} 候補（最大 MAX_RESULTS 件、同じ名前は1件だけ）。
   *   都道府県・市区町村の名前が1件でもあればそれだけを返し、1件もないときだけ消防署などの施設の名前を返す（API の順のまま）
   * 注意：形が違うもの・日本の範囲外の座標は捨てる。応答が配列でなければ空の配列を返す
   */
  function parseGsiResponse(features) {
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
      places.push({ name, latitude, longitude });
    }
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
   * 地名で候補の地点を探す。
   * @param {string} query 市区町村名などの地名
   * @param {Function} [fetchFn] 通信に使う関数（省略時は fetch。テストでは偽物を渡す）
   * @returns {Promise<Array<{name: string, latitude: number, longitude: number}>>} 候補の一覧（見つからなければ空）
   * 注意：失敗したときは Error を投げる。文には入力の原文を入れない
   */
  async function searchPlaces(query, fetchFn) {
    const normalized = normalizeQuery(query);
    if (normalized === null) {
      throw new Error(`地名を1〜${MAX_QUERY_LENGTH}文字で入力してください`);
    }
    const doFetch = fetchFn || root.fetch.bind(root);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
    try {
      const url = `${GSI_SEARCH_URL}?q=${encodeURIComponent(normalized)}`;
      const response = await doFetch(url, {
        signal: controller ? controller.signal : undefined,
        credentials: 'omit', // クッキーなどを送らない
        referrerPolicy: 'no-referrer', // 開いているページの場所を送らない
      });
      if (!response.ok) {
        throw new Error(`地名の検索に失敗しました（状態 ${response.status}）`);
      }
      return parseGsiResponse(await response.json());
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error('地名の検索が時間内に終わりませんでした。通信の状態を確かめてください');
      }
      if (error && /^地名の検索に失敗/.test(error.message)) throw error;
      throw new Error('地名の検索に失敗しました。通信の状態を確かめてください');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const api = { searchPlaces, parseGsiResponse, normalizeQuery, isInJapan, MAX_QUERY_LENGTH };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Geocode = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
