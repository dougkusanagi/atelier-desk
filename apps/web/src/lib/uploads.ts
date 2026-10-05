import { useEffect, useRef, useState } from 'react';
import { type BoardDocument, type Point, type CardType } from '@atelier/domain';
import { getCsrf } from './api';
import { cache } from './cache';
import { useCanvas } from '../features/canvas/state';
type Upload = {
  id: string;
  cardId: string;
  name: string;
  progress: number;
  status: 'queued' | 'uploading' | 'ready' | 'failed';
  blob: File;
};
export function useUploads(board: BoardDocument | null, boardId: string, userId: string) {
  const [uploads, setUploads] = useState<Upload[]>([]),
    active = useRef(new Set<string>());
  const key = userId + ':uploads:' + boardId;
  const patch = (assetId: string, changes: Partial<Upload>) =>
    setUploads((current) =>
      current.map((item) => (item.id === assetId ? { ...item, ...changes } : item)),
    );
  async function send(item: Upload) {
    if (!board || active.current.has(item.id) || !navigator.onLine) return;
    active.current.add(item.id);
    patch(item.id, { status: 'uploading' });
    const request = new XMLHttpRequest();
    request.open('POST', '/api/v1/assets/uploads?boardId=' + boardId + '&assetId=' + item.id);
    request.setRequestHeader('X-CSRF-Token', getCsrf());
    request.upload.onprogress = (e) => {
      if (e.lengthComputable) patch(item.id, { progress: Math.round((e.loaded / e.total) * 100) });
    };
    request.onload = () => {
      active.current.delete(item.id);
      try {
        const result = JSON.parse(request.responseText);
        if (request.status >= 400) throw new Error(result.message ?? 'Falha no envio');
        const type: CardType = result.mime.startsWith('image/')
          ? 'image'
          : result.mime.startsWith('audio/') || result.mime.startsWith('video/')
            ? 'media'
            : 'file';
        board.patch(item.cardId, {
          type,
          width: type === 'image' ? 320 : 280,
          height:
            type === 'image' && result.width && result.height
              ? Math.max(120, (320 * result.height) / result.width + 48)
              : 220,
          content: {
            assetId: result.id,
            filename: result.filename,
            mime: result.mime,
            bytes: result.bytes,
            uploadState: 'ready',
            mediaKind: result.mime.startsWith('audio/') ? 'audio' : 'video',
          },
        });
        patch(item.id, { status: 'ready', progress: 100 });
        void cache.delete('metadata', key + ':' + item.id);
      } catch (error) {
        patch(item.id, { status: 'failed' });
        board.patch(item.cardId, { content: { uploadState: 'failed' } });
        useCanvas.getState().notify(error instanceof Error ? error.message : 'Falha no envio');
      }
    };
    request.onerror = () => {
      active.current.delete(item.id);
      patch(item.id, { status: 'queued' });
      board.patch(item.cardId, { content: { uploadState: 'pending' } });
    };
    const form = new FormData();
    form.append('file', item.blob, item.name);
    request.send(form);
  }
  useEffect(() => {
    const online = () =>
      uploads.filter((u) => u.status === 'queued').forEach((item) => void send(item));
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [uploads, board, boardId]);
  const upload = async (files: File[], point: Point, replaceId?: string) => {
    if (!board) return;
    for (const [index, file] of files.entries()) {
      const type: CardType = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('audio/') || file.type.startsWith('video/')
          ? 'media'
          : 'file';
      const cardId =
        replaceId ??
        board.add(type, {
          x: point.x + (index % 3) * 344,
          y: point.y + Math.floor(index / 3) * 284,
        });
      const item: Upload = {
        id: crypto.randomUUID(),
        cardId,
        name: file.name,
        progress: 0,
        status: 'queued',
        blob: file,
      };
      board.patch(cardId, { content: { filename: file.name, uploadState: 'pending' } });
      try {
        await cache.put('metadata', key + ':' + item.id, item);
      } catch {
        useCanvas
          .getState()
          .notify('Sem espaço local para este arquivo. Mantenha a página aberta até o envio.');
      }
      setUploads((current) => [...current, item]);
      await send(item);
    }
  };
  return {
    uploads,
    upload,
    retry: (assetId: string) => {
      const item = uploads.find((u) => u.id === assetId);
      if (item) void send(item);
    },
  };
}
