import {Dispatch, SetStateAction, useEffect} from 'react';
import {PanResponder} from 'react-native';

interface PanRespondersProps {
  duration: number;
  seekerOffset: number;
  volumeOffset: number;
  loading: boolean;
  seeking: boolean;
  seekerPosition: number;
  seek?: (time: number, tolerance?: number) => void;
  seekerWidth: number;
  volumeTrackWidth: number; // Added to track maximum boundary
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
  seekerOffset,
  volumeOffset,
  loading,
  seeking,
  seekerPosition,
  seek,
  seekerWidth,
  volumeTrackWidth, // Destructured here
  clearControlTimeout,
  setVolumePosition,
  setSeekerPosition,
  setSeeking,
  setControlTimeout,
  onEnd,
  horizontal = true,
  inverted = false,
}: PanRespondersProps) => {
  const volumePanResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      clearControlTimeout();
    },
    onPanResponderMove: (_evt, gestureState) => {
      const diff = horizontal ? gestureState.dx : gestureState.dy;
      let position = volumeOffset + diff * (inverted ? -1 : 1);

      // FIX: volumeTrackWidth is now the constant slider width (150 px),
      // not the fill-remainder.  Use it directly as the ceiling.
      // Old formula `volumeTrackWidth * 2` was wrong: when the knob started
      // above 100% the fill-remainder was < 75, so max = <150, snapping the
      // knob backwards.  At 200% fill the remainder was 0, max = 0 → muted.
      if (position < 0) {
        position = 0;
      } else if (position > volumeTrackWidth) {
        position = volumeTrackWidth;
      }

      setVolumePosition(position);
    },
    onPanResponderRelease: () => {
      setControlTimeout();
    },
  });

  const seekPanResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      setSeeking(true);
      clearControlTimeout();
      const position = evt.nativeEvent.locationX;
      setSeekerPosition(position);
    },
    onPanResponderMove: (_evt, gestureState) => {
      const diff = horizontal ? gestureState.dx : gestureState.dy;
      const position = seekerOffset + diff * (inverted ? -1 : 1);
      setSeekerPosition(position);
      setSeeking(true);
    },
    onPanResponderRelease: () => {
      const percent = seekerPosition / seekerWidth;
      const time = duration * percent;

      if (time >= duration && !loading) {
        if (typeof onEnd === 'function') {
          onEnd();
        }
      }

      setSeeking(false);
      seek && seek(time);
    },
  });

  useEffect(() => {
    if (seeking) {
      const percent = seekerPosition / seekerWidth;
      const time = duration * percent;
      seek && seek(time);
    }
  }, [duration, seek, seekerPosition, seekerWidth, seeking]);

  return {volumePanResponder, seekPanResponder};
};
