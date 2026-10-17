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
| `index.html` | 画面の構造（ヘッダー・検索・日付・日本地図つきの結果・太陽の通り道・月の表）。CSP で通信先を国土地理院・zipcloud・Open-Meteo の3つだけに絞る。`src/` の7つを順に読み込む |
| `style.css` | 見た目。朝焼けのヘッダー・カード・地図と図の色。CSS 変数・ダーク表示・動きを減らす設定・スマホ幅（560px 以下）の調整 |
| `src/sun-calc.js` | 緯度・経度・日付から、日の出・南中・日の入りの時刻を計算する。ある瞬間の太陽直下点も求める（`window.SunCalc`） |
| `src/geocode.js` | 国土地理院の地名検索 API で、地名から候補の地点を探す。候補には都道府県名を付ける。郵便番号は zipcloud で住所にして探す（`window.Geocode`） |
| `src/report.js` | 時刻の書式・1日の行・月の表・前日との昼の長さの差・CSV を作る（`window.SunReport`） |
| `src/japan-map.js` | 簡略化した日本地図（実際の海岸線を単純化した多角形）を SVG に描き、地点の位置に印を付ける。沖縄・奄美は右下の枠に入れる。ある瞬間の昼夜（昼は明るく・夜は暗く、日の出・日の入りの線）も重ねる（`window.JapanMap`） |
| `src/weather.js` | Open-Meteo から、地点のいまの天気・気温・風向・風速を取得し、画面に出す形にする（`window.Weather`） |
| `src/sun-chart.js` | 太陽の通り道の弧と、一日24時間の昼夜のバーを SVG に描く（`window.SunChart`） |
| `src/app.js` | 画面の操作（検索 → 選択 → 日付（前後の日・今日）→ 地図・天気・結果・図・表の表示 → CSV の保存） |
| `test/sun-calc.test.js` | 計算が国立天文台の暦と ±1 分で合うか、白夜・極夜、入力、太陽直下点の確認 |
| `test/geocode.test.js` | 地名の整え方、応答の読み取り・絞り込み、県名の付記、郵便番号の検索（偽の通信）、失敗の文に入力を含めないこと |
| `test/report.test.js` | 時刻の書式、月の行数、前日との差の文、CSV の形と数式の無害化 |
| `test/japan-map.test.js` | 位置の変換、主な都市が地図の陸地の中にあること、昼夜の領域と日の出・日の入りの線 |
| `test/weather.test.js` | 問い合わせの URL（座標の丸め）、応答の読み取り、風向・天気の名前、失敗の文に座標を含めないこと |
| `test/sun-chart.test.js` | 太陽の弧の上の位置、昼の進み具合、昼夜のバー |
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
| src/sun-calc.js | `getSubsolarPoint` | 関数（公開） | ある瞬間の太陽直下点（緯度＝赤緯、経度）。経度は世界時の正午に 0 度で、4分ごとに 1 度西へ動く | 地図の昼夜 |
| src/sun-calc.js | `computeSunTimes` | 関数（公開） | 1日分の日の出・南中・日の入り・昼の長さ | 計算の入口 |
| src/geocode.js | `GSI_SEARCH_URL` | 定数 | 国土地理院の地名検索 API の URL | 通信先 |
| src/geocode.js | `ZIPCLOUD_URL` | 定数 | 郵便番号から住所を調べる zipcloud の URL | 通信先 |
| src/geocode.js | `MAX_POSTAL_ADDRESSES` | 定数 | 5 | 1つの郵便番号から調べる住所の最大の数 |
| src/geocode.js | `POSTAL_TOWN_PLACEHOLDER_PATTERN` / `POSTAL_TOWN_NOTE_PATTERN` | 定数 | 町域の決まり文句（「以下に掲載がない場合」など）・かっこの注記の形 | 住所から除く |
| src/geocode.js | `MAX_QUERY_LENGTH` | 定数（公開） | 50 | 長すぎる入力を外へ送らない |
| src/geocode.js | `MAX_RESULTS` | 定数 | 20 | 画面に出す候補の最大の件数 |
| src/geocode.js | `REQUEST_TIMEOUT_MS` | 定数 | 10000 | 応答を待つ最長の時間 |
| src/geocode.js | `ADMINISTRATIVE_SUFFIX_PATTERN` | 定数 | `/[都道府県市区町村郡]$/` | 市区町村の名前があれば施設の名前を外す |
| src/geocode.js | `PREFECTURE_NAMES` | 定数 | 都道府県の名前（コード 01〜47 の順） | 県名の切り分け・補足 |
| src/geocode.js | `ADDRESS_CODE_PATTERN` | 定数 | 4〜5桁の数字 | 市区町村コードの形（4桁は先頭の 0 が省かれている） |
| src/geocode.js | `JAPAN_BOUNDS` | 定数 | 日本の大まかな緯度・経度の範囲 | おかしな座標を捨てる |
| src/geocode.js | `normalizeQuery` | 関数（公開） | 空白を取り、空・長すぎるなら null | 入力の確認 |
| src/geocode.js | `findPrefectureName` | 関数（公開） | 名前の先頭の県名、なければ市区町村コードの上2桁から県名を求める | 県名の付記 |
| src/geocode.js | `parseGsiFeatures` | 関数（公開） | API の応答を候補にする（重複・範囲外を捨てる。絞り込み・件数の制限はしない） | 応答の読み取り |
| src/geocode.js | `parseGsiResponse` | 関数（公開） | API の応答を候補（name・shortName・prefecture・緯度・経度）にする（重複・範囲外を捨て、市区町村を優先） | 応答の読み取り |
| src/geocode.js | `isInJapan` | 関数（公開） | 座標が日本の範囲か | 応答の確認 |
| src/geocode.js | `normalizePostalCode` | 関数（公開） | 全角・ハイフン・「〒」・空白をそろえて7桁にする（郵便番号でなければ null） | 入力の判定 |
| src/geocode.js | `requestJson` | 関数 | 通信して JSON を受け取る（時間の上限・クッキーなし・参照元なし。失敗の文に入力を入れない） | 通信 |
| src/geocode.js | `buildPostalAddress` | 関数（公開） | zipcloud の1件から、町域まで・市区町村までの住所の文字を作る | 郵便番号の検索 |
| src/geocode.js | `findPlaceByAddress` | 関数 | 住所を国土地理院で探し、一番合う1件を返す | 郵便番号の検索 |
| src/geocode.js | `searchByPostalCode` | 関数 | 郵便番号 → 住所（zipcloud）→ 座標（国土地理院） | 郵便番号の検索 |
| src/geocode.js | `searchPlaces` | 関数（公開） | 地名または郵便番号で候補を探す（失敗の文に入力を入れない） | 検索の入口 |
| src/report.js | `JST_UTC_OFFSET_HOURS` | 定数（公開） | 9 | 日本時間の時差 |
| src/report.js | `WEEKDAY_LABELS` | 定数 | 日〜土 | 曜日の表示 |
| src/report.js | `CSV_HEADERS` | 定数 | CSV の見出し | CSV |
| src/report.js | `FORMULA_PREFIX_PATTERN` | 定数 | `/^[=+\-@\t\r]/` | 表計算ソフトで数式とみなされる先頭の文字 |
| src/report.js | `formatTime` | 関数（公開） | 分を「HH:MM」に（null は「--:--」） | 表示 |
| src/report.js | `formatDuration` | 関数（公開） | 分を「◯時間◯◯分」に | 表示 |
| src/report.js | `formatDurationChange` | 関数（公開） | 昼の長さの差（分）を「前日より +1分28秒」に | 表示 |
| src/report.js | `getDayLengthChangeText` | 関数（公開） | ある日の昼の長さの前日との差の文（範囲外・白夜・極夜は空） | 表示 |
| src/report.js | `buildDayRow` | 関数（公開） | 1日分の表の行 | 表示・CSV |
| src/report.js | `buildMonthRows` | 関数（公開） | 1か月分の行 | 月の表 |
| src/report.js | `escapeCsvCell` | 関数（公開） | 引用符で囲み、数式の先頭に ' を付ける | CSV の安全 |
| src/report.js | `toCsv` | 関数（公開） | 月の表を CSV の文字に（CRLF） | CSV の保存 |
| src/japan-map.js | `HORIZON_ALTITUDE_DEG` | 定数 | -0.833（度） | 昼夜の境にする太陽の高度（時刻の計算と同じ） |
| src/japan-map.js | `DAYLIGHT_ROW_HEIGHT` / `DAYLIGHT_SAMPLE_STEPS` / `DEGREES_TO_RADIANS` | 定数 | 昼夜の線の折れ線の間隔（2）・昼夜の判定で調べる点の数・度→ラジアン | 昼夜の計算 |
| src/japan-map.js | `MAIN_BOUNDS` / `MAIN_SCALE` / `MAIN_LONGITUDE_SCALE` | 定数 | 本土の地図の範囲（北緯30〜45.9度・東経128.6〜148.9度）と、1度あたりの長さ | 緯度・経度を図の位置にする |
| src/japan-map.js | `INSET_BOUNDS` / `INSET_SCALE` / `INSET_LONGITUDE_SCALE` / `INSET_PADDING` | 定数 | 沖縄・奄美の枠の中の範囲・縮尺・余白 | 同上（枠の中） |
| src/japan-map.js | `MAP_WIDTH` / `MAP_HEIGHT` / `INSET_FRAME` | 定数（公開） | 地図全体の大きさと、右下の枠の位置・大きさ | 描く大きさ |
| src/japan-map.js | `MAINLAND_POLYGONS` / `INSET_POLYGONS` | 定数 | Natural Earth（パブリックドメイン）の 1:5000万の海岸線を、約 3km の許容で単純化した島ごとの [経度, 緯度] の配列。本土用と、沖縄・奄美の枠用 | 地図の形 |
| src/japan-map.js | `isInBounds` | 関数 | 緯度・経度が範囲の中か | 位置の変換 |
| src/japan-map.js | `projectToMainland` / `projectToInset` | 関数 | 緯度・経度を本土・枠の中の位置にする | 位置の変換 |
| src/japan-map.js | `projectPoint` | 関数（公開） | 緯度・経度を地図の位置にする（載っていなければ null） | 印の位置 |
| src/japan-map.js | `isInsidePolygon` | 関数 | 点が多角形の中か（光線を飛ばす方法） | 陸地の判定 |
| src/japan-map.js | `isOnLand` | 関数（公開） | 緯度・経度が地図の陸地の中か | テスト（印が海に出ないこと） |
| src/japan-map.js | `polygonsToPath` / `buildLandPaths` | 関数 | 多角形を SVG の path の d 属性にする | 描画 |
| src/japan-map.js | `createSvgElement` | 関数 | SVG の要素を作る | 描画 |
| src/japan-map.js | `normalizeLongitudeDifference` | 関数 | 経度の差を -180〜180 度に収める | 昼夜の計算 |
| src/japan-map.js | `getDaylightHalfWidth` | 関数（公開） | ある緯度で、太陽直下点から東西にどこまで昼か（0＝一日中夜、180＝一日中昼） | 昼夜の計算 |
| src/japan-map.js | `isDaylight` | 関数（公開） | その地点が昼か | 昼夜の計算 |
| src/japan-map.js | `describeDaylight` | 関数（公開） | 日本全体が昼・夜・混ざっているか | 地図の下の説明 |
| src/japan-map.js | `buildDaylightRegion` / `buildDaylightGeometry` | 関数（`buildDaylightGeometry` は公開） | 昼の領域・夜の領域・日の出の線（昼の西の端）・日の入りの線（東の端）の path を作る | 昼夜の描画 |
| src/japan-map.js | `drawDaylightRegion` | 関数 | 昼夜の領域と線を SVG に描き足す | 描画 |
| src/japan-map.js | `render` | 関数（公開） | 地図を描き、昼夜を重ね、地点に印を付ける（載せられたら true） | 描画 |
| src/sun-chart.js | `CHART_WIDTH` / `CHART_HEIGHT` / `ARC` / `DAY_BAR` | 定数 | 図の大きさ・太陽の弧・昼夜のバーの位置 | 描く大きさ |
| src/sun-chart.js | `NOON_PROGRESS` / `TICK_HOURS` / `MINUTES_PER_DAY` | 定数 | 南中の進み具合（0.5）・目盛りの時刻・1日の分 | 描画 |
| src/sun-chart.js | `getSunPosition` | 関数（公開） | 昼の進み具合から、弧の上の太陽の位置 | 描画 |
| src/sun-chart.js | `computeProgress` | 関数（公開） | いまの時刻から昼の進み具合（今日でなければ南中） | 描画 |
| src/sun-chart.js | `getDayBarSegment` | 関数（公開） | 昼の時間帯をバーの上の位置と幅に | 描画 |
| src/sun-chart.js | `createSvgElement` / `render` | 関数 | SVG の要素を作る／図を描く（`render` は公開） | 描画 |
| src/weather.js | `OPEN_METEO_URL` / `REQUEST_TIMEOUT_MS` / `COORDINATE_DECIMALS` / `CALM_WIND_SPEED_MS` | 定数 | 通信先・応答を待つ時間・送る座標の小数の桁数（2）・無風とみなす風速（0.3 m/s） | 天気の取得 |
| src/weather.js | `WIND_DIRECTION_LABELS` / `WEATHER_CODE_LABELS` | 定数 | 16方位の名前・天気コードの日本語 | 表示 |
| src/weather.js | `getWindDirectionLabel` | 関数（公開） | 風向（度）を16方位の名前に | 表示 |
| src/weather.js | `getWeatherLabel` | 関数（公開） | 天気コードを日本語に（知らないコードは「不明」） | 表示 |
| src/weather.js | `buildWeatherUrl` | 関数（公開） | 問い合わせの URL（座標は小数2桁に丸める） | 天気の取得 |
| src/weather.js | `parseWeatherResponse` | 関数（公開） | 応答を画面に出す形にする（範囲外・形違いは null） | 天気の取得 |
| src/weather.js | `fetchCurrentWeather` | 関数（公開） | 地点のいまの天気を取得する（失敗の文に座標を入れない） | 天気の取得 |
| src/app.js | `elements` | 変数 | 画面の部品 | 画面の操作 |
| src/app.js | `state` | 変数 | 選んだ地点・月の行・月の印 | 画面の状態 |
| src/app.js | `STATUS_LABELS` | 定数 | 白夜・極夜の説明 | 表示 |
| src/app.js | `MAP_NOTE_ON_MAP` / `MAP_NOTE_OFF_MAP` | 定数 | 地図の下の説明（載っているとき・載っていないとき） | 表示 |
| src/app.js | `DAYLIGHT_ALL_LABELS` | 定数 | 日本全体が昼・夜のときの説明 | 表示 |
| src/app.js | `MILLISECONDS_PER_HOUR` | 定数 | 3600000 | 日本時間の計算 |
| src/app.js | `getNowInJapan` / `getNowMinutesInJapan` | 関数 | 日本時間のいま／いまの0時からの分 | 今日の判定・太陽の位置 |
| src/app.js | `formatDateInput` | 関数 | 年・月・日を「YYYY-MM-DD」に | 日付の入力 |
| src/app.js | `formatCoordinates` | 関数 | 「北緯35.66° 東経139.74°」の文字 | 表示 |
| src/app.js | `stepDate` | 関数 | 日付を前後に1日動かす（範囲外は動かさない） | 操作 |
| src/app.js | `loadWeather` | 関数 | 選んだ地点のいまの天気を取得して出す（古い取得の結果は捨てる） | 天気 |
| src/app.js | `renderWeather` | 関数 | 天気・気温・風向・風速と風の矢印を出す | 天気 |
| src/app.js | `renderPlaceSummary` | 関数 | 結果の上の部分（昼夜つきの地図・県名・地名・日付）を出す | 表示 |
| src/app.js | `renderSunChart` | 関数 | 太陽の通り道の図を出す（白夜・極夜は隠す） | 表示 |
| src/app.js | `handleMonthBodyClick` | 関数 | 月の表の日付を押したらその日に切り替える | 操作 |
| src/app.js | `showStatus` | 関数 | 状態のメッセージを出す | 表示 |
| src/app.js | `getTodayInJapan` | 関数 | 今日の日付（日本時間） | 日付の初期値 |
| src/app.js | `parseDateInput` | 関数 | 「YYYY-MM-DD」を年・月・日に | 入力の確認 |
| src/app.js | `renderPlaceResults` | 関数 | 候補を（県名・地名・緯度経度の）ボタンで出す | 表示 |
| src/app.js | `selectPlace` | 関数 | 地点を選んで出し直す | 操作 |
| src/app.js | `renderResult` | 関数 | 地図・その日の時刻・図・月の表を出す | 表示 |
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
| test/japan-map.test.js | `JAPAN_CENTER_LONGITUDE` / `COASTAL_TOLERANCE_DEGREES` / `isNearLand` | 定数・関数 | 日本の真ん中の経度・岸からの許容（0.05度）・岸のそばか調べる | 昼夜・海岸のテスト |
| test/japan-map.test.js | `MAJOR_CITIES` | 定数 | 主な都市（名前・緯度・経度） | 印が海に出ないことの確認 |
| test/weather.test.js | `SAMPLE_BODY` / `createFakeFetch` | 定数・関数 | Open-Meteo の応答の見本（架空）・偽物の fetch | 通信しないテスト |
| test/geocode.test.js | `ZIPCLOUD_SAMPLE` / `createPostalFakeFetch` / `gsiFeature` | 定数・関数 | zipcloud の応答の見本（架空の住所）・郵便番号用の偽物の fetch・国土地理院の応答の1件 | 郵便番号のテスト |
