import { useState, useCallback } from 'react';
import { UserProfile } from '../types';
import {
  loadProfiles,
  saveProfile,
  deleteProfile,
  getCurrentUserId,
  setCurrentUserId,
  migrateLegacyReceipts,
} from '../utils/storage';

export function useProfiles() {
  const [profiles, setProfiles] = useState<UserProfile[]>(() => loadProfiles());
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(
    () => getCurrentUserId(),
  );

  const currentUser = profiles.find((p) => p.id === currentUserId) ?? null;

  const addProfile = useCallback((profile: UserProfile) => {
    saveProfile(profile);
    setProfiles(loadProfiles());
  }, []);

  const removeProfile = useCallback((id: string) => {
    deleteProfile(id);
    const remaining = loadProfiles();
    setProfiles(remaining);
    // If deleted profile was current, clear selection
    if (getCurrentUserId() === id) {
      localStorage.removeItem('smartreceipt_current_user');
      setCurrentUserIdState(null);
    }
  }, []);

  const switchUser = useCallback((id: string) => {
    setCurrentUserId(id);
    setCurrentUserIdState(id);
  }, []);

  // Called once when a brand-new profile is selected for the first time
  const selectUserAndMigrate = useCallback((id: string) => {
    migrateLegacyReceipts(id);
    switchUser(id);
  }, [switchUser]);

  return {
    profiles,
    currentUserId,
    currentUser,
    addProfile,
    removeProfile,
    switchUser,
    selectUserAndMigrate,
  };
}
