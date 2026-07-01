import {useRef} from 'react';
import {Animated} from 'react-native';
import type {VideoAnimations} from '../types';

export const useJSAnimations = (
  controlAnimationTiming: number = 450,
): VideoAnimations => {
  // Use TranslateY instead of Margins to allow NativeDriver support
  const bottomControlTranslateY = useRef(new Animated.Value(0)).current;
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const topControlTranslateY = useRef(new Animated.Value(0)).current;

  const hideControlAnimation = () => {
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
  };

  const showControlAnimation = () => {
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
  };

  const animations = {
    bottomControl: {
      transform: [{ translateY: bottomControlTranslateY }],
    },
    topControl: {
      transform: [{ translateY: topControlTranslateY }],
    },
    controlsOpacity: {
      opacity: controlsOpacity,
    },
    showControlAnimation,
    hideControlAnimation,
    AnimatedView: Animated.View,
  } as unknown as VideoAnimations;

  return animations;
};