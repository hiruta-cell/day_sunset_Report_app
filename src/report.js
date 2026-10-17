/*
 * report.js
 * 目的：日の出・日の入りの計算結果を、画面と CSV に出す形（時刻の文字・月の表）に整える。
 * 使い方：ブラウザでは sun-calc.js の後に <script> で読み込むと window.SunReport に入る。Node では require('./report.js')。
 * 注意：通信はしない。
 */
(function (root) {
  'use strict';

  const SunCalc = typeof module !== 'undefined' && module.exports ? require('./sun-calc.js') : root.SunCalc;

  // 日本の時刻の、世界時との時差（時間）。日本には夏時間がないので常に 9
  const JST_UTC_OFFSET_HOURS = 9;

  // 曜日の表示（Date の getUTCDay() の 0＝日曜 から順）
  const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

  // CSV の見出し
  const CSV_HEADERS = ['日付', '曜日', '日の出', '南中', '日の入り', '昼の長さ'];

  // 表計算ソフトで数式とみなされる先頭の文字（CSV に書くとき、先頭に ' を付けて文字として扱わせる）
  const FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;

  /**
   * 0時からの分を「HH:MM」の文字にする（秒は四捨五入）。
   * @param {number|null} minutes 0時からの分（小数あり）
   * @returns {string} 「04:25」の形。null のときは「--:--」
   * 注意：前日・翌日にはみ出した値（0未満・24時以降）は 24 時間で折り返す
   */
  function formatTime(minutes) {
    if (minutes === null || !Number.isFinite(minutes)) return '--:--';
    const rounded = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
  }

  /**
   * 長さ（分）を「14時間35分」の文字にする（秒は四捨五入）。
   * @param {number} minutes 長さ（分）
   * @returns {string} 「14時間35分」の形
   */
  function formatDuration(minutes) {
    const rounded = Math.max(0, Math.round(minutes));
    return `${Math.floor(rounded / 60)}時間${String(rounded % 60).padStart(2, '0')}分`;
  }

  /**
   * 1日分の計算結果を、表の1行の形にする。
   * @param {{year: number, month: number, day: number}} date 日付
   * @param {number} latitude 緯度（度）
   * @param {number} longitude 経度（度）
   * @returns {{dateText: string, weekday: string, day: number, sunrise: string, solarNoon: string,
   *            sunset: string, dayLength: string, status: string}} 表の1行
   */
  function buildDayRow(date, latitude, longitude) {
    const times = SunCalc.computeSunTimes(date, latitude, longitude, JST_UTC_OFFSET_HOURS);
    const weekdayIndex = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    return {
      dateText: `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`,
      weekday: WEEKDAY_LABELS[weekdayIndex],
      day: date.day,
      sunrise: formatTime(times.sunriseMinutes),
      solarNoon: formatTime(times.solarNoonMinutes),
      sunset: formatTime(times.sunsetMinutes),
      dayLength: formatDuration(times.dayLengthMinutes),
      status: times.status,
    };
  }

  /**
   * 1か月分の表（毎日の行）を作る。
   * @param {number} year 年
   * @param {number} month 月（1〜12）
   * @param {number} latitude 緯度（度）
   * @param {number} longitude 経度（度）
   * @returns {Array<object>} buildDayRow の行の配列（その月の日数分）
   */
  function buildMonthRows(year, month, latitude, longitude) {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const rows = [];
    for (let day = 1; day <= daysInMonth; day++) {
      rows.push(buildDayRow({ year, month, day }, latitude, longitude));
    }
    return rows;
  }

  /**
   * CSV の1つの欄の値を、安全な形にする（引用符で囲み、数式とみなされないようにする）。
   * @param {string|number} value 欄の値
   * @returns {string} 「"…"」で囲んだ文字
   */
  function escapeCsvCell(value) {
    let text = String(value);
    if (FORMULA_PREFIX_PATTERN.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  /**
   * 月の表を CSV の文字にする。
   * @param {Array<object>} rows buildMonthRows の結果
   * @param {{name: string, latitude: number, longitude: number}} place 地点
   * @returns {string} CSV の文字（改行は CRLF。先頭の2行に地点と注記を書く）
   * 注意：Excel で文字化けしないよう、保存するときに先頭へ BOM を付ける（app.js 側）
   */
  function toCsv(rows, place) {
    const lines = [
      [escapeCsvCell('地点'), escapeCsvCell(place.name), escapeCsvCell(`緯度 ${place.latitude.toFixed(4)}`), escapeCsvCell(`経度 ${place.longitude.toFixed(4)}`)].join(','),
      [escapeCsvCell('注記'), escapeCsvCell('時刻は日本時間。計算値（標高・地形は考えない）。')].join(','),
      CSV_HEADERS.map(escapeCsvCell).join(','),
    ];
    for (const row of rows) {
      lines.push([row.dateText, row.weekday, row.sunrise, row.solarNoon, row.sunset, row.dayLength].map(escapeCsvCell).join(','));
    }
    return `${lines.join('\r\n')}\r\n`;
  }

  const api = { formatTime, formatDuration, buildDayRow, buildMonthRows, toCsv, escapeCsvCell, JST_UTC_OFFSET_HOURS };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SunReport = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
