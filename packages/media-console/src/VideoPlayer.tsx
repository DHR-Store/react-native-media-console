import React, {useCallback, useState, useEffect, useRef, useMemo} from 'react';
import {View} from 'react-native';
import Video, {
  OnLoadData,
  OnLoadStartData,
  OnProgressData,
  OnSeekData,
  ResizeMode,
  VideoRef,
} from 'react-native-video';
import {useControlTimeout, useJSAnimations, usePanResponders} from './hooks';
import {
  Error,
  Loader,
  TopControls,
  BottomControls,
  PlayPause,
  Overlay,
} from './components';
import {PlatformSupport} from './OSSupport';
import {_onBack} from './utils';
import {_styles} from './styles';
import type {VideoPlayerProps, WithRequiredProperty} from './types';
// ✔️ CORRECT (Relative path import)
import Gestures from './components/Gestures';

const volumeWidth = 150;
const iconOffset = 0;

const AnimatedVideoPlayer = (
  props: WithRequiredProperty<VideoPlayerProps, 'animations'>,
) => {
  const {
    animations,
    toggleResizeModeOnFullscreen,
    doubleTapTime = 130,
    resizeMode = ResizeMode.CONTAIN,
    isFullscreen = false,
    showOnStart = false,
    showOnEnd = false,
    alwaysShowControls = false,
    paused = false,
    muted = false,
    // VLC-style 200 % boot volume.  The slider formula is:
    //   volume = (sliderPosition / volumeWidth) * 2
    // so volume=2 places the knob at the far-right (150 px) → ExoPlayer
    // amplifies the audio signal to 200 % of the original level, exactly
    // matching VLC's "150 %" or media-player "boost" mode.
    // On iOS react-native-video clamps internally to 1.0; on Android
    // ExoPlayer applies the gain without clamping (hardware permitting).
    volume = 2,
    title = {primary: '', secondary: ''},
    rate = 1,
    showDuration = false,
    showTimeRemaining = false,
    showHours = false,
    onSeek,
    onError,
    onBack,
    onEnd,
    onEnterFullscreen = () => {},
    onExitFullscreen = () => {},
    onHideControls = () => {},
    onShowControls = () => {},
    onPause,
    onPlay,
    onLoad,
    onLoadStart,
    onProgress,
    controlTimeoutDelay = 15000,
    tapAnywhereToPause = false,
    videoStyle = {},
    containerStyle = {},
    seekColor = '',
    source,
    disableBack = false,
    disableVolume = false,
    disableFullscreen = false,
    disableTimer = false,
    disableSeekbar = false,
    disablePlayPause = false,
    disableSeekButtons = false,
    disableOverlay,
    navigator,
    rewindTime = 15,
    pan: {horizontal: horizontalPan, inverted: invertedPan} = {},
    testID,
    disableGesture = false,
    hideAllControlls = false,
  } = props;

  const mounted = useRef(false);
  const _videoRef = useRef<VideoRef>(null);
  const controlTimeout = useRef<ReturnType<typeof setTimeout>>(
    setTimeout(() => {}),
  ).current;
  const tapActionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [_resizeMode, setResizeMode] = useState<ResizeMode>(ResizeMode.CONTAIN);
  const [_paused, setPaused] = useState<boolean>(paused);
  const [_muted, setMuted] = useState<boolean>(muted);
  const [_volume, setVolume] = useState<number>(volume);
  const [_isFullscreen, setIsFullscreen] = useState<boolean>(
    isFullscreen || resizeMode === 'cover' || false,
  );
  const [_playbackRate, setPlaybackRate] = useState<number>(rate);
  const [_showTimeRemaining, setShowTimeRemaining] =
    useState<boolean>(showTimeRemaining);

  // ── FIX: Derive ALL four volume-slider state values from the volume prop
  //         at construction time, not from 0.
  //
  //         Previous code initialised volumePosition/volumeFillWidth/volumeOffset
  //         to 0 and relied on the init useEffect to correct them.  However React
  //         effects run in declaration order: the TRACKING effect (depends on
  //         [volumeFillWidth, volumePosition]) fired FIRST with position=0 and
  //         scheduled a requestAnimationFrame that set _volume=0 and muted=true.
  //         That rAF committed BEFORE the init effect's setVolumePosition(150)
  //         was processed, so the Video component received volume=0,muted=true
  //         on first render on several Android builds — and some ExoPlayer
  //         versions held that muted state for the entire session.
  //
  //         Formula: volumeWidth (150 px) maps 0–200%, so position = (v/2)*150.
  //         Clamp to [0, volumeWidth] to guard against out-of-range props.
  const initialVolumePos = Math.min(
    volumeWidth,
    Math.max(0, volumeWidth * (volume / 2)),
  );
  const [volumeTrackWidth, setVolumeTrackWidth] = useState<number>(
    Math.max(0, volumeWidth - initialVolumePos),
  );
  const [volumeFillWidth, setVolumeFillWidth] =
    useState<number>(initialVolumePos);
  const [seekerFillWidth, setSeekerFillWidth] = useState<number>(0);
  const [showControls, setShowControls] = useState(showOnStart);
  // volumePosition: the knob's pixel offset from the left of the slider track.
  const [volumePosition, setVolumePositionState] = useState(initialVolumePos);
  const [seekerPosition, setSeekerPositionState] = useState(0);
  // BUG FIX: the drag-start "offset" snapshots for the seek/volume sliders
  // used to live here as component state (seekerOffset/volumeOffset) and
  // were re-synced to the CURRENT position on every touch-move event. Since
  // the pan responders compute `position = offset + cumulativeDx`, resetting
  // offset on every move made that formula compound every single frame,
  // sending the knob racing far ahead of the finger — the main cause of the
  // seek bar/volume slider feeling laggy and unresponsive while dragging.
  // They now live as plain refs *inside* usePanResponders, written exactly
  // once per gesture (on grant), which is both correct and avoids firing
  // extra re-renders on every drag frame.
  const [seekerWidth, setSeekerWidth] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState(false);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [cachedDuration, setCachedDuration] = useState(0);
  const [cachedPosition, setCachedPosition] = useState(0);

  const videoRef = props.videoRef || _videoRef;

  const {clearControlTimeout, resetControlTimeout, setControlTimeout} =
    useControlTimeout({
      controlTimeout,
      controlTimeoutDelay,
      mounted: mounted.current,
      showControls,
      setShowControls,
      alwaysShowControls,
    });

  const toggleFullscreen = useCallback(
    () => setIsFullscreen((prevState) => !prevState),
    [],
  );
  const toggleControls = useCallback(
    () => setShowControls((prevState) => alwaysShowControls || !prevState),
    [alwaysShowControls],
  );
  const toggleTimer = useCallback(
    () => setShowTimeRemaining((prevState) => !prevState),
    [],
  );
  const togglePlayPause = useCallback(() => {
    setPaused((prevState) => !prevState);
  }, []);

  const styles = useMemo(
    () => ({
      videoStyle,
      containerStyle: containerStyle,
    }),
    [videoStyle, containerStyle],
  );

  const _onSeek = useCallback(
    (obj: OnSeekData) => {
      try {
        if (!seeking) {
          setControlTimeout();
        }

        // Ensure currentTime is valid
        const validCurrentTime = Math.max(
          0,
          Math.min(obj.currentTime || 0, duration),
        );
        setCurrentTime(validCurrentTime);

        if (typeof onSeek === 'function') {
          onSeek(obj);
        }
      } catch (error) {
        console.error('Error in _onSeek:', error);
      }
    },
    [seeking, setControlTimeout, onSeek, duration],
  );

  const _onEnd = useCallback(() => {
    if (currentTime < duration) {
      setCurrentTime(duration);
      setPaused(!props.repeat);

      if (showOnEnd) {
        setShowControls(!props.repeat);
      }
    }

    if (typeof onEnd === 'function') {
      onEnd();
    }
  }, [currentTime, duration, props.repeat, showOnEnd, onEnd]);

  const _onError = useCallback(() => {
    setError(true);
    setLoading(false);
  }, []);

  const _onLoadStart = useCallback(
    (e: OnLoadStartData) => {
      setLoading(true);

      if (typeof onLoadStart === 'function') {
        onLoadStart(e);
      }
    },
    [onLoadStart],
  );

  const _onLoad = useCallback(
    (data: OnLoadData) => {
      setDuration(data.duration);
      setLoading(false);

      if (showControls) {
        setControlTimeout();
      }

      if (typeof onLoad === 'function') {
        onLoad(data);
      }
    },
    [showControls, setControlTimeout, onLoad],
  );

  const _onProgress = useCallback(
    (data: OnProgressData) => {
      setLoading(false);
      if (!seeking && !buffering) {
        // Just record the raw values here. The seekbar fill / cached-buffer
        // position are derived from currentTime/duration/seekerWidth by a
        // single dedicated effect further down (throttled with rAF), which
        // covers this progress-tick case AND rewind/forward/onEnd. Doing the
        // same pixel math again here duplicated that work on every single
        // progress tick for no benefit.
        setCurrentTime(data.currentTime);
        setCachedDuration(data.playableDuration);

        if (typeof onProgress === 'function') {
          onProgress(data);
        }
      }
    },
    [seeking, buffering, onProgress],
  );

  const _onScreenTouch = useCallback(() => {
    if (tapActionTimeout.current) {
      // This is a double tap - clear timeout and toggle fullscreen
      clearTimeout(tapActionTimeout.current);
      tapActionTimeout.current = null;
      toggleFullscreen();
      if (showControls) {
        resetControlTimeout();
      }
    } else {
      // This is a single tap - set timeout to handle single tap action
      tapActionTimeout.current = setTimeout(() => {
        if (tapAnywhereToPause && showControls) {
          togglePlayPause();
          resetControlTimeout();
        } else {
          toggleControls();
        }
        tapActionTimeout.current = null;
      }, doubleTapTime);
    }
  }, [
    toggleFullscreen,
    showControls,
    resetControlTimeout,
    tapAnywhereToPause,
    togglePlayPause,
    toggleControls,
    doubleTapTime,
  ]);

  const _onPlaybackRateChange = useCallback(
    (playBack: {playbackRate: number}) => {
      if (playBack.playbackRate === 0 && !buffering) {
        setTimeout(() => {
          !buffering && setPaused(true);
        });
      } else {
        setPaused(false);
      }
    },
    [buffering],
  );

  const events = useMemo(
    () => ({
      onError: onError || _onError,
      onBack: (onBack || _onBack(navigator)) as () => void,
      onEnd: _onEnd,
      onScreenTouch: _onScreenTouch,
      onEnterFullscreen,
      onExitFullscreen,
      onShowControls,
      onHideControls,
      onLoadStart: _onLoadStart,
      onProgress: _onProgress,
      onSeek: _onSeek,
      onLoad: _onLoad,
      onPause,
      onPlay,
      onPlaybackRateChange: _onPlaybackRateChange,
    }),
    [
      onError,
      _onError,
      onBack,
      navigator,
      _onEnd,
      _onScreenTouch,
      onEnterFullscreen,
      onExitFullscreen,
      onShowControls,
      onHideControls,
      _onLoadStart,
      _onProgress,
      _onSeek,
      _onLoad,
      onPause,
      onPlay,
      _onPlaybackRateChange,
    ],
  );

  const constrainToSeekerMinMax = useCallback(
    (val = 0) => {
      if (val <= 0) {
        return 0;
      } else if (val >= seekerWidth) {
        return seekerWidth;
      }
      return val;
    },
    [seekerWidth],
  );

  const constrainToVolumeMinMax = useCallback((val = 0) => {
    // FIX: cap at volumeWidth (150), not volumeWidth+9 (159).
    // The slider represents 0–200% across 0–150 px.
    // Allowing 159 overflowed the fill bar and made volumeTrackWidth negative.
    if (val <= 0) {
      return 0;
    } else if (val >= volumeWidth) {
      return volumeWidth;
    }
    return val;
  }, []);

  const setSeekerPosition = useCallback(
    (position = 0) => {
      const positionValue = constrainToSeekerMinMax(position);

      // Batch state updates to prevent excessive re-renders
      setSeekerPositionState(positionValue);
      setSeekerFillWidth(positionValue);
    },
    [constrainToSeekerMinMax],
  );

  const setVolumePosition = useCallback(
    (position = 0) => {
      const positionValue = constrainToVolumeMinMax(position);

      // Batch state updates
      setVolumePositionState(positionValue + iconOffset);

      if (positionValue < 0) {
        setVolumeFillWidth(0);
      } else {
        setVolumeFillWidth(positionValue);
      }
    },
    [constrainToVolumeMinMax],
  );

  const seekVideo = useCallback(
    (time: number) => {
      try {
        if (
          videoRef?.current?.seek &&
          typeof videoRef.current.seek === 'function'
        ) {
          // Seek with a tolerance parameter for better compatibility
          videoRef.current.seek(time, 100);
        } else if (videoRef?.current) {
          // Fallback: try calling seek directly on the ref if available
          (videoRef.current as any).seek?.(time);
        } else {
          console.warn('Video seek function not available', {
            ref: !!videoRef?.current,
            seekFunction: !!videoRef?.current?.seek,
          });
        }
      } catch (error) {
        console.error('Error seeking video:', error);
      }
    },
    [videoRef],
  );

  const {volumePanResponder, seekPanResponder} = usePanResponders({
    duration,
    volumePosition,
    loading,
    seekerWidth,
    // FIX: pass the constant slider width (150 px = absolute end = 200% volume)
    // instead of the fill-remainder state variable.  The fill-remainder
    // (volumeWidth - fill) approaches 0 as volume rises, so the old code
    // computed maxVolumePosition = 0 at 200%, instantly muting any drag.
    volumeTrackWidth: volumeWidth,
    seeking,
    seekerPosition,
    seek: seekVideo,
    clearControlTimeout,
    setVolumePosition,
    setSeekerPosition,
    setSeeking,
    setControlTimeout,
    onEnd: events.onEnd,
    horizontal: horizontalPan,
    inverted: invertedPan,
  });

  useEffect(() => {
    if (currentTime >= duration && duration > 0) {
      videoRef?.current?.seek(0);
    }
  }, [currentTime, duration, videoRef]);

  useEffect(() => {
    if (toggleResizeModeOnFullscreen) {
      setResizeMode(_isFullscreen ? ResizeMode.CONTAIN : ResizeMode.COVER);
    }

    if (mounted.current) {
      if (_isFullscreen) {
        typeof events.onEnterFullscreen === 'function' &&
          events.onEnterFullscreen();
      } else {
        typeof events.onExitFullscreen === 'function' &&
          events.onExitFullscreen();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_isFullscreen, toggleResizeModeOnFullscreen]);

  useEffect(() => {
    setIsFullscreen(isFullscreen);
  }, [isFullscreen]);

  useEffect(() => {
    setPaused(paused);
  }, [paused]);

  useEffect(() => {
    if (_paused) {
      typeof events.onPause === 'function' && events.onPause();
      // FIX: When the video pauses, immediately cancel the hide timer so
      // controls stay on screen.  Also force them visible in case a prior
      // auto-hide timer already fired right as the user hit pause.
      clearControlTimeout();
      setShowControls(true);
    } else {
      typeof events.onPlay === 'function' && events.onPlay();
      // Video resumed: start auto-hide only if controls are currently visible
      // (avoids scheduling a timer when controls are already hidden).
      if (showControls) {
        setControlTimeout();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_paused]);

  // Optimize seekbar position updates with throttling
  const updateSeekerPositionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!seeking && currentTime && duration && seekerWidth) {
      if (updateSeekerPositionRef.current) {
        cancelAnimationFrame(updateSeekerPositionRef.current);
      }

      updateSeekerPositionRef.current = requestAnimationFrame(() => {
        const percent = currentTime / duration;
        const position = seekerWidth * percent;
        const cachedPercent = cachedDuration / duration;
        const _cachedPosition = seekerWidth * cachedPercent;
        const newCachedPosition = constrainToSeekerMinMax(_cachedPosition);

        setCachedPosition(newCachedPosition);
        setSeekerPosition(position);

        updateSeekerPositionRef.current = null;
      });
    }

    return () => {
      if (updateSeekerPositionRef.current) {
        cancelAnimationFrame(updateSeekerPositionRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentTime,
    duration,
    seekerWidth,
    setSeekerPosition,
    constrainToSeekerMinMax,
  ]);

  // set current time when seeking
  useEffect(() => {
    if (seeking && seekerPosition && seekerWidth && duration) {
      const percent = seekerPosition / seekerWidth;
      const newTime = duration * percent;
      setCurrentTime(newTime);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeking, seekerPosition]);

  useEffect(() => {
    if (showControls) {
      animations.showControlAnimation();
      // FIX: Only start auto-hide timer when video is PLAYING.
      // When paused, controls must stay visible indefinitely so the user
      // can interact with seek bar, audio/subtitle pickers, etc.
      if (!_paused) {
        setControlTimeout();
      }
      typeof events.onShowControls === 'function' && events.onShowControls();
    } else {
      animations.hideControlAnimation();
      clearControlTimeout();
      typeof events.onHideControls === 'function' && events.onHideControls();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showControls, loading, _paused]);

  useEffect(() => {
    setMuted(muted);
  }, [muted]);

  // Optimize volume updates with throttling
  const updateVolumeRef = useRef<number | null>(null);

  useEffect(() => {
    if (updateVolumeRef.current) {
      cancelAnimationFrame(updateVolumeRef.current);
    }

    updateVolumeRef.current = requestAnimationFrame(() => {
      const newVolume = (volumePosition / volumeWidth) * 2;

      if (newVolume <= 0) {
        setMuted(true);
      } else {
        setMuted(false);
      }

      setVolume(newVolume);

      // FIX: clamp to [0, volumeWidth]. At 200% (fill=150) track=0 (fully
      // filled); without the lower clamp it went negative (-9) which is
      // an invalid React Native style width.
      const newVolumeTrackWidth = Math.max(0, volumeWidth - volumeFillWidth);
      setVolumeTrackWidth(newVolumeTrackWidth);

      updateVolumeRef.current = null;
    });

    return () => {
      if (updateVolumeRef.current) {
        cancelAnimationFrame(updateVolumeRef.current);
      }
    };
  }, [volumeFillWidth, volumePosition]);

  useEffect(() => {
    // volumePosition / volumeFillWidth / volumeOffset are now initialised from
    // the volume prop via useState(), so no position setup is needed here.
    // Only lifecycle bookkeeping and frame-ref cleanup remain.
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearControlTimeout();
      // Clean up any pending animation frames
      if (updateSeekerPositionRef.current) {
        cancelAnimationFrame(updateSeekerPositionRef.current);
      }
      if (updateVolumeRef.current) {
        cancelAnimationFrame(updateVolumeRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPlaybackRate(rate);
  }, [rate]);

  const rewind = useCallback(
    (time?: number) => {
      const newTime =
        typeof time === 'number'
          ? currentTime - time
          : currentTime - rewindTime;
      setCurrentTime(newTime);
      videoRef?.current?.seek(newTime);
    },
    [currentTime, rewindTime, videoRef],
  );

  const forward = useCallback(
    (time?: number) => {
      const newTime =
        typeof time === 'number'
          ? currentTime + time
          : currentTime + rewindTime;
      setCurrentTime(newTime);
      videoRef?.current?.seek(newTime);
    },
    [currentTime, rewindTime, videoRef],
  );

  // Memoize onBuffer callback
  const onBuffer = useCallback((e: {isBuffering: boolean}) => {
    setBuffering(e.isBuffering);
    if (!e.isBuffering) {
      setPaused(false);
    }
  }, []);

  // Memoize source URI for dependency comparison - use deep comparison for stability
  const sourceUri = useMemo(() => {
    if (!source) return null;
    if (typeof source === 'object' && 'uri' in source) {
      return source.uri;
    }
    if (typeof source === 'object') {
      // For other source objects, create a stable string representation
      return JSON.stringify(source);
    }
    return String(source);
  }, [source]);

  // Keep track of previous source to prevent unnecessary resets
  const prevSourceUri = useRef(sourceUri);
  const hasInitialized = useRef(false);

  // reset on url change - only reset if source actually changed and component has initialized
  useEffect(() => {
    if (
      hasInitialized.current &&
      sourceUri !== prevSourceUri.current &&
      sourceUri !== null
    ) {
      prevSourceUri.current = sourceUri;
      setLoading(true);
      setSeekerFillWidth(0);
      setSeekerPosition(0);
      setCachedPosition(0);
      setCurrentTime(0);
    } else if (!hasInitialized.current) {
      prevSourceUri.current = sourceUri;
      hasInitialized.current = true;
    }
  }, [sourceUri, setSeekerPosition]);

  return (
    <PlatformSupport
      showControls={showControls}
      containerStyles={styles.containerStyle}
      onScreenTouch={events.onScreenTouch}
      testID={testID}>
      <View style={[_styles.player.container, styles.containerStyle]}>
        <Video
          controls={false}
          {...props}
          {...events}
          ref={videoRef || _videoRef}
          resizeMode={resizeMode}
          volume={_volume}
          paused={_paused}
          muted={_muted}
          rate={_playbackRate}
          style={[_styles.player.video, styles.videoStyle]}
          source={source}
          onBuffer={onBuffer}
        />
        {
          <>
            <Error error={error} />
            {!hideAllControlls && (
              <>
                {!disableOverlay && <Overlay animations={animations} />}
                <TopControls
                  title={title}
                  panHandlers={volumePanResponder.panHandlers}
                  animations={animations}
                  disableBack={disableBack}
                  disableVolume={disableVolume}
                  volumeFillWidth={volumeFillWidth}
                  volumeTrackWidth={volumeTrackWidth}
                  volumePosition={volumePosition}
                  onBack={events.onBack}
                  resetControlTimeout={resetControlTimeout}
                  showControls={showControls}
                />
                {loading ? (
                  <Loader color={seekColor} />
                ) : (
                  <PlayPause
                    animations={animations}
                    disablePlayPause={disablePlayPause}
                    disableSeekButtons={disableSeekButtons}
                    paused={_paused}
                    togglePlayPause={togglePlayPause}
                    resetControlTimeout={resetControlTimeout}
                    showControls={showControls}
                    onPressRewind={rewind}
                    onPressForward={forward}
                    buffering={buffering}
                    primaryColor={seekColor}
                  />
                )}
                <Gestures
                  forward={forward}
                  rewind={rewind}
                  togglePlayPause={togglePlayPause}
                  doubleTapTime={doubleTapTime}
                  seekerWidth={seekerWidth}
                  rewindTime={rewindTime}
                  toggleControls={toggleControls}
                  tapActionTimeout={tapActionTimeout}
                  tapAnywhereToPause={tapAnywhereToPause}
                  showControls={showControls}
                  disableGesture={disableGesture}
                  setPlayback={setPlaybackRate}
                  // BUG FIX: wire the VLC-style gain boost.
                  // Gestures reports an effectiveVolume in [0, 2]:
                  //   0-1 → pure system-volume territory; keep gain at 1.0
                  //         (VolumeManager already handled the system side)
                  //   1-2 → system is maxed; raise ExoPlayer gain so the
                  //         user actually hears amplification above 100%
                  onVolumeChange={(effectiveVolume) => {
                    // Convert the 0.0-2.0 volume back into slider pixels (0-150px)
                    const newSliderPosition =
                      (effectiveVolume / 2) * volumeWidth;

                    // Update the slider UI position.
                    // Because you have a useEffect listening to volumePosition,
                    // this will automatically pass the 0.0-2.0 value to ExoPlayer
                    // and trigger your native LoudnessEnhancer patch!
                    setVolumePosition(newSliderPosition);
                  }}
                />
                <BottomControls
                  animations={animations}
                  panHandlers={seekPanResponder.panHandlers}
                  disableTimer={disableTimer}
                  disableSeekbar={disableSeekbar}
                  showHours={showHours}
                  showDuration={showDuration}
                  paused={_paused}
                  showTimeRemaining={_showTimeRemaining}
                  currentTime={currentTime}
                  duration={duration}
                  seekColor={seekColor}
                  toggleTimer={toggleTimer}
                  resetControlTimeout={resetControlTimeout}
                  seekerFillWidth={seekerFillWidth}
                  seekerPosition={seekerPosition}
                  setSeekerWidth={setSeekerWidth}
                  cachedPosition={cachedPosition}
                  isFullscreen={isFullscreen}
                  disableFullscreen={disableFullscreen}
                  toggleFullscreen={toggleFullscreen}
                  showControls={showControls}
                />
              </>
            )}
          </>
        }
      </View>
    </PlatformSupport>
  );
};

const CustomAnimations = ({
  useAnimations,
  controlAnimationTiming = 450,
  ...props
}: WithRequiredProperty<VideoPlayerProps, 'useAnimations'>) => {
  const animations = useAnimations(controlAnimationTiming);
  return <AnimatedVideoPlayer animations={animations} {...props} />;
};

const JSAnimations = (props: VideoPlayerProps) => {
  const animations = useJSAnimations(props.controlAnimationTiming);

  return <AnimatedVideoPlayer animations={animations} {...props} />;
};

export const VideoPlayer = (props: Omit<VideoPlayerProps, 'animations'>) => {
  if (props?.useAnimations) {
    return <CustomAnimations useAnimations={props?.useAnimations} {...props} />;
  }

  return <JSAnimations {...props} />;
};
