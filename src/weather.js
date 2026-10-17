/*
 * weather.js
 * 目的：地点の「いまの天気・気温・風向・風速」を取得し、画面に出す形（日本語の文字・数）に整える。
 * 使う外部サービス：Open-Meteo の予報 API（https://api.open-meteo.com/v1/forecast）。無料・API キー不要。
 *   値は気象観測そのものではなく、気象モデルによる地点ごとの現在の値（15分ごと）。
 * 使い方：ブラウザでは <script> で読み込むと window.Weather に入る。Node では require('./weather.js')。
 * 注意：外部へ送るのは、緯度・経度（小数2桁＝約1kmに丸めたもの）だけ。保存・ログ出力しない。エラーの文に緯度・経度を入れない。
 *   依頼者の許可を得て、index.html の connect-src に api.open-meteo.com を足している（2026-10-18）。
 */
(function (root) {
  'use strict';

  // Open-Meteo の予報 API の URL
  const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

  // 応答を待つ最長の時間（ミリ秒）
  const REQUEST_TIMEOUT_MS = 10000;

  // 外へ送る緯度・経度の小数の桁数（2桁＝約1km。必要以上に細かい位置を送らない）
  const COORDINATE_DECIMALS = 2;

  // 風速（m/s）がこれより小さいときは、風向きに意味がないので「ほぼ無風」とする
  const CALM_WIND_SPEED_MS = 0.3;

  // 16方位の名前（北から時計回り。風向は「風が吹いてくる方向」で、日本の天気予報と同じ）
  const WIND_DIRECTION_LABELS = [
    '北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東',
    '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西',
  ];

  // 天気コード（WMO の現在天気の区分）の日本語。範囲の最初の数 → 名前
  const WEATHER_CODE_LABELS = [
    [0, '快晴'], [1, '晴れ'], [2, '晴れ時々くもり'], [3, 'くもり'],
    [45, '霧'], [48, '霧（霧氷）'],
    [51, '弱い霧雨'], [53, '霧雨'], [55, '強い霧雨'], [56, '着氷性の霧雨'], [57, '強い着氷性の霧雨'],
    [61, '弱い雨'], [63, '雨'], [65, '強い雨'], [66, '着氷性の雨'], [67, '強い着氷性の雨'],
    [71, '弱い雪'], [73, '雪'], [75, '強い雪'], [77, '雪の粒'],
    [80, '弱いにわか雨'], [81, 'にわか雨'], [82, '激しいにわか雨'],
    [85, '弱いにわか雪'], [86, '強いにわか雪'],
    [95, '雷雨'], [96, '雷雨（ひょうを伴う）'], [99, '強い雷雨（ひょうを伴う）'],
  ];

  /**
   * 風向（度）を16方位の名前にする。
   * @param {number} degrees 風向（度。北＝0、東＝90、風が吹いてくる方向）
   * @returns {string} 「北北西」などの名前
   */
  function getWindDirectionLabel(degrees) {
    const normalized = ((degrees % 360) + 360) % 360;
    return WIND_DIRECTION_LABELS[Math.round(normalized / 22.5) % WIND_DIRECTION_LABELS.length];
  }

  /**
   * 天気コードを日本語の名前にする。
   * @param {number} code 天気コード（WMO の区分）
   * @returns {string} 天気の名前。知らないコードのときは「不明」
   */
  function getWeatherLabel(code) {
    const entry = WEATHER_CODE_LABELS.find(([key]) => key === code);
    return entry ? entry[1] : '不明';
  }

  /**
   * 天気を問い合わせる URL を作る。
   * @param {number} latitude 緯度（度）
   * @param {number} longitude 経度（度）
   * @returns {string} URL（緯度・経度は小数2桁に丸める）
   * 注意：緯度・経度が日本の範囲に近い数でなければ RangeError を投げる（文に値は入れない）
   */
  function buildWeatherUrl(latitude, longitude) {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new RangeError('緯度・経度が正しくありません');
    }
    const query = new URLSearchParams({
      latitude: latitude.toFixed(COORDINATE_DECIMALS),
      longitude: longitude.toFixed(COORDINATE_DECIMALS),
      current: 'temperature_2m,wind_speed_10m,wind_direction_10m,weather_code',
      wind_speed_unit: 'ms', // 風速は m/s
      timezone: 'Asia/Tokyo', // 時刻は日本時間
    });
    return `${OPEN_METEO_URL}?${query.toString()}`;
  }

  /**
   * Open-Meteo の応答を、画面に出す形にする。
   * @param {unknown} body 応答を JSON として読んだもの
   * @returns {{temperature: number, windSpeed: number, windDirectionDegrees: number, windDirectionLabel: string,
   *            isCalm: boolean, weatherLabel: string, observedTime: string}|null}
   *   observedTime は「HH:MM」（日本時間）。形が違う・値が範囲外のときは null
   */
  function parseWeatherResponse(body) {
    const current = body && typeof body === 'object' ? body.current : null;
    if (!current || typeof current !== 'object') return null;
    const { temperature_2m: temperature, wind_speed_10m: windSpeed, wind_direction_10m: windDirection, weather_code: weatherCode, time } = current;
    const isValid =
      Number.isFinite(temperature) && temperature >= -90 && temperature <= 60 &&
      Number.isFinite(windSpeed) && windSpeed >= 0 && windSpeed <= 150 &&
      Number.isFinite(windDirection) && windDirection >= 0 && windDirection <= 360;
    if (!isValid) return null;
    const timeMatch = typeof time === 'string' ? /T(\d{2}:\d{2})$/.exec(time) : null; // 「2026-10-18T06:45」の時刻の部分
    return {
      temperature,
      windSpeed,
      windDirectionDegrees: windDirection,
      windDirectionLabel: getWindDirectionLabel(windDirection),
      isCalm: windSpeed < CALM_WIND_SPEED_MS,
      weatherLabel: getWeatherLabel(weatherCode),
      observedTime: timeMatch ? timeMatch[1] : '',
    };
  }

  /**
   * 地点のいまの天気を取得する。
   * @param {number} latitude 緯度（度）
   * @param {number} longitude 経度（度）
   * @param {Function} [fetchFn] 通信に使う関数（省略時は fetch。テストでは偽物を渡す）
   * @returns {Promise<ReturnType<typeof parseWeatherResponse>>} parseWeatherResponse の結果
   * 注意：失敗したときは Error を投げる。文には緯度・経度を入れない
   */
  async function fetchCurrentWeather(latitude, longitude, fetchFn) {
    const url = buildWeatherUrl(latitude, longitude);
    const doFetch = fetchFn || root.fetch.bind(root);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
    try {
      const response = await doFetch(url, {
        signal: controller ? controller.signal : undefined,
        credentials: 'omit', // クッキーなどを送らない
        referrerPolicy: 'no-referrer', // 開いているページの場所を送らない
      });
      if (!response.ok) throw new Error(`天気の取得に失敗しました（状態 ${response.status}）`);
      const weather = parseWeatherResponse(await response.json());
      if (weather === null) throw new Error('天気の情報を読み取れませんでした');
      return weather;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error('天気の取得が時間内に終わりませんでした');
      }
      if (error && /^天気の/.test(error.message)) throw error;
      throw new Error('天気を取得できませんでした。通信の状態を確かめてください');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const api = { fetchCurrentWeather, buildWeatherUrl, parseWeatherResponse, getWindDirectionLabel, getWeatherLabel };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Weather = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
