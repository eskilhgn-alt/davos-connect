import { useState, useEffect, useCallback } from 'react';
import type { LocalUser } from '@/services/contracts';

const STORAGE_KEY = 'davos_current_user';

// Avatar color palette using design tokens
const AVATAR_COLORS = [
  'bg-primary',
  'bg-accent',
  'bg-secondary',
  'bg-muted',
] as const;

function generateUser(): LocalUser {
  const id = crypto.randomUUID();
  const colorIndex = Math.floor(Math.random() * AVATAR_COLORS.length);
  return {
    id,
    name: 'Meg',
    avatarColor: AVATAR_COLORS[colorIndex],
  };
}

function loadUser(): LocalUser {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  
  const newUser = generateUser();
  saveUser(newUser);
  return newUser;
}

function saveUser(user: LocalUser): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch (error) {
    console.error('Failed to save user:', error);
  }
}

export function useCurrentUser() {
  const [user, setUser] = useState<LocalUser>(loadUser);

  // Sync with localStorage on mount (in case of cross-tab changes)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setUser(JSON.parse(e.newValue));
        } catch {
          // Ignore parse errors
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const updateName = useCallback((newName: string) => {
    const trimmedName = newName.trim();
    if (!trimmedName) return;
    
    setUser(prev => {
      const updated = { ...prev, name: trimmedName };
      saveUser(updated);
      return updated;
    });
  }, []);

  const updateAvatarColor = useCallback((color: string) => {
    setUser(prev => {
      const updated = { ...prev, avatarColor: color };
      saveUser(updated);
      return updated;
    });
  }, []);

  return {
    user,
    updateName,
    updateAvatarColor,
    isCurrentUser: (userId: string) => user.id === userId,
  };
}
