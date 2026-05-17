import { useEffect, useState } from 'react';
import { loadValue, restoreLatestBackup, saveAutoBackup, saveValue, setRecoveryNotice, STORAGE_CHANGE_EVENT } from '../storage';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const readValue = (): T => {
    try {
      return loadValue<T>(key, initialValue);
    } catch (error) {
      console.error('[VD_LOCAL_STORAGE_READ_ERROR]', { error, key });
      const restored = restoreLatestBackup();
      if (restored) {
        setRecoveryNotice('检测到本地数据异常，已自动从最近备份恢复。');
        try {
          return loadValue<T>(key, initialValue);
        } catch (retryError) {
          console.error('[VD_LOCAL_STORAGE_RECOVERY_READ_ERROR]', { error: retryError, key });
          return initialValue;
        }
      }
      return initialValue;
    }
  };

  const [value, setValue] = useState<T>(readValue);

  useEffect(() => {
    saveValue(key, value);
    saveAutoBackup();
  }, [key, value]);

  useEffect(() => {
    function syncValue() {
      const nextValue = readValue();
      setValue((currentValue) => (JSON.stringify(currentValue) === JSON.stringify(nextValue) ? currentValue : nextValue));
    }

    window.addEventListener(STORAGE_CHANGE_EVENT, syncValue);
    window.addEventListener('storage', syncValue);
    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, syncValue);
      window.removeEventListener('storage', syncValue);
    };
  }, [key]);

  return [value, setValue] as const;
}
