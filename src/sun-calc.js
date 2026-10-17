/*
 * sun-calc.js
 * 目的：緯度・経度・日付から、日の出・南中・日の入りの時刻（その地域の時刻、0時からの分）を計算する。
 * 計算式：NOAA（米国海洋大気庁）の Solar Calculator と同じ式。精度はおおむね ±1 分（緯度 ±60 度以内）。
 * 使い方：ブラウザでは <script> で読み込むと window.SunCalc に入る。Node では require('./sun-calc.js')。
 * 注意：通信はしない。標高・地形は考えない（国立天文台の暦と同じく、地平線は平らとみなす）。
 */
(function (root) {
  'use strict';

  // 日の出・日の入りとみなす太陽の中心の高度（度）。
  // 大気による浮き上がり 34 分 ＋ 太陽の半径 16 分 ＝ 50 分 ≒ 0.833 度だけ、地平線より下にある時刻を使う
  const SUN_ALTITUDE_AT_HORIZON_DEG = -0.833;

  // 1 日の分の数
  const MINUTES_PER_DAY = 1440;

  // 2000年1月1日12時（世界時）のユリウス日。天文計算の基準の時刻
  const JULIAN_DAY_J2000 = 2451545.0;

  // 1970年1月1日0時（世界時）のユリウス日。JavaScript の Date の基準と結び付けるために使う
  const JULIAN_DAY_UNIX_EPOCH = 2440587.5;

  // 時刻の見積もりを何回やり直すか（太陽の位置を、見積もった時刻で計算し直すと精度が上がる）
  const REFINE_ITERATIONS = 3;

  /**
   * 度をラジアンに変える。
   * @param {number} degrees 角度（度）
   * @returns {number} 角度（ラジアン）
   */
  function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
  }

  /**
   * ラジアンを度に変える。
   * @param {number} radians 角度（ラジアン）
   * @returns {number} 角度（度）
   */
  function toDegrees(radians) {
    return (radians * 180) / Math.PI;
  }

  /**
   * 年月日が正しい日付か確かめる（2月30日などを弾く）。
   * @param {number} year 年（1901〜2099）
   * @param {number} month 月（1〜12）
   * @param {number} day 日（1〜31）
   * @returns {boolean} 正しい日付なら true
   * 注意：計算式の精度が保てる 1901〜2099 年だけを受け付ける
   */
  function isValidDate(year, month, day) {
    if (![year, month, day].every(Number.isInteger)) return false;
    if (year < 1901 || year > 2099) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  /**
   * 指定した時刻での、太陽の赤緯（天の赤道からの角度）と均時差（日時計と時計のずれ）を求める。
   * @param {number} julianDay ユリウス日（世界時）
   * @returns {{declinationDeg: number, equationOfTimeMin: number}} 赤緯（度）と均時差（分）
   */
  function getSolarPosition(julianDay) {
    // T：J2000 からのユリウス世紀（36525 日）
    const t = (julianDay - JULIAN_DAY_J2000) / 36525;

    // 太陽の平均黄経・平均近点角（度）と、地球の軌道の離心率
    const meanLongitudeDeg = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
    const meanAnomalyDeg = 357.52911 + t * (35999.05029 - 0.0001537 * t);
    const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

    // 中心差（楕円軌道による補正）を足して真の黄経にする
    const meanAnomalyRad = toRadians(meanAnomalyDeg);
    const centerDeg =
      Math.sin(meanAnomalyRad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
      Math.sin(2 * meanAnomalyRad) * (0.019993 - 0.000101 * t) +
      Math.sin(3 * meanAnomalyRad) * 0.000289;
    const trueLongitudeDeg = meanLongitudeDeg + centerDeg;

    // 章動と光行差を補正した見かけの黄経
    const omegaRad = toRadians(125.04 - 1934.136 * t);
    const apparentLongitudeRad = toRadians(trueLongitudeDeg - 0.00569 - 0.00478 * Math.sin(omegaRad));

    // 地軸の傾き（黄道傾斜角）
    const meanObliquityDeg = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
    const obliquityRad = toRadians(meanObliquityDeg + 0.00256 * Math.cos(omegaRad));

    const declinationRad = Math.asin(Math.sin(obliquityRad) * Math.sin(apparentLongitudeRad));

    // 均時差（分）
    const y = Math.tan(obliquityRad / 2) ** 2;
    const l0 = toRadians(meanLongitudeDeg);
    const equationOfTimeRad =
      y * Math.sin(2 * l0) -
      2 * eccentricity * Math.sin(meanAnomalyRad) +
      4 * eccentricity * y * Math.sin(meanAnomalyRad) * Math.cos(2 * l0) -
      0.5 * y * y * Math.sin(4 * l0) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomalyRad);

    return {
      declinationDeg: toDegrees(declinationRad),
      equationOfTimeMin: 4 * toDegrees(equationOfTimeRad),
    };
  }

  /**
   * 日の出か日の入りの時刻（その地域の時刻の、0時からの分）を求める。
   * @param {number} dayStartJulianDay その日の0時（世界時）のユリウス日
   * @param {number} latitude 緯度（度、北が正）
   * @param {number} longitude 経度（度、東が正）
   * @param {number} utcOffsetHours 世界時との時差（日本は 9）
   * @param {number} direction 日の出は -1、日の入りは +1
   * @returns {{minutes: number|null, status: string}} minutes は分（小数あり）。太陽が沈まない・昇らない日は null
   */
  function findHorizonCrossing(dayStartJulianDay, latitude, longitude, utcOffsetHours, direction) {
    const latitudeRad = toRadians(latitude);
    // 最初は正午の太陽の位置で見積もり、見積もった時刻で計算し直す
    let estimateMinutes = 720;
    for (let i = 0; i < REFINE_ITERATIONS; i++) {
      const julianDay = dayStartJulianDay + (estimateMinutes - utcOffsetHours * 60) / MINUTES_PER_DAY;
      const { declinationDeg, equationOfTimeMin } = getSolarPosition(julianDay);
      const declinationRad = toRadians(declinationDeg);

      // 時角（南中から日の出・日の入りまでの角度）の余弦
      const cosHourAngle =
        (Math.sin(toRadians(SUN_ALTITUDE_AT_HORIZON_DEG)) - Math.sin(latitudeRad) * Math.sin(declinationRad)) /
        (Math.cos(latitudeRad) * Math.cos(declinationRad));
      if (cosHourAngle > 1) return { minutes: null, status: 'polarNight' }; // 一日中昇らない
      if (cosHourAngle < -1) return { minutes: null, status: 'midnightSun' }; // 一日中沈まない

      const hourAngleDeg = toDegrees(Math.acos(cosHourAngle));
      const solarNoonMinutes = 720 - 4 * longitude - equationOfTimeMin + utcOffsetHours * 60;
      estimateMinutes = solarNoonMinutes + direction * 4 * hourAngleDeg;
    }
    return { minutes: estimateMinutes, status: 'normal' };
  }

  /**
   * 南中（太陽がいちばん高くなる）時刻を求める。
   * @param {number} dayStartJulianDay その日の0時（世界時）のユリウス日
   * @param {number} longitude 経度（度、東が正）
   * @param {number} utcOffsetHours 世界時との時差（時間）
   * @returns {number} その地域の時刻の、0時からの分（小数あり）
   */
  function findSolarNoon(dayStartJulianDay, longitude, utcOffsetHours) {
    let estimateMinutes = 720;
    for (let i = 0; i < REFINE_ITERATIONS; i++) {
      const julianDay = dayStartJulianDay + (estimateMinutes - utcOffsetHours * 60) / MINUTES_PER_DAY;
      const { equationOfTimeMin } = getSolarPosition(julianDay);
      estimateMinutes = 720 - 4 * longitude - equationOfTimeMin + utcOffsetHours * 60;
    }
    return estimateMinutes;
  }

  /**
   * 1日分の日の出・南中・日の入り・昼の長さを計算する。
   * @param {{year: number, month: number, day: number}} date 日付（その地域の暦の日付）
   * @param {number} latitude 緯度（度、-90〜90、北が正）
   * @param {number} longitude 経度（度、-180〜180、東が正）
   * @param {number} utcOffsetHours 世界時との時差（日本は 9）
   * @returns {{sunriseMinutes: number|null, solarNoonMinutes: number, sunsetMinutes: number|null,
   *            dayLengthMinutes: number, status: string}}
   *   時刻はその地域の 0時からの分（小数あり）。status は 'normal'・'polarNight'（昇らない）・'midnightSun'（沈まない）
   * 注意：引数が正しくなければ RangeError を投げる
   */
  function computeSunTimes(date, latitude, longitude, utcOffsetHours) {
    if (!date || !isValidDate(date.year, date.month, date.day)) {
      throw new RangeError('日付が正しくありません');
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new RangeError('緯度は -90〜90 の数で指定してください');
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new RangeError('経度は -180〜180 の数で指定してください');
    }
    if (!Number.isFinite(utcOffsetHours) || utcOffsetHours < -12 || utcOffsetHours > 14) {
      throw new RangeError('時差は -12〜14 時間で指定してください');
    }

    const dayStartJulianDay = Date.UTC(date.year, date.month - 1, date.day) / 86400000 + JULIAN_DAY_UNIX_EPOCH;
    const sunrise = findHorizonCrossing(dayStartJulianDay, latitude, longitude, utcOffsetHours, -1);
    const sunset = findHorizonCrossing(dayStartJulianDay, latitude, longitude, utcOffsetHours, 1);
    const solarNoonMinutes = findSolarNoon(dayStartJulianDay, longitude, utcOffsetHours);

    // 白夜・極夜のときは昼の長さを 24時間・0時間とする
    let status = 'normal';
    let dayLengthMinutes;
    if (sunrise.status !== 'normal' || sunset.status !== 'normal') {
      status = sunrise.status !== 'normal' ? sunrise.status : sunset.status;
      dayLengthMinutes = status === 'midnightSun' ? MINUTES_PER_DAY : 0;
    } else {
      dayLengthMinutes = sunset.minutes - sunrise.minutes;
    }

    return {
      sunriseMinutes: status === 'normal' ? sunrise.minutes : null,
      solarNoonMinutes,
      sunsetMinutes: status === 'normal' ? sunset.minutes : null,
      dayLengthMinutes,
      status,
    };
  }

  /**
   * ある瞬間に、太陽が真上に来る地表の点（太陽直下点）を求める。地図に昼夜の境の線を引くのに使う。
   * @param {number} timestampMs その瞬間（1970-01-01 0:00 UTC からのミリ秒。Date.now() や Date.UTC() の値）
   * @returns {{latitude: number, longitude: number}} 太陽直下点の緯度（度、太陽の赤緯と同じ）と経度（度、-180〜180、東が正）
   * 注意：引数が数でなければ RangeError を投げる
   */
  function getSubsolarPoint(timestampMs) {
    if (!Number.isFinite(timestampMs)) {
      throw new RangeError('時刻が正しくありません');
    }
    const julianDay = timestampMs / 86400000 + JULIAN_DAY_UNIX_EPOCH;
    const { declinationDeg, equationOfTimeMin } = getSolarPosition(julianDay);
    // その日の 0時（世界時）からの分。太陽直下点は、世界時の正午（720分）に経度 0 度の上にあり、4分ごとに 1 度ずつ西へ動く
    const utcMinutes = (((timestampMs / 60000) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const rawLongitudeDeg = (MINUTES_PER_DAY / 2 - equationOfTimeMin - utcMinutes) / 4;
    // -180〜180 度の範囲に収める
    const longitude = ((((rawLongitudeDeg + 180) % 360) + 360) % 360) - 180;
    return { latitude: declinationDeg, longitude };
  }

  const api = { computeSunTimes, getSubsolarPoint, isValidDate, SUN_ALTITUDE_AT_HORIZON_DEG };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SunCalc = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
