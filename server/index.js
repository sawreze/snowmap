// snowweb 실시간 제보 서버
// 실행: npm install && npm start   (기본 포트 8080, PORT 환경변수로 변경)
// server/.env 자동 로드 (Node 20.12+/21.7+)
try { process.loadEnvFile(require('path').join(__dirname, '.env')); } catch {}

// 기상청 연동: KMA_API_KEY=발급받은키 npm start  (키가 없으면 mock 예보로 동작)
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const kma = require('./kma');
const REGIONS = require('./regions');

const FORECAST_REFRESH_MS = 10 * 60 * 1000; // 10분마다 발표시각 확인 (바뀐 경우에만 실제 호출)

const PORT = Number(process.env.PORT) || 8080;
const REPORT_TTL_MS = 3 * 60 * 60 * 1000; // 제보 유효시간 3시간
const RATE_LIMIT_MS = 30 * 1000;          // 한 사용자당 30초에 1건
const GONE_THRESHOLD = 3;                 // "사라졌어요" 3표면 제보 삭제
const HEARTBEAT_MS = 30 * 1000;

const LEVELS = [0, 1, 2, 3];                                  // 0 없음 ~ 3 폭설
const ROADS = ['clear', 'wet', 'slushy', 'icy', 'blocked'];   // 노면 상태

const wss = new WebSocketServer({ port: PORT });
/** @type {Map<string, any>} id -> report (confirms/gones는 Set으로 내부 보관) */
const reports = new Map();

// ---------- 유틸 ----------
const send = (ws, msg) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
};

const broadcast = (msg) => {
  const data = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(data);
};

const broadcastPresence = () => broadcast({ type: 'presence', count: wss.clients.size });

const serialize = (r) => ({
  id: r.id,
  lat: r.lat,
  lng: r.lng,
  level: r.level,
  road: r.road,
  note: r.note,
  nickname: r.nickname,
  authorId: r.authorId,
  createdAt: r.createdAt,
  confirms: r.confirms.size,
  gones: r.gones.size,
});

function validateReport(p) {
  if (!p || typeof p !== 'object') return '제보 데이터가 없습니다.';
  if (typeof p.lat !== 'number' || p.lat < -90 || p.lat > 90) return '위도가 올바르지 않습니다.';
  if (typeof p.lng !== 'number' || p.lng < -180 || p.lng > 180) return '경도가 올바르지 않습니다.';
  if (!LEVELS.includes(p.level)) return '적설 단계가 올바르지 않습니다.';
  if (!ROADS.includes(p.road)) return '노면 상태가 올바르지 않습니다.';
  if (p.note != null && (typeof p.note !== 'string' || p.note.length > 200)) return '메모는 200자 이하입니다.';
  return null;
}

