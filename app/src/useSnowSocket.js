import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * snowweb 서버와 양방향으로 통신하는 훅
 * - 자동 재연결(지수 백오프, 최대 15초)
 * - 앱이 포그라운드로 돌아오면 즉시 재연결
 * - 연결 전 보낸 메시지는 큐에 쌓았다가 연결되면 전송
 */
export function useSnowSocket(url, nickname) {
  const wsRef = useRef(null);
  const queueRef = useRef([]);
  const retryRef = useRef(0);
  const timerRef = useRef(null);
  const aliveRef = useRef(true);
  const nickRef = useRef(nickname);
  nickRef.current = nickname;

  const [status, setStatus] = useState('connecting'); // connecting | open | closed
  const [clientId, setClientId] = useState(null);
  const [reports, setReports] = useState([]);
  const [online, setOnline] = useState(0);
  const [lastError, setLastError] = useState(null);

  const rawSend = (obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  };

  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'welcome':
        setClientId(msg.clientId);
        setReports(msg.reports);
        break;
      case 'presence':
        setOnline(msg.count);
        break;
      case 'report:new':
        setReports((prev) => [msg.report, ...prev.filter((r) => r.id !== msg.report.id)]);
        break;
      case 'report:update':
        setReports((prev) => prev.map((r) => (r.id === msg.report.id ? msg.report : r)));
        break;
      case 'report:expire':
        setReports((prev) => prev.filter((r) => r.id !== msg.id));
        break;
      case 'error':
        setLastError({ message: msg.message, at: Date.now() });
        break;
      default:
        break;
    }
  }, []);

  const connect = useCallback(() => {
    if (!aliveRef.current) return;
    const cur = wsRef.current;
    if (cur && (cur.readyState === WebSocket.OPEN || cur.readyState === WebSocket.CONNECTING)) return;

    setStatus('connecting');
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryRef.current = 0;
      setStatus('open');
      ws.send(JSON.stringify({ type: 'hello', nickname: nickRef.current }));
      const pending = queueRef.current;
      queueRef.current = [];
      pending.forEach((m) => ws.send(JSON.stringify(m)));
    };

    ws.onmessage = (e) => {
      try {
        handleMessage(JSON.parse(e.data));
      } catch {
        /* 무시 */
      }
    };

    ws.onerror = () => {
      /* onclose에서 재연결 처리 */
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      setStatus('closed');
      if (!aliveRef.current) return;
      const delay = Math.min(15000, 1000 * 2 ** retryRef.current);
      retryRef.current += 1;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(connect, delay);
    };
  }, [url, handleMessage]);

  useEffect(() => {
    aliveRef.current = true;
    connect();

    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        retryRef.current = 0;
        clearTimeout(timerRef.current);
        connect();
      }
    });

    return () => {
      aliveRef.current = false;
      clearTimeout(timerRef.current);
      sub.remove();
      wsRef.current?.close();
    };
  }, [connect]);

  // 닉네임이 바뀌면 서버에 알림
  useEffect(() => {
    rawSend({ type: 'hello', nickname });
  }, [nickname]);

  const send = useCallback((obj) => {
    if (!rawSend(obj)) queueRef.current.push(obj);
  }, []);

  const createReport = useCallback(
    (payload) => send({ type: 'report:create', ref: String(Date.now()), payload }),
    [send]
  );

  const vote = useCallback((id, kind) => send({ type: 'report:vote', id, kind }), [send]);

  return { status, clientId, reports, online, lastError, createReport, vote };
}
