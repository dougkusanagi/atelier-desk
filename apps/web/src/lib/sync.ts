import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { BoardDocument } from '@atelier/domain';
import { api, decode, encode, RequestError, type BoardMeta, type User } from './api';
import { cache } from './cache';
export type Presence = {
  clientId: string;
  user: { id: string; name: string };
  x: number;
  y: number;
  selection: string[];
  updatedAt: number;
};
export type SaveState = 'loading' | 'saving' | 'saved' | 'offline' | 'failed' | 'denied';
type Bootstrap = { board: BoardMeta; update: string; epoch: number; sequence: number };
export function useBoardSync(boardId: string, user: User) {
  const [board, setBoard] = useState<BoardDocument | null>(null),
    [meta, setMeta] = useState<BoardMeta | null>(null);
  const [status, setStatus] = useState<SaveState>('loading'),
    [error, setError] = useState<string | null>(null),
    [presence, setPresence] = useState<Presence[]>([]);
  const socket = useRef<WebSocket | null>(null),
    retry = useRef(() => {}),
    epochRef = useRef(1),
    lastPresence = useRef(0);
  useEffect(() => {
    let disposed = false,
      authorized = false,
      reconnectTimer: ReturnType<typeof setTimeout> | undefined,
      flushTimer: ReturnType<typeof setTimeout> | undefined;
    let retryCount = 0,
      clientId = '',
      localUpdates: Uint8Array[] = [];
    const key = user.id + ':' + boardId,
      doc = new Y.Doc({ gc: false }),
      document = new BoardDocument(doc);
    const persistence = new IndexeddbPersistence('atelier:' + key, doc);
    const pending = new Map<string, { update: string; epoch: number; updateId: string }>();
    const persist = async () => {
      try {
        await cache.put('documents', key, {
          update: encode(Y.encodeStateAsUpdate(doc)),
          epoch: epochRef.current,
        });
        return true;
      } catch {
        if (!disposed) {
          setStatus('failed');
          setError(
            'O armazenamento local está cheio ou indisponível. Exporte seu trabalho antes de fechar.',
          );
        }
        return false;
      }
    };
    const flush = async () => {
      if (!localUpdates.length) return;
      const update = Y.mergeUpdates(localUpdates);
      localUpdates = [];
      const message = {
        update: encode(update),
        epoch: epochRef.current,
        updateId: crypto.randomUUID(),
      };
      pending.set(message.updateId, message);
      try {
        await cache.put('outbox', key, [...pending.values()]);
      } catch {
        setStatus('failed');
        return;
      }
      const durable = await persist();
      if (disposed) return;
      if (navigator.onLine && authorized && socket.current?.readyState === 1) {
        setStatus('saving');
        socket.current.send(JSON.stringify({ type: 'update', ...message }));
      } else if (durable) setStatus('offline');
    };
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote' || origin === 'bootstrap' || origin === persistence || disposed)
        return;
      localUpdates.push(update);
      setStatus('saving');
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(() => void flush(), 150);
    };
    const connect = async () => {
      if (disposed) return;
      try {
        const bootstrap = await api<Bootstrap>('/boards/' + boardId + '/bootstrap');
        if (disposed) return;
        const cached = await cache.get<{ epoch: number }>('documents', key);
        if (cached && cached.epoch !== bootstrap.epoch) {
          setStatus('denied');
          setError(
            'Este quadro foi renovado. Exporte a cópia local antes de carregar a versão atual.',
          );
          setMeta({ ...bootstrap.board, role: 'viewer' });
          return;
        }
        epochRef.current = bootstrap.epoch;
        setMeta(bootstrap.board);
        authorized = ['owner', 'editor'].includes(bootstrap.board.role);
        await cache.put('metadata', key, bootstrap.board);
        Y.applyUpdate(doc, decode(bootstrap.update), 'bootstrap');
        setBoard(document);
        const url = new URL('/collab/' + boardId, window.location.href);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(url);
        socket.current = ws;
        ws.onmessage = (event) => {
          const message = JSON.parse(event.data) as Record<string, unknown>;
          if (message.type === 'sync') {
            clientId = message.clientId as string;
            epochRef.current = message.epoch as number;
            retryCount = 0;
            Y.applyUpdate(doc, decode(message.update as string), 'remote');
            if (authorized) {
              const remote = new Y.Doc();
              Y.applyUpdate(remote, decode(message.update as string));
              const diff = Y.encodeStateAsUpdate(doc, Y.encodeStateVector(remote));
              remote.destroy();
              if (diff.length > 2) {
                const updateId = crypto.randomUUID(),
                  item = { update: encode(diff), epoch: epochRef.current, updateId };
                pending.clear();
                pending.set(updateId, item);
                ws.send(JSON.stringify({ type: 'update', ...item }));
                setStatus('saving');
              } else {
                pending.clear();
                setStatus('saved');
                void cache.delete('outbox', key);
              }
            } else setStatus('saved');
            void persist();
          } else if (message.type === 'update') {
            Y.applyUpdate(doc, decode(message.update as string), 'remote');
            void persist();
          } else if (message.type === 'ack') {
            pending.delete(message.updateId as string);
            void cache.put('outbox', key, [...pending.values()]);
            if (!pending.size && !localUpdates.length) setStatus('saved');
          } else if (message.type === 'presence' && message.clientId !== clientId) {
            const next = { ...message, updatedAt: Date.now() } as unknown as Presence;
            setPresence((current) => [
              ...current.filter(
                (p) => p.clientId !== next.clientId && Date.now() - p.updatedAt < 60000,
              ),
              next,
            ]);
          } else if (message.type === 'leave')
            setPresence((current) => current.filter((p) => p.clientId !== message.clientId));
          else if (message.type === 'error') {
            setError(message.message as string);
            setStatus(
              ['FORBIDDEN', 'NOT_FOUND', 'STALE_DOCUMENT', 'ACCESS_REVOKED'].includes(
                message.code as string,
              )
                ? 'denied'
                : 'failed',
            );
          }
        };
        ws.onclose = () => {
          if (disposed) return;
          socket.current = null;
          setPresence([]);
          setStatus((current) => (current === 'denied' ? 'denied' : 'offline'));
          reconnectTimer = setTimeout(
            () => void connect(),
            Math.min(30000, 1000 * 2 ** retryCount++),
          );
        };
        ws.onerror = () => ws.close();
      } catch (error) {
        if (disposed) return;
        const cached = await cache.get<BoardMeta>('metadata', key).catch(() => undefined);
        if (error instanceof RequestError && [401, 403, 404].includes(error.status)) {
          setStatus('denied');
          setError('Seu acesso foi alterado. A cópia local está preservada para recuperação.');
          if (cached) setMeta({ ...cached, role: 'viewer' });
          setBoard(document);
          return;
        }
        if (cached) {
          setMeta(cached);
          setBoard(document);
          setStatus('offline');
        } else {
          setStatus('failed');
          setError(error instanceof Error ? error.message : 'Não foi possível abrir o quadro.');
        }
        reconnectTimer = setTimeout(
          () => void connect(),
          Math.min(30000, 1000 * 2 ** retryCount++),
        );
      }
    };
    const start = async () => {
      try {
        await persistence.whenSynced;
        const cached = await cache.get<{ update: string; epoch: number }>('documents', key);
        if (cached) {
          Y.applyUpdate(doc, decode(cached.update), 'bootstrap');
          epochRef.current = cached.epoch;
        }
        const queue = await cache.get<Array<{ update: string; epoch: number; updateId: string }>>(
          'outbox',
          key,
        );
        queue?.forEach((item) => pending.set(item.updateId, item));
      } catch {
        setError('Armazenamento local indisponível. As alterações exigem conexão.');
      }
      if (disposed) return;
      doc.on('update', onUpdate);
      await connect();
    };
    retry.current = () => {
      clearTimeout(reconnectTimer);
      void connect();
    };
    void start();
    const online = () => retry.current(),
      offline = () => {
        socket.current?.close();
        if (localUpdates.length) {
          setStatus('saving');
          void flush();
        } else setStatus('offline');
      };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    const ping = setInterval(() => {
      if (socket.current?.readyState === 1) socket.current.send(JSON.stringify({ type: 'ping' }));
    }, 20000);
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      clearTimeout(flushTimer);
      clearInterval(ping);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      doc.off('update', onUpdate);
      socket.current?.close();
      socket.current = null;
      void flush().finally(() => {
        void persistence.destroy();
        document.destroy();
      });
    };
  }, [boardId, user.id]);
  const sendPresence = (point: { x: number; y: number }, selection: string[]) => {
    if (Date.now() - lastPresence.current < 50 || socket.current?.readyState !== 1) return;
    lastPresence.current = Date.now();
    socket.current.send(JSON.stringify({ type: 'presence', ...point, selection }));
  };
  return {
    board,
    meta,
    status,
    error,
    presence,
    sendPresence,
    retry: () => retry.current(),
    setMeta,
  };
}
