// 기상청 단기예보 조회서비스 (공공데이터포털 VilageFcstInfoService_2.0) 연동
// - API 키는 서버 환경변수 KMA_API_KEY 에만 보관 (앱에 절대 넣지 않음)
// - KMA_API_KEY 가 없으면 가짜 데이터(mock)로 동작해서 개발/테스트 가능
const BASE_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
const API_KEY = process.env.KMA_API_KEY || '';
const MOCK = !API_KEY || process.env.KMA_MOCK === '1';

// ---------------- 위경도 -> 기상청 격자(nx, ny) 변환 (LCC DFS) ----------------
function toGrid(lat, lng) {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD, olon = OLON * DEGRAD, olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

// ---------------- 발표시각 계산 (KST 기준) ----------------
const pad = (n) => String(n).padStart(2, '0');
function kstParts(date = new Date()) {
  const k = new Date(date.getTime() + 9 * 3600 * 1000);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(), h: k.getUTCHours(), min: k.getUTCMinutes(), ts: k };
}
const ymd = (p) => `${p.y}${pad(p.m)}${pad(p.d)}`;
const shift = (date, minutes) => new Date(date.getTime() + minutes * 60000);

// 단기예보: 02,05,08,11,14,17,20,23시 발표, 발표 후 약 10분 뒤부터 제공
function vilageBase(now = new Date()) {
  const t = shift(now, -15); // 제공 지연 여유
  const p = kstParts(t);
  const hours = [2, 5, 8, 11, 14, 17, 20, 23];
  let h = [...hours].reverse().find((x) => x <= p.h);
  if (h === undefined) {
    const y = kstParts(shift(t, -24 * 60));
    return { base_date: ymd(y), base_time: '2300' };
  }
  return { base_date: ymd(p), base_time: `${pad(h)}00` };
}

// 초단기예보: 매시 30분 발표, 약 45분 이후 제공
function ultraBase(now = new Date()) {
  const p = kstParts(shift(now, -45));
  return { base_date: ymd(p), base_time: `${pad(p.h)}30` };
}

// ---------------- 코드 해석 ----------------
const PTY = { 0: '없음', 1: '비', 2: '비/눈', 3: '눈', 4: '소나기', 5: '빗방울', 6: '빗방울눈날림', 7: '눈날림' };
const isSnowPty = (c) => [2, 3, 6, 7].includes(Number(c));

// SNO 값: "적설없음" | "0.5cm" | "1.0cm 미만" | "1.0~4.9cm" | "5.0cm 이상" 등 -> 대략 cm
function parseSno(v) {
  if (v == null) return 0;
  const s = String(v);
  if (s.includes('없음')) return 0;
  const nums = s.match(/[\d.]+/g);
  if (!nums) return 0;
  const n = Number(nums[nums.length - 1]);
  if (s.includes('미만')) return Math.min(n, 0.5);
  return n;
}

// ---------------- 호출 ----------------
async function call(op, params) {
  // 공공데이터포털 키는 "Encoding 키"를 받으면 그대로, "Decoding 키"면 인코딩해서 붙임
  const key = API_KEY.includes('%') ? API_KEY : encodeURIComponent(API_KEY);
  const qs = new URLSearchParams({ pageNo: '1', numOfRows: '1000', dataType: 'JSON', ...params }).toString();
  const res = await fetch(`${BASE_URL}/${op}?serviceKey=${key}&${qs}`, { signal: AbortSignal.timeout(10000) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // 키 오류 등은 XML로 옴
    const msg = (text.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>/) || text.match(/<resultMsg>(.*?)<\/resultMsg>/) || [])[1];
    throw new Error(`기상청 응답 오류: ${msg || res.status}`);
  }
  const h = json?.response?.header;
  if (h?.resultCode !== '00') throw new Error(`기상청 오류 ${h?.resultCode}: ${h?.resultMsg}`);
  return json.response.body.items.item || [];
}

