import Constants from 'expo-constants';

// 서버 주소 자동 감지:
// `npm start`로 띄우면 Expo 개발 서버가 돌고 있는 PC의 IP(hostUri)를 그대로 써서
// 같은 PC의 8080 포트 WebSocket 서버에 붙습니다. (휴대폰과 PC는 같은 Wi-Fi)
// 배포 서버를 쓸 때는 EXPO_PUBLIC_WS_URL=wss://도메인 으로 덮어쓰기
const WS_PORT = 8080;
const devHost = (Constants.expoConfig?.hostUri || '').split(':')[0];

export const WS_URL =
  process.env.EXPO_PUBLIC_WS_URL || (devHost ? `ws://${devHost}:${WS_PORT}` : `ws://localhost:${WS_PORT}`);

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