// ---------- 연결 처리 ----------
wss.on('connection', (ws) => {
  ws.id = crypto.randomUUID();
  ws.nickname = '익명';
  ws.isAlive = true;
  ws.lastReportAt = 0;

  ws.on('pong', () => { ws.isAlive = true; });

  send(ws, {
    type: 'welcome',
    clientId: ws.id,
    reports: [...reports.values()].map(serialize).sort((a, b) => b.createdAt - a.createdAt),
  });
  if (national) send(ws, { type: 'forecast:national', ...national });
  broadcastPresence();

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: 'error', message: '잘못된 메시지 형식입니다.' });
    }

    switch (msg.type) {
      case 'hello': {
        if (typeof msg.nickname === 'string' && msg.nickname.trim()) {
          ws.nickname = msg.nickname.trim().slice(0, 20);
        }
        break;
      }

      case 'report:create': {
        const now = Date.now();
        if (now - ws.lastReportAt < RATE_LIMIT_MS) {
          const wait = Math.ceil((RATE_LIMIT_MS - (now - ws.lastReportAt)) / 1000);
          return send(ws, { type: 'error', message: `${wait}초 후에 다시 제보할 수 있어요.` });
        }
        const err = validateReport(msg.payload);
        if (err) return send(ws, { type: 'error', message: err });

        const p = msg.payload;
        const report = {
          id: crypto.randomUUID(),
          lat: p.lat,
          lng: p.lng,
          level: p.level,
          road: p.road,
          note: (p.note || '').trim(),
          nickname: ws.nickname,
          authorId: ws.id,
          createdAt: now,
          confirms: new Set(),
          gones: new Set(),
        };
        reports.set(report.id, report);
        ws.lastReportAt = now;
        send(ws, { type: 'ack', ref: msg.ref, id: report.id });
        broadcast({ type: 'report:new', report: serialize(report) });
        break;
      }

      case 'report:vote': {
        const r = reports.get(msg.id);
        if (!r) return send(ws, { type: 'error', message: '이미 사라진 제보예요.' });
        if (msg.kind !== 'confirm' && msg.kind !== 'gone') {
          return send(ws, { type: 'error', message: '알 수 없는 투표입니다.' });
        }
        // 한 사람은 둘 중 하나만
        const [target, other] = msg.kind === 'confirm' ? [r.confirms, r.gones] : [r.gones, r.confirms];
        other.delete(ws.id);
        if (target.has(ws.id)) target.delete(ws.id); // 다시 누르면 취소
        else target.add(ws.id);

        if (r.gones.size >= GONE_THRESHOLD) {
          reports.delete(r.id);
          broadcast({ type: 'report:expire', id: r.id });
        } else {
          broadcast({ type: 'report:update', report: serialize(r) });
        }
        break;
      }

      case 'forecast:subscribe': {
        // 내 위치 예보 구독: 위치가 바뀔 때마다 앱이 다시 보냄
        if (typeof msg.lat !== 'number' || typeof msg.lng !== 'number') {
          return send(ws, { type: 'error', message: '예보 위치가 올바르지 않습니다.' });
        }
        const grid = kma.toGrid(msg.lat, msg.lng);
        if (grid.nx < 1 || grid.nx > 149 || grid.ny < 1 || grid.ny > 253) {
          return send(ws, { type: 'forecast:local', error: '기상청 예보 범위(한반도) 밖의 위치예요.' });
        }
        ws.grid = grid;
        pushLocal(ws, true);
        break;
      }

      case 'ping':
        send(ws, { type: 'pong', t: Date.now() });
        break;

      default:
        send(ws, { type: 'error', message: `알 수 없는 타입: ${msg.type}` });
    }
  });

  ws.on('close', broadcastPresence);
  ws.on('error', () => {});
});

// ---------- 하트비트: 죽은 연결 정리 ----------
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

// ---------- 오래된 제보 만료 ----------
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [id, r] of reports) {
    if (now - r.createdAt > REPORT_TTL_MS) {
      reports.delete(id);
      broadcast({ type: 'report:expire', id });
    }
  }
}, 60 * 1000);

// ---------- 기상청 예보 ----------
let national = null; // { updatedAt, regions: [{ name, lat, lng, ...summary }] }

async function refreshNational() {
  const results = [];
  for (const r of REGIONS) { // 순차 호출: 초당 호출 제한 회피
    try {
      const { nx, ny } = kma.toGrid(r.lat, r.lng);
      const hours = await kma.getHourly(nx, ny);
      results.push({ ...r, ...kma.summarize(hours) });
    } catch (e) {
      results.push({ ...r, error: e.message });
    }
  }
  const next = { updatedAt: Date.now(), mock: kma.MOCK, regions: results };
  const changed = JSON.stringify(next.regions) !== JSON.stringify(national?.regions);
  national = next;
  if (changed) broadcast({ type: 'forecast:national', ...national });
}

// 클라이언트별 내 위치 예보 전송 (값이 바뀐 경우에만, force면 무조건)
async function pushLocal(ws, force = false) {
  if (!ws.grid) return;
  try {
    const hours = await kma.getHourly(ws.grid.nx, ws.grid.ny);
    const payload = { grid: ws.grid, hours, summary: kma.summarize(hours), mock: kma.MOCK };
    const sig = JSON.stringify(payload);
    if (!force && sig === ws.lastLocalSig) return;
    ws.lastLocalSig = sig;
    send(ws, { type: 'forecast:local', updatedAt: Date.now(), ...payload });
  } catch (e) {
    send(ws, { type: 'forecast:local', error: e.message });
  }
}

async function refreshAll() {
  await refreshNational();
  for (const ws of wss.clients) await pushLocal(ws); // 같은 격자는 캐시라 추가 호출 없음
}

refreshAll().catch((e) => console.error('forecast refresh failed:', e.message));
const forecastTimer = setInterval(() => refreshAll().catch((e) => console.error(e.message)), FORECAST_REFRESH_MS);

wss.on('close', () => { clearInterval(heartbeat); clearInterval(sweeper); clearInterval(forecastTimer); });

console.log(`❄️  snowweb server listening on ws://0.0.0.0:${PORT}`);
console.log(kma.MOCK ? '🌨️  기상청: KMA_API_KEY 없음 → mock 예보로 동작' : '🌨️  기상청 API 연동 활성화');
