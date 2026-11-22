// S39O-cs-settings: API key 与识别开关的本地设置，默认只活在本标签页。
// 实现 读写 sessionStorage（默认）或 localStorage（用户显式选择记住），提供 key 是否可用的查询。
// 原理 key 一旦被持久化就长期暴露在浏览器的明文存储里，所以默认不持久；
// 只有用户主动勾选「记住」才写 localStorage，且界面上明确告知。
import { useCallback, useEffect, useState } from 'react';

const KEY_SESSION = 'caloriesnap:apikey:session';
const KEY_REMEMBER = 'caloriesnap:apikey:remembered';
const FLAG_REMEMBER = 'caloriesnap:apikey:persist';

function readKey(): string {
  try {
    return localStorage.getItem(KEY_REMEMBER)?.trim() || sessionStorage.getItem(KEY_SESSION)?.trim() || '';
  } catch {
    return '';
  }
}

function readPersist(): boolean {
  try {
    return localStorage.getItem(FLAG_REMEMBER) === '1';
  } catch {
    return false;
  }
}

export interface SettingsApi {
  apiKey: string;
  hasKey: boolean;
  persist: boolean;
  setApiKey: (key: string, persist: boolean) => void;
  clearKey: () => void;
}

export function useSettings(): SettingsApi {
  const [apiKey, setKey] = useState<string>(() => readKey());
  const [persist, setPersist] = useState<boolean>(() => readPersist());

  useEffect(() => {
    setKey(readKey());
    setPersist(readPersist());
  }, []);

  const setApiKey = useCallback((key: string, shouldPersist: boolean) => {
    const trimmed = key.trim();
    try {
      if (shouldPersist) {
        localStorage.setItem(KEY_REMEMBER, trimmed);
        localStorage.setItem(FLAG_REMEMBER, '1');
        sessionStorage.removeItem(KEY_SESSION);
      } else {
        sessionStorage.setItem(KEY_SESSION, trimmed);
        localStorage.removeItem(KEY_REMEMBER);
        localStorage.setItem(FLAG_REMEMBER, '0');
      }
    } catch (e) {
      console.error('[settings] 保存 key 失败', e);
    }
    setKey(trimmed);
    setPersist(shouldPersist);
  }, []);

  const clearKey = useCallback(() => {
    try {
      localStorage.removeItem(KEY_REMEMBER);
      localStorage.removeItem(FLAG_REMEMBER);
      sessionStorage.removeItem(KEY_SESSION);
    } catch (e) {
      console.error('[settings] 清除 key 失败', e);
    }
    setKey('');
    setPersist(false);
  }, []);

  return { apiKey, hasKey: apiKey.length > 0, persist, setApiKey, clearKey };
}
