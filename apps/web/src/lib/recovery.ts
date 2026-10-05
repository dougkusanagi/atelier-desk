import * as Y from 'yjs';
import { BoardDocument } from '@atelier/domain';
import { cache } from './cache';
import { decode, download } from './api';
export async function accountHasPending(userId: string) {
  const commands = await cache.entries<unknown[]>('outbox', userId + ':');
  const uploads = await cache.entries('metadata', userId + ':uploads:');
  return commands.some((queue) => queue.length > 0) || uploads.length > 0;
}
export async function downloadRecovery(userId: string) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const documents = await cache.records<{ update: string; epoch: number }>(
    'documents',
    userId + ':',
  );
  for (const { key, value } of documents) {
    const board = new BoardDocument();
    try {
      Y.applyUpdate(board.doc, decode(value.update));
      zip.file(
        'quadros/' + key.slice(userId.length + 1) + '.json',
        JSON.stringify({ atelier: 1, ...board.snapshot() }, null, 2),
      );
      zip.file(
        'documentos-causais/' + key.slice(userId.length + 1) + '.json',
        JSON.stringify(value),
      );
    } finally {
      board.destroy();
    }
  }
  for (const upload of await cache.entries<{ id: string; name: string; blob: File }>(
    'metadata',
    userId + ':uploads:',
  )) {
    zip.file(
      'arquivos-pendentes/' +
        upload.id +
        '-' +
        upload.name
          .replace(/[\\/]/g, '_')
          .split('')
          .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
          .join(''),
      upload.blob,
    );
  }
  zip.file(
    'LEIA-ME.txt',
    'Cópia de recuperação do Atelier Desk.\nOs arquivos em quadros/ contêm cartões e conexões; copie o JSON no clipboard e cole no canvas de um quadro novo (até 1.000 cartões por seleção).\nReenvie os arquivos pendentes pela ferramenta Arquivo ou Imagem.\nOs documentos causais preservam os dados originais para recuperação técnica.\nEsta cópia não inclui arquivos remotos nem altera sua conta.\n',
  );
  download(
    'recuperacao-atelier.zip',
    await zip.generateAsync({ type: 'blob', compression: 'STORE' }),
  );
}
