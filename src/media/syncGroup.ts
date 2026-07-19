/**
 * SyncGroup — coordinates synchronised playback of the media elements that
 * belong to ONE item (e.g. several camera angles of the same take).
 *
 * The first registered element acts as the master clock and carries the visible
 * controls; the others are slaved to it. To keep playback FLUENT, slaves are NOT
 * re-seeked every frame — they are aligned to the master's `currentTime` only
 * when playback starts and when the user scrubs the master (a `seeked` event),
 * then left to play freely. This avoids the constant micro-interactions that
 * previously made secondary clips stutter / appear to loop.
 *
 * Elements of different lengths are handled gracefully: each stops when it
 * reaches its own end while longer elements keep playing. The group only counts
 * as "ended" once EVERY element has finished.
 */

export class SyncGroup {
  readonly itemId: string;
  private media: HTMLMediaElement[] = [];
  private playing = false;
  private muted = false;
  private volume = 1;
  private onEndedCb: (() => void) | null = null;
  private onPlayCb: (() => void) | null = null;
  private onUserPauseCb: (() => void) | null = null;
  private autoplayArmed = false;
  private autoplayTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set when pause() is called programmatically to suppress user-pause callback. */
  private programmaticPause = false;

  constructor(itemId: string) {
    this.itemId = itemId;
  }

  /** Register a media element. The first one becomes the master clock. */
  add(el: HTMLMediaElement): void {
    if (this.media.includes(el)) return;
    this.media.push(el);
    el.muted = this.muted;
    el.volume = this.volume;
    el.addEventListener('ended', this.handleEnded);
    if (this.media[0] === el) {
      el.addEventListener('play', this.handleMasterPlay);
      el.addEventListener('pause', this.handleMasterPause);
      el.addEventListener('seeked', this.handleMasterSeeked);
    }
    // If autoplay was requested before the media mounted, (re)schedule it so it
    // fires once every grouped element has registered this frame.
    if (this.autoplayArmed) this.scheduleAutoplay();
  }

  remove(el: HTMLMediaElement): void {
    el.removeEventListener('ended', this.handleEnded);
    el.removeEventListener('play', this.handleMasterPlay);
    el.removeEventListener('pause', this.handleMasterPause);
    el.removeEventListener('seeked', this.handleMasterSeeked);
    this.media = this.media.filter((m) => m !== el);
    if (this.media.length === 0) {
      this.playing = false;
    }
  }

  get master(): HTMLMediaElement | undefined {
    return this.media[0];
  }

  get isEmpty(): boolean {
    return this.media.length === 0;
  }

  onEnded(cb: () => void): void {
    this.onEndedCb = cb;
  }

  onPlay(cb: () => void): void {
    this.onPlayCb = cb;
  }

  onUserPause(cb: () => void): void {
    this.onUserPauseCb = cb;
  }

  /**
   * Arm autoplay: start playback as soon as the grouped media has mounted. Used
   * when the user focuses (clicks) a card with media so it plays on a single
   * click instead of two.
   */
  requestAutoplay(): void {
    this.autoplayArmed = true;
    this.scheduleAutoplay();
  }

  /** Cancel a pending autoplay request (e.g. the item was unfocused first). */
  cancelAutoplay(): void {
    this.autoplayArmed = false;
    if (this.autoplayTimer) {
      clearTimeout(this.autoplayTimer);
      this.autoplayTimer = null;
    }
  }

  private scheduleAutoplay(): void {
    if (this.autoplayTimer) clearTimeout(this.autoplayTimer);
    // Defer briefly so every grouped MediaBox can mount + register before we
    // start the synchronised playback.
    this.autoplayTimer = setTimeout(() => {
      this.autoplayTimer = null;
      if (!this.autoplayArmed) return;
      this.autoplayArmed = false;
      void this.play();
    }, 60);
  }

  private handleEnded = (): void => {
    // The group only counts as ended once EVERY element has finished; shorter
    // media simply stop while longer ones keep playing.
    if (this.media.length > 0 && this.media.every((m) => m.ended)) {
      this.playing = false;
      this.onEndedCb?.();
    }
  };

  private handleMasterPlay = (): void => {
    this.playing = true;
    this.onPlayCb?.();
    // Align the slaves to the master ONCE and let them run freely from there.
    this.syncSlaves();
    void this.playSlaves();
  };

  private handleMasterPause = (): void => {
    // Ignore the synthetic pause the browser fires when the master simply ends
    // (its slaves may still be playing).
    if (this.master?.ended) return;
    // Ignore pauses triggered programmatically (e.g. by pauseAll/blurFocused).
    if (this.programmaticPause) return;
    this.playing = false;
    // Really pause the secondary (slave) elements too. Plyr's controls only
    // drive the master element, so without this the slaves keep playing (and
    // looping their short clips) silently after the user hits pause.
    for (let i = 1; i < this.media.length; i += 1) {
      if (!this.media[i].ended) this.media[i].pause();
    }
    this.onUserPauseCb?.();
  };

  /** The user scrubbed the master: re-seek the slaves to the new point once. */
  private handleMasterSeeked = (): void => {
    this.syncSlaves();
  };

  /** Align every (non-ended) slave to the master's current time. */
  private syncSlaves(): void {
    const master = this.master;
    if (!master) return;
    for (let i = 1; i < this.media.length; i += 1) {
      const slave = this.media[i];
      if (!slave.ended) slave.currentTime = master.currentTime;
    }
  }

  /** Start every (non-ended) slave element (used on master play). */
  private async playSlaves(): Promise<void> {
    await Promise.allSettled(
      this.media.slice(1).map((m) => (m.ended || !m.paused ? Promise.resolve() : m.play())),
    );
  }

  async play(): Promise<void> {
    if (this.media.length === 0) return;
    // If everything had already ended, restart the group from the top.
    if (this.media.every((m) => m.ended)) {
      for (const m of this.media) m.currentTime = 0;
    }
    // Apply current global volume/mute before starting playback.
    for (const m of this.media) {
      m.volume = this.volume;
      m.muted = this.muted;
    }
    // Align all (non-ended) slaves to the master before starting.
    this.syncSlaves();
    this.playing = true;
    await Promise.allSettled(
      this.media.map((m) => (m.ended ? Promise.resolve() : m.play())),
    );
  }

  pause(): void {
    this.cancelAutoplay();
    this.playing = false;
    this.programmaticPause = true;
    for (const m of this.media) m.pause();
    this.programmaticPause = false;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const m of this.media) m.muted = muted;
  }

  /** Set playback volume (0..1) for every element in the group. */
  setVolume(volume: number): void {
    this.volume = volume;
    for (const m of this.media) m.volume = volume;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Resolve when every element in the group has finished. */
  whenEnded(): Promise<void> {
    if (this.media.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const check = (): void => {
        if (this.media.every((m) => m.ended)) {
          for (const m of this.media) m.removeEventListener('ended', check);
          resolve();
        }
      };
      for (const m of this.media) m.addEventListener('ended', check);
    });
  }

  destroy(): void {
    this.pause();
    for (const m of [...this.media]) this.remove(m);
    this.onEndedCb = null;
    this.onPlayCb = null;
    this.onUserPauseCb = null;
  }
}
