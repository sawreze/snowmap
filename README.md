# ❄️ snowweb — WebSocket 실시간 눈 제보 앱 (React Native)

사용자가 지금 있는 곳의 적설·노면 상태를 제보하면 접속한 모든 사람에게 **즉시** 퍼지고,
다른 사람은 "👍 맞아요 / 🫥 사라졌어요"로 검증합니다. 서버 ↔ 앱이 WebSocket 하나로 양방향 통신해요.

```
snowweb/
├─ server/            Node.js + ws 실시간 서버
│  ├─ index.js
│  └─ test-client.js  두 클라이언트로 제보·투표 전달 테스트
└─ app/               React Native (Expo) 앱
   ├─ App.js          메인 화면 (연결 상태, 반경 필터, 제보 목록)
   ├─ app.json        위치 권한 설정
   └─ src/
      ├─ config.js        서버 주소, 적설 단계/노면 상수
      ├─ useSnowSocket.js WebSocket 훅 (자동 재연결, 오프라인 큐)
      └─ components/      ReportForm(제보 시트), ReportCard(제보 카드)
```

## 1. 서버 실행

```bash
cd server
npm install
npm start          # ws://0.0.0.0:8080
npm test           # (다른 터미널에서) 동작 확인
```

## 2. 앱 실행 (Expo)

```bash
npx create-expo-app@latest snowweb-app --template blank
cd snowweb-app
npx expo install expo-location react-native-safe-area-context expo-status-bar
```

그다음 이 폴더의 `app/App.js`, `app/app.json`, `app/src/` 를 새 프로젝트에 덮어쓰고:

1. `src/config.js` 의 `WS_URL` 을 서버 PC 주소로 변경
   - 실제 폰: `ws://<PC 내부 IP>:8080` (같은 Wi-Fi, 방화벽에서 8080 허용)
   - Android 에뮬레이터: `ws://10.0.2.2:8080` / iOS 시뮬레이터: `ws://localhost:8080`
2. `npx expo start` → Expo Go로 QR 스캔

> 템플릿이 `index.js`/`App.tsx` 구조라면 `App.js` 를 그 자리에 맞게 import 해주세요.

## 기상청 실시간 예보 연동

서버가 **기상청 단기예보 조회서비스**(공공데이터포털)를 호출해 앱에 WebSocket으로 밀어줍니다.
API 키는 서버에만 두므로 앱을 디컴파일해도 키가 노출되지 않아요.

1. [공공데이터포털 – 기상청_단기예보 조회서비스](https://www.data.go.kr/data/15084084/openapi.do)에서 활용신청 → 마이페이지에서 인증키 확인
2. 서버 실행 시 키 전달
   ```bash
   KMA_API_KEY=발급받은키 npm start
   ```
   키가 없으면 테스트(mock) 예보로 동작하고, 앱에 "테스트 데이터"라고 표시돼요.

동작 방식
- 위경도 → 기상청 5km 격자(nx, ny) 변환 후 **단기예보(getVilageFcst)** + 가까운 6시간은 **초단기예보(getUltraSrtFcst)** 로 보정
- 강수형태(PTY) 눈·비/눈·눈날림 또는 신적설(SNO) > 0 인 시간을 "눈 예보"로 판단
- 10분마다 발표시각을 확인해 **새 발표가 나왔을 때만** 기상청 호출 → 결과가 바뀌면 접속자에게 즉시 푸시
- 격자별 캐시라 같은 동네 사용자가 많아도 호출 수는 그대로
- 전국 19개 주요 지점(`server/regions.js`) 눈 예보 요약을 모든 접속자에게 브로드캐스트

## 메시지 프로토콜 (JSON)

| 방향 | type | 내용 |
|---|---|---|
| C→S | `hello` | `{ nickname }` |
| C→S | `report:create` | `{ ref, payload: { lat, lng, level 0~3, road, note? } }` |
| C→S | `report:vote` | `{ id, kind: 'confirm' \| 'gone' }` (다시 누르면 취소) |
| S→C | `welcome` | `{ clientId, reports[] }` 접속 시 현재 제보 전체 |
| S→C | `presence` | `{ count }` 접속자 수 |
| S→C | `report:new` / `report:update` | `{ report }` 전체에 브로드캐스트 |
| S→C | `report:expire` | `{ id }` 3시간 경과 또는 "사라졌어요" 3표 |
| C→S | `forecast:subscribe` | `{ lat, lng }` 내 위치 예보 구독 (위치 바뀔 때마다) |
| S→C | `forecast:local` | `{ grid, hours[24], summary{willSnow,start,end,totalSno,maxPop} }` |
| S→C | `forecast:national` | `{ updatedAt, regions[] }` 전국 주요 지역 눈 예보 |
| S→C | `ack` / `error` | 제보 접수 확인 / 검증·도배 방지 메시지 |

## 서버 규칙 (index.js 상단 상수로 조절)

- 제보 유효시간 3시간, 1인당 30초에 1건
- "사라졌어요" 3표면 자동 삭제
- 30초 ping/pong으로 끊긴 연결 정리

## 다음 단계 아이디어

- **지도 보기**: `react-native-maps` 로 제보를 마커로 표시
- **영속화**: 지금은 메모리 저장 → 서버 재시작 시 사라짐. Redis/SQLite 등으로 교체
- **지역 채널**: 접속 시 지역(geohash)을 보내고 근처 제보만 받도록 브로드캐스트 범위 축소
- **배포**: HTTPS 도메인 뒤에 두고 `wss://` 사용 (iOS는 ws:// 평문을 기본 차단)
- **사진 첨부**: 이미지는 HTTP 업로드 후 URL만 WebSocket으로 전달
