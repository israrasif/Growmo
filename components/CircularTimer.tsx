import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  AppState,
  useWindowDimensions,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { colors, typography } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { useKeepAwake } from "expo-keep-awake";
import { useAudioPlayer } from "expo-audio";
import { segmentInfo, type GuideSegment } from "@/utils/sessionGuide";
import HeadPhoto from "@/components/HeadPhoto";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RESET_DELAY_MS = 900;

const mmss = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.max(0, Math.round(sec % 60))).padStart(2, "0")}`;

interface Props {
  durationSec: number;
  onComplete: (elapsedSec: number) => void;
  /** Optional: the steps of the session (warm-up, pinch, press, stretch) for guided mode */
  segments?: GuideSegment[];
  /** Speak each change of area out loud. Vibration always happens in guided mode. */
  voiceCues?: boolean;
}

export default function CircularTimer({
  durationSec,
  onComplete,
  segments,
  voiceCues = false,
}: Props) {
  // The ring grows and shrinks with the screen: 180 to 260 points, never taller than about a third of the screen
  const { width: winW, height: winH } = useWindowDimensions();
  const SIZE = Math.round(Math.max(180, Math.min(260, winW * 0.62, winH * 0.32)));
  const STROKE = Math.round(SIZE * 0.058);
  const RADIUS = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  // Two head views side by side must fit the width
  const headSize = Math.round(Math.min(170, (winW - 64) / 2));

  const [remaining, setRemaining] = useState(durationSec);
  const [running, setRunning] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  const progress = useMemo(() => new Animated.Value(0), []);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endTimeRef = useRef<number | null>(null); // ms epoch when the session should finish

  // Guided mode: remember which area we last announced, so each change is announced once
  const lastSegRef = useRef(-1);
  const segmentsRef = useRef(segments);
  const voiceRef = useRef(voiceCues);
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);
  useEffect(() => {
    voiceRef.current = voiceCues;
  }, [voiceCues]);

  const player = useAudioPlayer(
    require("@/assets/sounds/391540__unlistenable__electro-success-sound.wav"),
  );

  // Keep the screen awake only while a session is actually running.
  useKeepAwake(running ? "hair-massage-session" : undefined);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const reset = useCallback(() => {
    if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    endTimeRef.current = null;
    lastSegRef.current = -1;
    Speech.stop();
    setRunning(false);
    setJustFinished(false);
    setRemaining(durationSec);
    progress.setValue(0);
  }, [durationSec, progress]);

  // Recompute remaining from the end timestamp, and finish if time's already up.
  const sync = useCallback(() => {
    if (endTimeRef.current == null) return;
    const secsLeft = Math.max(
      0,
      Math.ceil((endTimeRef.current - Date.now()) / 1000),
    );
    setRemaining(secsLeft);
    if (secsLeft <= 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      endTimeRef.current = null;
      lastSegRef.current = -1;
      Speech.stop();
      setRunning(false);
      setJustFinished(true);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      player.seekTo(0);
      player.play();

      onCompleteRef.current(durationSec);
      resetTimeoutRef.current = setTimeout(() => {
        setJustFinished(false);
        setRemaining(durationSec);
        progress.setValue(0);
      }, RESET_DELAY_MS);
    }
  }, [durationSec, player, progress]);

  useEffect(() => {
    if (running) {
      endTimeRef.current = Date.now() + remaining * 1000;
      intervalRef.current = setInterval(sync, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // Re-sync the instant the app comes back to the foreground, instead of
  // waiting for the next 1s tick.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => sub.remove();
  }, [sync]);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    const fraction = 1 - remaining / durationSec;
    Animated.timing(progress, {
      toValue: fraction,
      duration: 900,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [remaining, durationSec, progress]);

  // Guided mode: vibrate (and optionally speak) when it's time to move to the next step
  const announce = useCallback((index: number) => {
    const segs = segmentsRef.current;
    if (!segs || !segs[index]) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (voiceRef.current) {
      Speech.stop();
      const label = segs[index].label;
      Speech.speak(
        index === 0
          ? `Start with ${label}`
          : index === segs.length - 1
            ? `Last step, ${label}`
            : `Next, ${label}`,
      );
    }
  }, []);

  useEffect(() => {
    const segs = segmentsRef.current;
    if (!running || !segs || segs.length === 0) return;
    const { index } = segmentInfo(segs, durationSec - remaining);
    if (index !== lastSegRef.current) {
      lastSegRef.current = index;
      announce(index);
    }
  }, [running, remaining, durationSec, announce]);

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0],
  });

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const statusLabel = justFinished
    ? "Session complete 🎉"
    : running
      ? "Relax..."
      : "Ready when you are";

  // What to show under the controls in guided mode
  const guided = !!segments && segments.length > 0;
  const started = running || remaining < durationSec;
  const info = guided ? segmentInfo(segments!, durationSec - remaining) : null;
  const now = info ? segments![info.index] : null;
  const next = info ? segments![info.index + 1] : null;
  // Head diagram: the current step's area lights up on the timer's clock (the warm-up lights the whole scalp)
  const activeZone = guided && started && now ? now.zone : null;

  return (
    <View style={styles.container}>
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.track}
          strokeWidth={STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.primary}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE}, ${CIRCUMFERENCE}`}
          strokeDashoffset={strokeDashoffset}
          rotation="-90"
          origin={`${SIZE / 2}, ${SIZE / 2}`}
        />
      </Svg>
      <View style={[styles.center, { height: SIZE }]}>
        <Text style={[styles.time, { fontSize: Math.round(SIZE * 0.165) }]}>
          {minutes}:{seconds.toString().padStart(2, "0")}
        </Text>
        <Text style={styles.subtitle}>{statusLabel}</Text>
      </View>
      <View style={styles.controls}>
        <Pressable style={styles.iconBtn} onPress={reset}>
          <Ionicons name="refresh" size={22} color={colors.primaryDark} />
        </Pressable>
        <Pressable
          style={styles.mainBtn}
          onPress={() => setRunning((r) => !r)}
          disabled={justFinished}
        >
          <Ionicons name={running ? "pause" : "play"} size={28} color="#fff" />
        </Pressable>
        <View style={{ width: 42 }} />
      </View>

      {guided && !justFinished && (
        <View style={styles.guideRow}>
          <HeadPhoto active={activeZone} size={headSize} />
          <View style={styles.guideText}>
            {started && now && info ? (
              <>
                <Text style={styles.guideNow}>{now.label}</Text>
                <Text style={styles.guideSub}>{mmss(info.secondsLeft)} left in this step</Text>
                <Text style={styles.guideSub}>{next ? `Next: ${next.label}` : "Last step"}</Text>
              </>
            ) : (
              <>
                <Text style={styles.guideNow}>Guided session</Text>
                <Text style={styles.guideSub}>{segments!.length} steps, starting with {segments![0].label}</Text>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center" },
  center: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  time: { ...typography.h1, fontSize: 40, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textMuted, marginTop: 4 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginTop: 20,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  mainBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  guideRow: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    paddingHorizontal: 12,
  },
  guideText: { alignItems: "center" },
  guideNow: { ...typography.h3, color: colors.primary, textAlign: "center" },
  guideSub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: "center",
  },
});