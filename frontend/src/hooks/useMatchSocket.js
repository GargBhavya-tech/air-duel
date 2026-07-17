import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4000';

export function useMatchSocket() {
  const [match, setMatch] = useState(null);
  const [aiName, setAiName] = useState('AI');
  const [endInfo, setEndInfo] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'state') {
        setMatch(msg.match);
        setAiName(msg.aiName);
      }
      if (msg.type === 'end') {
        setEndInfo({ reason: msg.reason, match: msg.match });
      }
    };

    return () => ws.close();
  }, []);

  const sendMove = useCallback((move) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'move', move }));
    }
  }, []);

  const startMatch = useCallback(() => {
    setEndInfo(null);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'start' }));
    }
  }, []);

  return { match, aiName, endInfo, connected, sendMove, startMatch };
}
