import {useCallback, useMemo, useRef} from 'react';
import {Animated} from 'react-native';
import type {VideoAnimations} from '../types';

export const useJSAnimations = (
  controlAnimationTiming: number = 450,
): VideoAnimations => {
  // Use TranslateY instead of Margins to allow NativeDriver support
  const bottomControlTranslateY = useRef(new Animated.Value(0)).current;
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const topControlTranslateY = useRef(new Animated.Value(0)).current;

  const hideControlAnimation = useCallback(() => {
    Animated.parallel([
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: controlAnimationTiming,
        useNativeDriver: true, // Native driver removes the blinking bug
      }),
      Animated.timing(topControlTranslateY, {
        toValue: -100,
        duration: controlAnimationTiming,
        useNativeDriver: true,
      }),
      Animated.timing(bottomControlTranslateY, {
        toValue: 100, // Positive 100 pushes it down (equivalent to old marginBottom)
        duration: controlAnimationTiming,
        useNativeDriver: true,
      }),
    ]).start();
  }, [
    controlAnimationTiming,
    controlsOpacity,
    topControlTranslateY,
    bottomControlTranslateY,
  ]);

  const showControlAnimation = useCallback(() => {
    Animated.parallel([
      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: controlAnimationTiming,
        useNativeDriver: true,
      }),
      Animated.timing(topControlTranslateY, {
        toValue: 0,
        duration: controlAnimationTiming,
        useNativeDriver: true,
      }),
      Animated.timing(bottomControlTranslateY, {
        toValue: 0,
        duration: controlAnimationTiming,
        useNativeDriver: true,
      }),
    ]).start();
  }, [
    controlAnimationTiming,
    controlsOpacity,
    topControlTranslateY,
    bottomControlTranslateY,
  ]);

  // BUG FIX: this object used to be rebuilt as a brand-new literal on every
  // render, with no useMemo. Since `animations` is passed straight down as a
  // prop to TopControls / BottomControls / Overlay / PlayPause / Gestures,
  // a changing reference on every render defeated any memoization those
  // components rely on and forced all of them to re-render every time the
  // player re-rendered — including on every single touch-move frame while
  // scrubbing or adjusting volume. The underlying Animated.Value instances
  // are already stable (held in refs), so memoizing this object is safe and
  // means it now only changes identity when it actually needs to.
  const animations = useMemo(
    () =>
      ({
        bottomControl: {
          transform: [{translateY: bottomControlTranslateY}],
        },
        topControl: {
          transform: [{translateY: topControlTranslateY}],
        },
        controlsOpacity: {
          opacity: controlsOpacity,
        },
        showControlAnimation,
        hideControlAnimation,
        AnimatedView: Animated.View,
      } as unknown as VideoAnimations),
    [
      bottomControlTranslateY,
      topControlTranslateY,
      controlsOpacity,
      showControlAnimation,
      hideControlAnimation,
    ],
  );

  return animations;
};