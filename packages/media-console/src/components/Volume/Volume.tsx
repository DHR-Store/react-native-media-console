import React from 'react';
import {View, Image, GestureResponderHandlers, Text} from 'react-native';
import {styles} from './styles';

// Must match `volumeWidth` constant in VideoPlayer.tsx (150 px = 200% volume).
const VOLUME_SLIDER_WIDTH = 150;

interface VolumeProps {
  volumeFillWidth: number;
  volumeTrackWidth: number;
  volumePosition: number;
  volumePanHandlers: GestureResponderHandlers;
  // Optional: if not supplied, percentage is derived from volumeFillWidth so
  // the component works correctly even when TopControls does not forward it.
  currentVolumePercentage?: number;
}

export const Volume = ({
  volumeFillWidth,
  volumePosition,
  volumeTrackWidth,
  volumePanHandlers,
  currentVolumePercentage,
}: VolumeProps) => {
  // FIX: derive percentage from volumeFillWidth when the prop is absent.
  // The slider maps 0–150 px to 0–200%, so percentage = (fill / 150) * 200.
  // Before this fix the default was always 100%, so isBoosted was always
  // false and the orange VLC-boost styling never activated.
  const computedPercentage = Math.round(
    (volumeFillWidth / VOLUME_SLIDER_WIDTH) * 200,
  );
  const effectivePercentage = currentVolumePercentage ?? computedPercentage;
  const isBoosted = effectivePercentage > 100;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.fill,
          {width: volumeFillWidth},
          isBoosted && styles.fillBoosted, // Turns orange when > 100%
        ]}
      />
      <View style={[styles.track, {width: volumeTrackWidth}]} />
      <View
        style={[styles.handle, {left: volumePosition - 15}]}
        {...volumePanHandlers}>
        <Image
          style={[styles.icon, isBoosted && styles.iconBoosted]}
          source={require('../../assets/img/volume.png')}
        />
      </View>

      {/* VLC-style percentage text */}
      <Text style={[styles.percentageText, isBoosted && styles.textBoosted]}>
        {effectivePercentage}%
      </Text>
    </View>
  );
};
