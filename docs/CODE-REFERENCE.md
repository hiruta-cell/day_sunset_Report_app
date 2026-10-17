# コードの説明（CODE-REFERENCE）

コードを追加・改名・削除したら、同じ変更の中でこのファイルも直す。

## フォルダの意味

| フォルダ | 意味 |
|---|---|
| `/`（直下） | 画面（`index.html`・`style.css`）と設定・説明のファイル |
| `src/` | JavaScript の本体。ブラウザと Node（テスト）の両方で読み込める |
| `test/` | `node --test` で動かすテスト |
| `docs/` | 説明の文書 |

## ファイルの基本機能

| ファイル | 機能 |
|---|---|
| `index.html` | 画面の構造。CSP で通信先を国土地理院だけに絞る。`src/` の4つを順に読み込む |
| `style.css` | 見た目。CSS 変数・ダーク表示・スマホ幅（560px 以下）の調整 |
| `src/sun-calc.js` | 緯度・経度・日付から、日の出・南中・日の入りの時刻を計算する（`window.SunCalc`） |
| `src/geocode.js` | 国土地理院の地名検索 API で、地名から候補の地点を探す（`window.Geocode`） |
| `src/report.js` | 時刻の書式・1日の行・月の表・CSV を作る（`window.SunReport`） |
| `src/app.js` | 画面の操作（検索 → 選択 → 日付 → 表示 → CSV の保存） |
| `test/sun-calc.test.js` | 計算が国立天文台の暦と ±1 分で合うか、白夜・極夜、入力の確認 |
| `test/geocode.test.js` | 地名の整え方、応答の読み取り・絞り込み、失敗の文に入力を含めないこと |
| `test/report.test.js` | 時刻の書式、月の行数、CSV の形と数式の無害化 |
| `package.json` | `npm test` の定義だけ（部品なし） |

## 関数・変数・定数の一覧

