import {Dispatch, SetStateAction, useRef} from 'react';
import {PanResponder} from 'react-native';

type PanResponderInstance = ReturnType<typeof PanResponder.create>;

interface PanRespondersProps {
  duration: number;
  volumePosition: number;
  loading: boolean;
  seeking: boolean;
  seekerPosition: number;
  seek?: (time: number, tolerance?: number) => void;
  seekerWidth: number;
  volumeTrackWidth: number; // Constant slider width (px), i.e. the max volume position
  clearControlTimeout: () => void;
  setVolumePosition: (position: number) => void;
  setSeekerPosition: (position: number) => void;
  setSeeking: Dispatch<SetStateAction<boolean>>;
  setControlTimeout: () => void;
  onEnd: () => void;
  horizontal?: boolean;
  inverted?: boolean;
}

export const usePanResponders = ({
  duration,
  volumePosition,
  loading,
  seeking,
  seekerPosition,
  seek,
  seekerWidth,
  volumeTrackWidth,
  clearControlTimeout,
  setVolumePosition,
  setSeekerPosition,
  setSeeking,
  setControlTimeout,
  onEnd,
  horizontal = true,
  inverted = false,
}: PanRespondersProps) => {
  // ── Why this hook looks the way it does ─────────────────────────────────
  //
  // 1) PanResponder.create() used to be called directly in the hook body,
  //    which built a BRAND NEW responder (and brand new panHandlers) on
  //    every single render. Because every touch-move during a drag updates
  //    state (to move the knob), that meant React was tearing down and
  //    rebuilding the active touch handlers on nearly every frame of a
  //    gesture — the underlying cause of touches feeling dropped or laggy.
  //    The responders are now created exactly ONCE (see `respondersRef`)
  //    and never recreated.
  //
  // 2) Because the responders are created once, their closures can't
  //    directly reference render-scoped variables (that would make them
  //    stale forever). Instead, every value/callback the handlers need is
  //    kept fresh on a single mutable `latest` ref, updated on every render.
  //
  // 3) The seek/volume "drag-start offset" is intentionally NOT React state
  //    and is written in exactly one place: onPanResponderGrant. Previously
  //    it was re-synced to the current position on every move, which made
  //    `offset + cumulativeDx` compound every frame and sent the knob
  //    racing ahead of the finger.
  //
  // 4) The actual video `seek()` call now happens in exactly one place:
  //    onPanResponderRelease. Previously a separate effect also fired a
  //    real seek on every touch-move while dragging, flooding the player
  //    with (often network-bound) seeks many times a second — this was the
  //    single biggest cause of laggy, unresponsive scrubbing.

  const latest = useRef({
    duration,
    volumePosition,
    loading,
    seeking,
    seekerPosition,
    seek,
    seekerWidth,
    volumeTrackWidth,
    clearControlTimeout,
    setVolumePosition,
    setSeekerPosition,
    setSeeking,
    setControlTimeout,
    onEnd,
    horizontal,
    inverted,
  });

  // Refresh the snapshot every render so the (stable) responders below
  // always see up-to-date values without ever being recreated.
  latest.current.duration = duration;
  latest.current.volumePosition = volumePosition;
  latest.current.loading = loading;
  latest.current.seeking = seeking;
  latest.current.seekerPosition = seekerPosition;
  latest.current.seek = seek;
  latest.current.seekerWidth = seekerWidth;
  latest.current.volumeTrackWidth = volumeTrackWidth;
  latest.current.clearControlTimeout = clearControlTimeout;
  latest.current.setVolumePosition = setVolumePosition;
  latest.current.setSeekerPosition = setSeekerPosition;
  latest.current.setSeeking = setSeeking;
  latest.current.setControlTimeout = setControlTimeout;
  latest.current.onEnd = onEnd;
  latest.current.horizontal = horizontal;
  latest.current.inverted = inverted;

  // Drag-start snapshots — written once per gesture, in onPanResponderGrant.
  const seekerOffsetRef = useRef(0);
  const volumeOffsetRef = useRef(0);

  const respondersRef = useRef<{
    volumePanResponder: PanResponderInstance;
    seekPanResponder: PanResponderInstance;
  } | null>(null);

  if (!respondersRef.current) {
    const volumePanResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        latest.current.clearControlTimeout();
        // Snapshot the starting position for THIS drag only.
        volumeOffsetRef.current = latest.current.volumePosition;
      },
      onPanResponderMove: (_evt, gestureState) => {
        const {
          horizontal: h,
          inverted: inv,
          volumeTrackWidth: maxWidth,
        } = latest.current;
        const diff = h ? gestureState.dx : gestureState.dy;
        let position = volumeOffsetRef.current + diff * (inv ? -1 : 1);

        if (position < 0) {
          position = 0;
        } else if (position > maxWidth) {
          position = maxWidth;
        }

        latest.current.volumePosition = position;
        latest.current.setVolumePosition(position);
      },
      onPanResponderRelease: () => {
        latest.current.setControlTimeout();
      },
    });

    const seekPanResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        latest.current.setSeeking(true);
        latest.current.clearControlTimeout();
        // Tap-to-jump: start the drag from wherever the user touched down.
        const position = evt.nativeEvent.locationX;
        seekerOffsetRef.current = position;
        latest.current.seekerPosition = position;
        latest.current.setSeekerPosition(position);
      },
      onPanResponderMove: (_evt, gestureState) => {
        const {horizontal: h, inverted: inv} = latest.current;
        const diff = h ? gestureState.dx : gestureState.dy;
        const position = seekerOffsetRef.current + diff * (inv ? -1 : 1);

        latest.current.seekerPosition = position;
        latest.current.setSeekerPosition(position);
      },
      onPanResponderRelease: () => {
        const {
          seekerPosition: position,
          seekerWidth: width,
          duration: dur,
          loading: isLoading,
          onEnd: end,
          seek: seekFn,
          setSeeking: setSeekingFn,
        } = latest.current;

        const percent = width > 0 ? position / width : 0;
        const time = dur * percent;

        if (time >= dur && !isLoading) {
          if (typeof end === 'function') {
            end();
          }
        }

        setSeekingFn(false);
        // The ONLY place a real video seek is triggered — once, on release.
        seekFn && seekFn(time);
      },
    });

    respondersRef.current = {volumePanResponder, seekPanResponder};
  }

  return respondersRef.current;
};
