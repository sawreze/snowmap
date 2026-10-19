// 개발 PC의 내부 IP로 바꾸세요. (휴대폰과 PC가 같은 Wi-Fi여야 함)
// Android 에뮬레이터: ws://10.0.2.2:8080 / iOS 시뮬레이터: ws://localhost:8080
export const WS_URL = 'ws://192.168.0.10:8080';

export const LEVELS = [
  { value: 0, label: '눈 없음', emoji: '☁️', color: '#94A3B8' },
  { value: 1, label: '약간', emoji: '🌨️', color: '#60A5FA' },
  { value: 2, label: '쌓임', emoji: '❄️', color: '#2563EB' },
  { value: 3, label: '폭설', emoji: '☃️', color: '#7C3AED' },
];

export const ROADS = [
  { value: 'clear', label: '양호' },
  { value: 'wet', label: '젖음' },
  { value: 'slushy', label: '질척' },
  { value: 'icy', label: '빙판' },
  { value: 'blocked', label: '통제' },
];

export const levelOf = (v) => LEVELS.find((l) => l.value === v) || LEVELS[0];
export const roadOf = (v) => ROADS.find((r) => r.value === v) || ROADS[0];