| ファイル | 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|---|
| src/sun-calc.js | `SUN_ALTITUDE_AT_HORIZON_DEG` | 定数 | -0.833（度） | 大気の浮き上がりと太陽の半径を考えた、日の出・日の入りの高度 |
| src/sun-calc.js | `MINUTES_PER_DAY` | 定数 | 1440 | 1日の分の数 |
| src/sun-calc.js | `JULIAN_DAY_J2000` | 定数 | 2451545.0 | 天文計算の基準の時刻（ユリウス日） |
| src/sun-calc.js | `JULIAN_DAY_UNIX_EPOCH` | 定数 | 2440587.5 | Date の基準をユリウス日に変える |
| src/sun-calc.js | `REFINE_ITERATIONS` | 定数 | 3 | 時刻の見積もりをやり直す回数 |
| src/sun-calc.js | `toRadians` / `toDegrees` | 関数 | 度とラジアンの変換 | 三角関数の計算 |
| src/sun-calc.js | `isValidDate` | 関数 | 正しい日付（1901〜2099年）か判定 | 2月30日などを弾く |
| src/sun-calc.js | `getSolarPosition` | 関数 | 太陽の赤緯と均時差 | 時刻の計算の材料 |
| src/sun-calc.js | `findHorizonCrossing` | 関数 | 日の出か日の入りの時刻（白夜・極夜は null） | 時刻の計算 |
| src/sun-calc.js | `findSolarNoon` | 関数 | 南中の時刻 | 時刻の計算 |
| src/sun-calc.js | `computeSunTimes` | 関数（公開） | 1日分の日の出・南中・日の入り・昼の長さ | 計算の入口 |
| src/geocode.js | `GSI_SEARCH_URL` | 定数 | 国土地理院の地名検索 API の URL | 通信先 |
| src/geocode.js | `MAX_QUERY_LENGTH` | 定数（公開） | 50 | 長すぎる入力を外へ送らない |
| src/geocode.js | `MAX_RESULTS` | 定数 | 20 | 画面に出す候補の最大の件数 |
| src/geocode.js | `REQUEST_TIMEOUT_MS` | 定数 | 10000 | 応答を待つ最長の時間 |
| src/geocode.js | `ADMINISTRATIVE_SUFFIX_PATTERN` | 定数 | `/[都道府県市区町村郡]$/` | 市区町村の名前があれば施設の名前を外す |
| src/geocode.js | `JAPAN_BOUNDS` | 定数 | 日本の大まかな緯度・経度の範囲 | おかしな座標を捨てる |
| src/geocode.js | `normalizeQuery` | 関数（公開） | 空白を取り、空・長すぎるなら null | 入力の確認 |
| src/geocode.js | `parseGsiResponse` | 関数（公開） | API の応答を候補の一覧にする（重複・範囲外を捨て、市区町村を優先） | 応答の読み取り |
| src/geocode.js | `isInJapan` | 関数（公開） | 座標が日本の範囲か | 応答の確認 |
| src/geocode.js | `searchPlaces` | 関数（公開） | 地名で候補を探す（失敗の文に入力を入れない） | 検索の入口 |
| src/report.js | `JST_UTC_OFFSET_HOURS` | 定数（公開） | 9 | 日本時間の時差 |
| src/report.js | `WEEKDAY_LABELS` | 定数 | 日〜土 | 曜日の表示 |
| src/report.js | `CSV_HEADERS` | 定数 | CSV の見出し | CSV |
| src/report.js | `FORMULA_PREFIX_PATTERN` | 定数 | `/^[=+\-@\t\r]/` | 表計算ソフトで数式とみなされる先頭の文字 |
| src/report.js | `formatTime` | 関数（公開） | 分を「HH:MM」に（null は「--:--」） | 表示 |
| src/report.js | `formatDuration` | 関数（公開） | 分を「◯時間◯◯分」に | 表示 |
| src/report.js | `buildDayRow` | 関数（公開） | 1日分の表の行 | 表示・CSV |
| src/report.js | `buildMonthRows` | 関数（公開） | 1か月分の行 | 月の表 |
| src/report.js | `escapeCsvCell` | 関数（公開） | 引用符で囲み、数式の先頭に ' を付ける | CSV の安全 |
| src/report.js | `toCsv` | 関数（公開） | 月の表を CSV の文字に（CRLF） | CSV の保存 |
| src/app.js | `elements` | 変数 | 画面の部品 | 画面の操作 |
| src/app.js | `state` | 変数 | 選んだ地点・月の行・月の印 | 画面の状態 |
| src/app.js | `STATUS_LABELS` | 定数 | 白夜・極夜の説明 | 表示 |
| src/app.js | `showStatus` | 関数 | 状態のメッセージを出す | 表示 |
| src/app.js | `getTodayInJapan` | 関数 | 今日の日付（日本時間） | 日付の初期値 |
| src/app.js | `parseDateInput` | 関数 | 「YYYY-MM-DD」を年・月・日に | 入力の確認 |
| src/app.js | `renderPlaceResults` | 関数 | 候補をボタンで出す | 表示 |
| src/app.js | `selectPlace` | 関数 | 地点を選んで出し直す | 操作 |
| src/app.js | `renderResult` | 関数 | その日の時刻と月の表を出す | 表示 |
| src/app.js | `renderMonthTable` | 関数 | 月の表を出す | 表示 |
| src/app.js | `highlightDay` | 関数 | 選んだ日の行に印 | 表示 |
| src/app.js | `handleSearchSubmit` | 関数 | 検索のフォームの送信 | 操作 |
| src/app.js | `handleCsvClick` | 関数 | CSV を保存させる（BOM 付き） | 操作 |
| test/sun-calc.test.js | `TOLERANCE_MINUTES` | 定数 | 1 | 暦の値と比べるときの許す差 |
| test/sun-calc.test.js | `REFERENCE_CASES` | 定数 | 国立天文台の暦の値（東京・根室・鹿児島） | 比べる値 |
| test/sun-calc.test.js | `toMinutes` | 関数 | 「HH:MM」を分に | テストの補助 |
| test/geocode.test.js | `SAMPLE_RESPONSE` | 定数 | 国土地理院の応答の見本 | テストの入力 |
| test/geocode.test.js | `createFakeFetch` | 関数 | 決まった応答を返す偽物の fetch | 通信しないテスト |
| test/report.test.js | `SAMPLE_PLACE` | 定数 | 架空の地点 | テストの入力 |
