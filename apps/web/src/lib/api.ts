export class RequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
let csrf = '';
export const setCsrf = (value: string) => {
  csrf = value;
};
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api/v1' + url, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...options.headers,
    },
  });
  const result = await response.json();
  if (!response.ok)
    throw new RequestError(
      response.status,
      result.code ?? 'REQUEST_FAILED',
      result.message ?? 'Não foi possível concluir.',
    );
  return result as T;
}
export type User = {
  id: string;
  email: string;
  displayName: string;
  verified: boolean;
  preferences?: Record<string, unknown>;
};
export type BoardMeta = {
  id: string;
  workspace_id: string;
  owner_id: string;
  parent_id: string | null;
  title: string;
  description: string;
  icon: string;
  role: 'owner' | 'editor' | 'commenter' | 'viewer';
  favorite: boolean;
  kind: string;
  version: number;
  deleted_at?: string;
  updated_at: string;
};
export type Workspace = { id: string; name: string; role: string };
export const encode = (value: Uint8Array) => {
  let result = '';
  for (const byte of value) result += String.fromCharCode(byte);
  return btoa(result);
};
export const decode = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
export function download(name: string, data: Blob | string, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
