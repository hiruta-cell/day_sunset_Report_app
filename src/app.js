/*
 * app.js
 * 目的：画面の操作をまとめる（地名の検索 → 候補の選択 → 日付の選択 → 結果と月の表の表示 → CSV の保存）。
 * 前提：sun-calc.js・geocode.js・report.js を先に読み込んでおく（window.SunCalc・Geocode・SunReport を使う）。
 * 注意：API から来た地名は textContent で表示する（innerHTML は使わない）。入力した地名は保存・ログ出力しない。
 */
(function () {
  'use strict';

  const { Geocode, SunReport } = window;

  // 画面の部品
  const elements = {
    searchForm: document.getElementById('search-form'),
    queryInput: document.getElementById('place-query'),
    searchButton: document.getElementById('search-button'),
    placeResults: document.getElementById('place-results'),
    dateInput: document.getElementById('target-date'),
    statusMessage: document.getElementById('status-message'),
    resultSection: document.getElementById('result-section'),
    resultPlace: document.getElementById('result-place'),
    resultDate: document.getElementById('result-date'),
    resultSunrise: document.getElementById('result-sunrise'),
    resultNoon: document.getElementById('result-noon'),
    resultSunset: document.getElementById('result-sunset'),
    resultLength: document.getElementById('result-length'),
    monthHeading: document.getElementById('month-heading'),
    monthBody: document.getElementById('month-body'),
    csvButton: document.getElementById('csv-button'),
  };

  // 画面の状態：選んだ地点と、表に出している月の行
  const state = { selectedPlace: null, monthRows: [], monthKey: '' };

  // 白夜・極夜のときに表示する説明
  const STATUS_LABELS = { midnightSun: '一日中沈みません（白夜）', polarNight: '一日中昇りません（極夜）' };

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
   * 今日の日付（日本時間）を「YYYY-MM-DD」で返す。
   * @returns {string} 今日の日付
   */
  function getTodayInJapan() {
    const now = new Date(Date.now() + SunReport.JST_UTC_OFFSET_HOURS * 3600000);
    return now.toISOString().slice(0, 10);
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
    return window.SunCalc.isValidDate(date.year, date.month, date.day) ? date : null;
  }

  /**
   * 検索の結果を、選べるボタンの一覧として出す。
   * @param {Array<{name: string, latitude: number, longitude: number}>} places 候補の一覧
   */
  function renderPlaceResults(places) {
    elements.placeResults.replaceChildren();
    places.forEach((place, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = place.name;
      button.setAttribute('aria-pressed', 'false');
      button.dataset.index = String(index);
      button.addEventListener('click', () => selectPlace(place, button));
      item.appendChild(button);
      elements.placeResults.appendChild(item);
    });
  }

  /**
   * 候補から地点を選び、結果を出し直す。
   * @param {{name: string, latitude: number, longitude: number}} place 選んだ地点
   * @param {HTMLButtonElement} button 押されたボタン（選んだ印を付ける）
   */
  function selectPlace(place, button) {
    state.selectedPlace = place;
    state.monthKey = ''; // 地点が変わったので月の表を作り直す
    elements.placeResults.querySelectorAll('button').forEach((other) => other.setAttribute('aria-pressed', 'false'));
    button.setAttribute('aria-pressed', 'true');
    renderResult();
  }

  /**
   * 選んだ地点と日付で、その日の時刻と月の表を出す。地点か日付が足りなければ案内を出す。
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
    elements.resultPlace.textContent = place.name;
    elements.resultDate.textContent =
      `${date.year}年${date.month}月${date.day}日（${row.weekday}）／緯度 ${place.latitude.toFixed(4)}・経度 ${place.longitude.toFixed(4)}`;
    elements.resultSunrise.textContent = row.sunrise;
    elements.resultNoon.textContent = row.solarNoon;
    elements.resultSunset.textContent = row.sunset;
    elements.resultLength.textContent = row.dayLength;

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
   * 月の表を出す。
   * @param {Array<object>} rows SunReport.buildMonthRows の結果
   */
  function renderMonthTable(rows) {
    elements.monthBody.replaceChildren();
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.dataset.day = String(row.day);
      const cells = [`${row.day}日`, row.weekday, row.sunrise, row.solarNoon, row.sunset, row.dayLength];
      cells.forEach((text, index) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (index === 1 && row.weekday === '日') td.className = 'weekday-sun';
        tr.appendChild(td);
      });
      elements.monthBody.appendChild(tr);
    }
  }

  /**
   * 月の表で、選んだ日の行に印を付ける。
   * @param {number} day 日（1〜31）
   */
  function highlightDay(day) {
    elements.monthBody.querySelectorAll('tr').forEach((tr) => {
      tr.classList.toggle('is-selected', tr.dataset.day === String(day));
    });
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
    // 先頭の ﻿（BOM）は、Excel で開いたときに文字化けさせないための印
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
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
  elements.csvButton.addEventListener('click', handleCsvClick);
  showStatus('地名を検索して、候補から地点を選んでください。');
})();