// fcstDate+fcstTime 별로 묶기
function groupByTime(items) {
  const map = new Map();
  for (const it of items) {
    const k = `${it.fcstDate}${it.fcstTime}`;
    if (!map.has(k)) map.set(k, { time: k });
    map.get(k)[it.category] = it.fcstValue;
  }
  return [...map.values()].sort((a, b) => a.time.localeCompare(b.time));
}

// ---------------- mock ----------------
function mockHours(nx, ny) {
  const p = kstParts();
  const out = [];
  const seed = (nx * 31 + ny * 17) % 10; // 격자마다 다른 결과
  for (let i = 1; i <= 24; i++) {
    const t = kstParts(shift(new Date(), i * 60));
    const snowing = seed >= 5 && i >= seed && i <= seed + 6;
    out.push({
      time: `${ymd(t)}${pad(t.h)}00`,
      pty: snowing ? 3 : 0,
      sno: snowing ? Math.round(((i - seed) % 4) * 0.5 * 10) / 10 + 0.5 : 0,
      pop: snowing ? 70 + ((i * 7) % 30) : (i * 13) % 30,
      tmp: -3 + ((i + seed) % 5),
    });
  }
  void p;
  return out;
}

// ---------------- 공개 함수: 격자의 향후 24시간 시간별 예보 ----------------
const cache = new Map(); // `${nx},${ny}` -> { key, data }

async function getHourly(nx, ny) {
  const vb = vilageBase();
  const ub = ultraBase();
  const cacheKey = `${vb.base_date}${vb.base_time}|${ub.base_date}${ub.base_time}`;
  const id = `${nx},${ny}`;
  const hit = cache.get(id);
  if (hit && hit.key === cacheKey) return hit.data; // 발표시각이 그대로면 재호출 안 함

  let hours;
  if (MOCK) {
    hours = mockHours(nx, ny);
  } else {
    const [vil, ultra] = await Promise.all([
      call('getVilageFcst', { ...vb, nx, ny }),
      call('getUltraSrtFcst', { ...ub, nx, ny }).catch(() => []), // 초단기는 실패해도 단기예보로 진행
    ]);
    const vMap = new Map(groupByTime(vil).map((r) => [r.time, r]));
    // 가까운 6시간은 더 정확한 초단기예보(PTY, T1H)로 덮어쓰기
    for (const u of groupByTime(ultra)) {
      const r = vMap.get(u.time) || { time: u.time };
      if (u.PTY != null) r.PTY = u.PTY;
      if (u.T1H != null) r.TMP = u.T1H;
      vMap.set(u.time, r);
    }
    const nowKey = (() => { const p = kstParts(); return `${ymd(p)}${pad(p.h)}00`; })();
    hours = [...vMap.values()]
      .filter((r) => r.time >= nowKey)
      .slice(0, 24)
      .map((r) => ({
        time: r.time,
        pty: Number(r.PTY ?? 0),
        sno: parseSno(r.SNO),
        pop: Number(r.POP ?? 0),
        tmp: r.TMP != null ? Number(r.TMP) : null,
      }));
  }

  cache.set(id, { key: cacheKey, data: hours });
  return hours;
}

// 시간별 예보 -> 눈 요약
function summarize(hours) {
  const snowHours = hours.filter((h) => isSnowPty(h.pty) || h.sno > 0);
  const totalSno = Math.round(hours.reduce((s, h) => s + h.sno, 0) * 10) / 10;
  return {
    willSnow: snowHours.length > 0,
    start: snowHours[0]?.time || null,
    end: snowHours[snowHours.length - 1]?.time || null,
    totalSno,
    maxPop: snowHours.reduce((m, h) => Math.max(m, h.pop), 0),
  };
}

module.exports = { toGrid, getHourly, summarize, PTY, isSnowPty, vilageBase, ultraBase, MOCK };
