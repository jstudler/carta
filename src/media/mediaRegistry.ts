/**
 * Media registry — enforces the global "only one group plays at a time" rule.
 *
 * Every item that owns audio-bearing media gets one SyncGroup. When a group
 * starts playing it asks the registry to pause every OTHER group, and the
 * registry records the active group in the store (so global pause/mute and the
 * canvas focus logic can react). Items in the same group keep playing together.
 */

import { SyncGroup } from './syncGroup';
import { useStore } from '../store';

const groups = new Map<string, SyncGroup>();

export const mediaRegistry = {
  /** Get (or lazily create) the SyncGroup for an item. */
  group(itemId: string): SyncGroup {
    let g = groups.get(itemId);
    if (!g) {
      g = new SyncGroup(itemId);
      g.onPlay(() => mediaRegistry.notifyPlaying(itemId));
      g.onEnded(() => {
        if (useStore.getState().playingGroupId === itemId) {
          useStore.getState().setPlayingGroup(null);
        }
      });
      groups.set(itemId, g);
    }
    return g;
  },

  /** A group started playing: pause all others and record the active group. */
  notifyPlaying(itemId: string): void {
    for (const [id, g] of groups) {
      if (id !== itemId && g.isPlaying) g.pause();
    }
    useStore.getState().setPlayingGroup(itemId);
  },

  /** Pause every group (global pause / space bar). */
  pauseAll(): void {
    for (const g of groups) g[1].pause();
    useStore.getState().setPlayingGroup(null);
  },

  /** Apply the global mute flag to every group. */
  setMutedAll(muted: boolean): void {
    for (const g of groups) g[1].setMuted(muted);
  },

  /** Apply a global volume (0..1) to every group. */
  setVolumeAll(volume: number): void {
    for (const g of groups) g[1].setVolume(volume);
  },

  /**
   * Apply a volume (0..1) only to groups that are CURRENTLY playing. The global
   * knob uses this so it does not touch the (many) idle elements — keeping the
   * adjustment cheap. Newly played groups read the global volume on mount.
   */
  setVolumeActive(volume: number): void {
    for (const [, g] of groups) {
      if (g.isPlaying) g.setVolume(volume);
    }
  },

  /** Arm autoplay for an item so its media starts as soon as it mounts.
   *  Cancels any previously armed autoplay on other items. */
  requestAutoplay(itemId: string): void {
    // Cancel any pending autoplay on OTHER groups to prevent stale timers
    // from firing after the user clicked a different card.
    for (const [id, g] of groups) {
      if (id !== itemId) g.cancelAutoplay();
    }
    const group = mediaRegistry.group(itemId);
    // Sync global volume/mute before arming autoplay.
    const { volume, muted } = useStore.getState();
    group.setVolume(volume);
    group.setMuted(muted);
    group.requestAutoplay();
  },

  /** Dispose the group for an item (on blur / unmount). */
  dispose(itemId: string): void {
    const g = groups.get(itemId);
    if (g) {
      g.destroy();
      groups.delete(itemId);
    }
    if (useStore.getState().playingGroupId === itemId) {
      useStore.getState().setPlayingGroup(null);
    }
  },

  /** Is the given item the active (playing) group? */
  isPlaying(itemId: string): boolean {
    return useStore.getState().playingGroupId === itemId;
  },
};
