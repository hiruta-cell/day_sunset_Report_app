/*
 * app.js
 * 目的：画面の操作をまとめる（地名・郵便番号の検索 → 候補の選択 → 日付の選択 → 日本地図（昼夜の線つき）・結果・天気・太陽の通り道・月の表の表示 → CSV の保存）。
 * 前提：sun-calc.js・geocode.js・report.js・japan-map.js・sun-chart.js・weather.js を先に読み込んでおく
 *   （window.SunCalc・Geocode・SunReport・JapanMap・SunChart・Weather を使う）。
 * 注意：API から来た地名は textContent で表示する（innerHTML は使わない）。入力した地名は保存・ログ出力しない。
 */
(function () {
  'use strict';

  const { Geocode, SunReport, SunCalc, JapanMap, SunChart, Weather } = window;

  // 画面の部品
  const elements = {
    searchForm: document.getElementById('search-form'),
    queryInput: document.getElementById('place-query'),
    searchButton: document.getElementById('search-button'),
    placeResults: document.getElementById('place-results'),
    dateInput: document.getElementById('target-date'),
    prevDayButton: document.getElementById('prev-day-button'),
    nextDayButton: document.getElementById('next-day-button'),
    todayButton: document.getElementById('today-button'),
    statusMessage: document.getElementById('status-message'),
    resultSection: document.getElementById('result-section'),
    japanMap: document.getElementById('japan-map'),
    mapNote: document.getElementById('map-note'),
    mapDaylight: document.getElementById('map-daylight'),
    weatherStatus: document.getElementById('weather-status'),
    weatherGrid: document.getElementById('weather-grid'),
    weatherLabel: document.getElementById('weather-label'),
    weatherTemperature: document.getElementById('weather-temperature'),
    weatherWind: document.getElementById('weather-wind'),
    windArrow: document.getElementById('wind-arrow'),
    windArrowRotation: document.getElementById('wind-arrow-rotation'),
    resultPrefecture: document.getElementById('result-prefecture'),
    resultPlaceName: document.getElementById('result-place-name'),
    resultDate: document.getElementById('result-date'),
    resultCoords: document.getElementById('result-coords'),
    resultSunrise: document.getElementById('result-sunrise'),
    resultNoon: document.getElementById('result-noon'),
    resultSunset: document.getElementById('result-sunset'),
    resultLength: document.getElementById('result-length'),
    resultLengthDelta: document.getElementById('result-length-delta'),
    chartBlock: document.getElementById('chart-block'),
    chartCaption: document.getElementById('chart-caption'),
    sunChart: document.getElementById('sun-chart'),
    monthHeading: document.getElementById('month-heading'),
    monthBody: document.getElementById('month-body'),
    csvButton: document.getElementById('csv-button'),
  };

  // 画面の状態：選んだ地点と、表に出している月の行
  // weatherRequestId は、天気の取得の通し番号（古い取得が新しい地点の表示を上書きしないように使う）
const state = { selectedPlace: null, monthRows: [], monthKey: '', weatherRequestId: 0 };

  // 白夜・極夜のときに表示する説明
  const STATUS_LABELS = { midnightSun: '一日中沈みません（白夜）', polarNight: '一日中昇りません（極夜）' };

  // 地図の下に出す説明
  const MAP_NOTE_ON_MAP = '簡略化した地図です。位置は目安です。';
  const MAP_NOTE_OFF_MAP = 'この地点は、簡略化した地図に載っていない場所です。';

  // 日本全体が昼・夜のときに、地図の下に出す説明
  const DAYLIGHT_ALL_LABELS = { day: '日本全体が昼です。', night: '日本全体が夜です。' };

  // 1日のミリ秒・1時間のミリ秒（日付の計算に使う）
  const MILLISECONDS_PER_HOUR = 3600000;

  /**
   * 状態のメッセージを出す。
   * @param {string} text 出す文（空ならメッセージを消す）
   * @param {boolean} [isError] エラーなら true（赤字にする）
   */
  function showStatus(text, isError) {
    elements.statusMessage.textContent = text;
    elements.statusMessage.classList.toggle('is-error', Boolean(isError));
  }

  /**
   * 日本時間の「いま」を、UTC として読める Date にして返す（getUTC… で日本時間の年月日・時分が取れる）。
   * @returns {Date} 日本時間を UTC の値として持つ Date
   */
  function getNowInJapan() {
    return new Date(Date.now() + SunReport.JST_UTC_OFFSET_HOURS * MILLISECONDS_PER_HOUR);
  }

  /**
   * 年・月・日を、日付の入力欄の形（YYYY-MM-DD）にする。
   * @param {{year: number, month: number, day: number}} date 日付
   * @returns {string} 「2026-06-21」の形
   */
  function formatDateInput(date) {
    return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  }

  /**
   * 今日の日付（日本時間）を「YYYY-MM-DD」で返す。
   * @returns {string} 今日の日付
   */
  function getTodayInJapan() {
    return getNowInJapan().toISOString().slice(0, 10);
  }

  /**
   * 日本時間のいまの時刻を、0時からの分で返す。
   * @returns {number} 0時からの分
   */
  function getNowMinutesInJapan() {
    const now = getNowInJapan();
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }

  /**
   * 日付の入力欄の値（YYYY-MM-DD）を、年・月・日に分ける。
   * @param {string} value 入力欄の値
   * @returns {{year: number, month: number, day: number}|null} 正しくなければ null
   */
  function parseDateInput(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); // 「2026-06-21」の形だけを受け付ける
    if (!match) return null;
    const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
    return SunCalc.isValidDate(date.year, date.month, date.day) ? date : null;
  }

  /**
   * 検索の結果を、選べるボタンの一覧として出す（県名・地名・緯度経度）。
   * @param {Array<{name: string, shortName: string, prefecture: string, latitude: number, longitude: number}>} places 候補の一覧
   */
  function renderPlaceResults(places) {
    elements.placeResults.replaceChildren();
    places.forEach((place) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-pressed', 'false');
      // 県名のない候補でも、3列の並びがずれないよう、県名の欄は空で残す
      const prefecture = document.createElement('span');
      prefecture.className = place.prefecture ? 'badge' : 'badge is-empty';
      prefecture.textContent = place.prefecture;
      const name = document.createElement('span');
      name.className = 'place-name';
      name.textContent = place.shortName;
      const coords = document.createElement('span');
      coords.className = 'place-coords';
      coords.textContent = formatCoordinates(place);
      button.append(prefecture, name, coords);
      button.addEventListener('click', () => selectPlace(place, button));
      item.appendChild(button);
      elements.placeResults.appendChild(item);
    });
  }

  /**
   * 緯度・経度を「北緯35.66° 東経139.74°」の形にする。
   * @param {{latitude: number, longitude: number}} place 地点
   * @returns {string} 表示の文字
   */
  function formatCoordinates(place) {
    return `北緯${place.latitude.toFixed(2)}° 東経${place.longitude.toFixed(2)}°`;
  }

  /**
   * 候補から地点を選び、結果を出し直して、結果のところまで画面を動かす。
   * @param {{name: string, shortName: string, prefecture: string, latitude: number, longitude: number}} place 選んだ地点
   * @param {HTMLButtonElement} button 押されたボタン（選んだ印を付ける）
   */
  function selectPlace(place, button) {
    state.selectedPlace = place;
    state.monthKey = ''; // 地点が変わったので月の表を作り直す
    elements.placeResults.querySelectorAll('button').forEach((other) => other.setAttribute('aria-pressed', 'false'));
    button.setAttribute('aria-pressed', 'true');
    renderResult();
    loadWeather(place);
    if (!elements.resultSection.hidden) elements.resultSection.scrollIntoView({ block: 'start' });
  }

  /**
   * 選んだ地点のいまの天気を取得して、結果の欄に出す。取得できなくても、ほかの表示には影響させない。
   * @param {{latitude: number, longitude: number}} place 選んだ地点
   * 注意：取得中に別の地点が選ばれたときは、古い結果を捨てる（state.weatherRequestId で見分ける）
   */
  async function loadWeather(place) {
    state.weatherRequestId += 1;
    const requestId = state.weatherRequestId;
    elements.weatherGrid.hidden = true;
    elements.weatherStatus.hidden = false;
    elements.weatherStatus.textContent = '天気を取得しています…';
    try {
      const weather = await Weather.fetchCurrentWeather(place.latitude, place.longitude);
      if (requestId !== state.weatherRequestId) return;
      renderWeather(weather);
    } catch (error) {
      if (requestId !== state.weatherRequestId) return;
      elements.weatherStatus.textContent = error.message;
    }
  }

  /**
   * 天気（天気・気温・風向・風速）を結果の欄に出す。
   * @param {{temperature: number, windSpeed: number, windDirectionDegrees: number, windDirectionLabel: string,
   *          isCalm: boolean, weatherLabel: string, observedTime: string}} weather Weather.fetchCurrentWeather の結果
   */
  function renderWeather(weather) {
    elements.weatherLabel.textContent = weather.weatherLabel;
    elements.weatherTemperature.textContent = `${weather.temperature.toFixed(1)}℃`;
    elements.weatherWind.textContent = weather.isCalm
      ? 'ほぼ無風'
      : `${weather.windDirectionLabel} ${weather.windSpeed.toFixed(1)} m/s`;
    // 矢印は風が吹いていく向き。下向きの矢印を、風向（吹いてくる方向）の角度だけ回すと、その向きになる
    elements.windArrowRotation.setAttribute('transform', `rotate(${weather.windDirectionDegrees} 12 12)`);
    elements.windArrow.classList.toggle('is-calm', weather.isCalm);
    elements.weatherGrid.hidden = false;
    const time = weather.observedTime ? `${weather.observedTime} 時点（日本時間）。` : '';
    elements.weatherStatus.textContent = `${time}気象モデルによる値（Open-Meteo）。風向は風が吹いてくる方向です。`;
  }

  /**
   * 日付を1日ずつ動かす。範囲（1901〜2099年）の外には動かさない。
   * @param {number} deltaDays 動かす日数（前の日は -1、次の日は +1）
   */
  function stepDate(deltaDays) {
    const date = parseDateInput(elements.dateInput.value);
    if (!date) return;
    const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + deltaDays));
    const next = { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
    if (!SunCalc.isValidDate(next.year, next.month, next.day)) return;
    elements.dateInput.value = formatDateInput(next);
    renderResult();
  }

  /**
   * 選んだ地点と日付で、日本地図・その日の時刻・太陽の通り道・月の表を出す。地点か日付が足りなければ案内を出す。
   */
  function renderResult() {
    const place = state.selectedPlace;
    const date = parseDateInput(elements.dateInput.value);
    if (!place) {
      showStatus('地名を検索して、候補から地点を選んでください。');
      return;
    }
    if (!date) {
      elements.resultSection.hidden = true;
      showStatus('日付を正しく選んでください（1901〜2099年）。', true);
      return;
    }

    const row = SunReport.buildDayRow(date, place.latitude, place.longitude);
    renderPlaceSummary(place, date, row);
    elements.resultSunrise.textContent = row.sunrise;
    elements.resultNoon.textContent = row.solarNoon;
    elements.resultSunset.textContent = row.sunset;
    elements.resultLength.textContent = row.dayLength;
    elements.resultLengthDelta.textContent = SunReport.getDayLengthChangeText(date, place.latitude, place.longitude);
    renderSunChart(place, date, row);

    // 月が変わったときだけ表を作り直す
    const monthKey = `${date.year}-${date.month}`;
    if (state.monthKey !== monthKey) {
      state.monthRows = SunReport.buildMonthRows(date.year, date.month, place.latitude, place.longitude);
      state.monthKey = monthKey;
      renderMonthTable(state.monthRows);
      elements.monthHeading.textContent = `${date.year}年${date.month}月の一覧`;
    }
    highlightDay(date.day);

    elements.resultSection.hidden = false;
    showStatus(STATUS_LABELS[row.status] || '');
  }

  /**
   * 結果の上の部分（日本地図・県名・地名・日付・緯度経度）を出す。
   * @param {{shortName: string, prefecture: string, latitude: number, longitude: number}} place 選んだ地点
   * @param {{year: number, month: number, day: number}} date 日付
   * @param {{weekday: string}} row buildDayRow の結果
   */
  function renderPlaceSummary(place, date, row) {
    elements.resultPrefecture.textContent = place.prefecture;
    elements.resultPrefecture.hidden = !place.prefecture;
    elements.resultPlaceName.textContent = place.shortName;
    elements.resultDate.textContent = `${date.year}年${date.month}月${date.day}日（${row.weekday}）`;
    elements.resultCoords.textContent = formatCoordinates(place);

    // 地図の昼夜は、選んだ日付に、いまの時計の時刻（日本時間）を合わせた瞬間で示す（今日を選べば、いまの昼夜）
    const now = getNowInJapan();
    const subsolar = SunCalc.getSubsolarPoint(
      Date.UTC(date.year, date.month - 1, date.day, now.getUTCHours() - SunReport.JST_UTC_OFFSET_HOURS, now.getUTCMinutes())
    );
    const isOnMap = JapanMap.render(elements.japanMap, place, subsolar);
    elements.mapNote.textContent = isOnMap ? MAP_NOTE_ON_MAP : MAP_NOTE_OFF_MAP;
    const clock = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
    const moment = formatDateInput(date) === getTodayInJapan() ? `いま（${clock}）` : `${date.month}月${date.day}日の ${clock}`;
    elements.mapDaylight.textContent = `${moment}の昼夜（日本時間）。${DAYLIGHT_ALL_LABELS[JapanMap.describeDaylight(subsolar)] || ''}`;
    elements.japanMap.setAttribute('aria-label', isOnMap ? `日本地図。${place.prefecture}${place.shortName}の位置` : '日本地図');
  }

  /**
   * 太陽の通り道の図を出す。白夜・極夜の日は図を隠す。
   * @param {{latitude: number, longitude: number}} place 選んだ地点
   * @param {{year: number, month: number, day: number}} date 日付
   * @param {{sunrise: string, solarNoon: string, sunset: string, status: string}} row buildDayRow の結果
   */
  function renderSunChart(place, date, row) {
    elements.chartBlock.hidden = row.status !== 'normal';
    if (row.status !== 'normal') return;
    const times = SunCalc.computeSunTimes(date, place.latitude, place.longitude, SunReport.JST_UTC_OFFSET_HOURS);
    const isToday = formatDateInput(date) === getTodayInJapan();
    elements.chartCaption.textContent = isToday ? '今日の太陽の位置（いま）' : '南中のときの太陽の位置';
    SunChart.render(elements.sunChart, {
      sunriseMinutes: times.sunriseMinutes,
      solarNoonMinutes: times.solarNoonMinutes,
      sunsetMinutes: times.sunsetMinutes,
      sunriseText: row.sunrise,
      noonText: row.solarNoon,
      sunsetText: row.sunset,
      nowMinutes: isToday ? getNowMinutesInJapan() : null,
    });
  }

  /**
   * 月の表を出す。日付は、押すとその日の結果に切り替わるボタンにする。
   * @param {Array<object>} rows SunReport.buildMonthRows の結果
   */
  function renderMonthTable(rows) {
    elements.monthBody.replaceChildren();
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.dataset.day = String(row.day);
      const dayCell = document.createElement('td');
      const dayButton = document.createElement('button');
      dayButton.type = 'button';
      dayButton.className = 'day-button';
      dayButton.dataset.day = String(row.day);
      dayButton.textContent = `${row.day}日`;
      dayCell.appendChild(dayButton);
      tr.appendChild(dayCell);
      const cells = [row.weekday, row.sunrise, row.solarNoon, row.sunset, row.dayLength];
      cells.forEach((text, index) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (index === 0 && row.weekday === '日') td.className = 'weekday-sun';
        if (index === 0 && row.weekday === '土') td.className = 'weekday-sat';
        tr.appendChild(td);
      });
      elements.monthBody.appendChild(tr);
    }
  }

  /**
   * 月の表で、選んだ日の行に印を付け、表の中でその行が見えるところまで動かす。
   * @param {number} day 日（1〜31）
   */
  function highlightDay(day) {
    let selectedRow = null;
    elements.monthBody.querySelectorAll('tr').forEach((tr) => {
      const isSelected = tr.dataset.day === String(day);
      tr.classList.toggle('is-selected', isSelected);
      if (isSelected) selectedRow = tr;
    });
    const wrap = elements.monthBody.closest('.table-wrap');
    // 結果が隠れているうちは大きさが 0 なので、表を動かすのは見えているときだけ
    if (selectedRow && wrap && wrap.clientHeight > 0) {
      wrap.scrollTop = Math.max(0, selectedRow.offsetTop - wrap.clientHeight / 2);
    }
  }

  /**
   * 月の表の日付のボタンが押されたとき、その日の結果に切り替える。
   * @param {MouseEvent} event クリック
   */
  function handleMonthBodyClick(event) {
    const button = event.target.closest('button[data-day]');
    const date = parseDateInput(elements.dateInput.value);
    if (!button || !date) return;
    elements.dateInput.value = formatDateInput({ year: date.year, month: date.month, day: Number(button.dataset.day) });
    renderResult();
  }

  /**
   * 地名を検索して候補を出す（フォームの送信で呼ばれる）。
   * @param {SubmitEvent} event フォームの送信
   */
  async function handleSearchSubmit(event) {
    event.preventDefault();
    const query = Geocode.normalizeQuery(elements.queryInput.value);
    if (query === null) {
      showStatus(`地名を1〜${Geocode.MAX_QUERY_LENGTH}文字で入力してください。`, true);
      return;
    }
    elements.searchButton.disabled = true;
    showStatus('検索しています…');
    try {
      const places = await Geocode.searchPlaces(query);
      renderPlaceResults(places);
      if (places.length === 0) {
        showStatus('地点が見つかりませんでした。市区町村名などで検索し直してください。', true);
      } else {
        showStatus(`${places.length}件の候補が見つかりました。地点を選んでください。`);
      }
    } catch (error) {
      renderPlaceResults([]);
      showStatus(error.message, true);
    } finally {
      elements.searchButton.disabled = false;
    }
  }

  /**
   * 表に出している月の一覧を CSV のファイルとして保存させる。
   */
  function handleCsvClick() {
    if (!state.selectedPlace || state.monthRows.length === 0) return;
    const csv = SunReport.toCsv(state.monthRows, state.selectedPlace);
    // 先頭の \uFEFF（BOM）は、Excel で開いたときに文字化けさせないための印
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const [year, month] = state.monthKey.split('-');
    link.href = url;
    link.download = `sun-times-${year}-${month.padStart(2, '0')}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  elements.dateInput.value = getTodayInJapan();
  elements.searchForm.addEventListener('submit', handleSearchSubmit);
  elements.dateInput.addEventListener('change', renderResult);
  elements.prevDayButton.addEventListener('click', () => stepDate(-1));
  elements.nextDayButton.addEventListener('click', () => stepDate(1));
  elements.todayButton.addEventListener('click', () => {
    elements.dateInput.value = getTodayInJapan();
    renderResult();
  });
  elements.monthBody.addEventListener('click', handleMonthBodyClick);
  elements.csvButton.addEventListener('click', handleCsvClick);
  showStatus('地名を検索して、候補から地点を選んでください。');
})();
