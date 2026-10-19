// 서버 동작 확인용: 두 클라이언트가 접속해 제보/투표가 양쪽에 실시간 전달되는지 확인
const WebSocket = require('ws');
const URL = process.env.WS_URL || 'ws://localhost:8080';

const open = (name) =>
  new Promise((resolve) => {
    const ws = new WebSocket(URL);
    ws.log = [];
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      ws.log.push(m);
      console.log(`[${name}] <-`, m.type, m.report ? `${m.report.id.slice(0, 8)} c=${m.report.confirms}` : m.message || m.count || '');
    });
    ws.on('open', () => resolve(ws));
  });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const a = await open('A');
  const b = await open('B');
  a.send(JSON.stringify({ type: 'hello', nickname: '눈사람' }));
  await wait(100);

  a.send(JSON.stringify({ type: 'report:create', ref: 'r1', payload: { lat: 37.5665, lng: 126.978, level: 2, road: 'icy', note: '시청 앞 빙판' } }));
  await wait(200);

  const created = b.log.find((m) => m.type === 'report:new');
  if (!created) throw new Error('B가 새 제보를 못 받음');
  b.send(JSON.stringify({ type: 'report:vote', id: created.report.id, kind: 'confirm' }));
  await wait(200);

  a.send(JSON.stringify({ type: 'report:create', payload: { lat: 37.5, lng: 127, level: 1, road: 'wet' } }));
  await wait(200);

  const updated = a.log.find((m) => m.type === 'report:update');
  const limited = a.log.find((m) => m.type === 'error');
  console.log('\n결과:', {
    B가_새제보_수신: !!created,
    A가_확인투표_반영수신: updated?.report.confirms === 1,
    도배방지_동작: !!limited,
  });
  a.close(); b.close();
  process.exit(created && updated && limited ? 0 : 1);
})();
