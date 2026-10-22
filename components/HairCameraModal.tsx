// components/HairCameraModal.tsx
// A camera made for consistent hair photos:
//  - a framing guide drawn on the preview (for when you CAN see the screen)
//  - a 5 / 10 second timer with a voice countdown and vibration (for when you can't)
//  - a "level" cue: the phone vibrates and says "Level" when it's flat (top view) or upright (front view)
//  - a preview to retake or use the photo
// Needs: npx expo install expo-camera expo-speech expo-haptics expo-sensors
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import { Accelerometer } from "expo-sensors";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, radii, spacing, typography } from "@/constants/theme";
import { PhotoGuideContent, markPhotoGuideSeen } from "@/components/PhotoGuide";

type Pose = "top" | "front";
type Phase = "live" | "counting" | "review";

const POSE_KEY = "@hair_massage/photo_pose"; // remember the last pose so photos stay consistent
const TIMER_KEY = "@hair_massage/photo_timer";
const LEVEL_THRESHOLD = 0.97; // about 14 degrees from perfectly flat/upright

type Props = {
  visible: boolean;
  onClose: () => void;
  onCaptured: (uri: string) => void;
};

export default function HairCameraModal({ visible, onClose, onCaptured }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [facing, setFacing] = useState<"back" | "front">("back");
  const [pose, setPose] = useState<Pose>("top");
  const [timerSec, setTimerSec] = useState(10);
  const [phase, setPhase] = useState<Phase>("live");
  const [count, setCount] = useState(0);
  const [level, setLevel] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  // Refs so the sensor listener always sees the latest values
  const poseRef = useRef<Pose>("top");
  const phaseRef = useRef<Phase>("live");
  const levelRef = useRef(false);
  const lastCueRef = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    poseRef.current = pose;
  }, [pose]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Restore the last pose and timer you used
  useEffect(() => {
    if (!visible) return;
    setPhase("live");
    setPhotoUri(null);
    setShowGuide(false);
    AsyncStorage.multiGet([POSE_KEY, TIMER_KEY]).then(([[, p], [, t]]) => {
      if (p === "top" || p === "front") setPose(p);
      if (t === "0" || t === "5" || t === "10") setTimerSec(Number(t));
    });
  }, [visible]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    Speech.stop();
  }, []);

  // Level sensor
  useEffect(() => {
    if (!visible) return;
    Accelerometer.setUpdateInterval(250);
    const sub = Accelerometer.addListener(({ y, z }) => {
      const ok =
        poseRef.current === "top"
          ? Math.abs(z) >= LEVEL_THRESHOLD
          : Math.abs(y) >= LEVEL_THRESHOLD;
      if (ok !== levelRef.current) {
        levelRef.current = ok;
        setLevel(ok);
        // Cue once when it becomes level (at most every 3 seconds)
        if (ok && Date.now() - lastCueRef.current > 3000 && phaseRef.current !== "review") {
          lastCueRef.current = Date.now();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (phaseRef.current === "counting") Speech.speak("Level");
        }
      }
    });
    return () => sub.remove();
  }, [visible]);

  // Clean up when closed
  useEffect(() => {
    if (!visible) clearTimers();
    return clearTimers;
  }, [visible, clearTimers]);

  const choosePose = (p: Pose) => {
    setPose(p);
    AsyncStorage.setItem(POSE_KEY, p);
  };
  const chooseTimer = (t: number) => {
    setTimerSec(t);
    AsyncStorage.setItem(TIMER_KEY, String(t));
  };

  const capture = async () => {
    try {
      const pic = await cameraRef.current?.takePictureAsync({ quality: 0.8 });
      if (pic?.uri) {
        setPhotoUri(pic.uri);
        setPhase("review");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }
      throw new Error("no photo");
    } catch {
      setPhase("live");
      Alert.alert("Couldn't take the photo", "Please try again.");
    }
  };

  const startShot = () => {
    if (timerSec === 0) {
      capture();
      return;
    }
    clearTimers();
    setPhase("counting");
    let n = timerSec;
    setCount(n);
    Speech.speak(
      timerSec >= 10 ? `Photo in ${timerSec} seconds. Hold the phone steady.` : "Hold steady.",
    );

    const tick = () => {
      n -= 1;
      if (n > 0) {
        setCount(n);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (n <= 3) {
          Speech.stop();
          Speech.speak(String(n));
        }
        timers.current.push(setTimeout(tick, 1000));
      } else {
        setCount(0);
        capture();
      }
    };
    timers.current.push(setTimeout(tick, 1000));
  };

  const cancelCountdown = () => {
    clearTimers();
    setPhase("live");
  };

  const close = () => {
    clearTimers();
    onClose();
  };

  const usePhoto = () => {
    if (photoUri) onCaptured(photoUri);
    close();
  };

  // ---- screens ----
  const renderBody = () => {
    if (showGuide) {
      return (
        <PhotoGuideContent
          doneLabel="Back to camera"
          onDone={() => {
            markPhotoGuideSeen();
            setShowGuide(false);
          }}
        />
      );
    }

    if (!permission) return <View style={styles.dark} />;

    if (!permission.granted) {
      return (
        <SafeAreaView style={[styles.dark, styles.center]}>
          <Text style={styles.permTitle}>Camera access needed</Text>
          <Text style={styles.permBody}>Allow the camera to take hair progress photos.</Text>
          <Pressable style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Allow camera</Text>
          </Pressable>
          <Pressable onPress={close} style={{ marginTop: spacing.md }}>
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </SafeAreaView>
      );
    }

    if (phase === "review" && photoUri) {
      return (
        <SafeAreaView style={styles.dark}>
          <Image source={{ uri: photoUri }} style={styles.reviewImage} resizeMode="contain" />
          <Text style={styles.reviewHint}>
            Is your hair or parting clear, bright and in the frame?
          </Text>
          <View style={styles.reviewRow}>
            <Pressable
              style={[styles.reviewBtn, styles.reviewBtnAlt]}
              onPress={() => {
                setPhotoUri(null);
                setPhase("live");
              }}
            >
              <Text style={[styles.reviewBtnText, { color: "#fff" }]}>Retake</Text>
            </Pressable>
            <Pressable style={styles.reviewBtn} onPress={usePhoto}>
              <Text style={styles.reviewBtnText}>Use photo</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    const levelText =
      pose === "top"
        ? level
          ? "Level ✓"
          : "Hold the phone flat"
        : level
          ? "Upright ✓"
          : "Hold the phone upright";

    return (
      <View style={styles.dark}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

        {/* Framing guide */}
        <View style={styles.guideWrap} pointerEvents="none">
          {pose === "top" ? (
            <View style={styles.guideBox}>
              <View style={styles.guideLineV} />
              <Text style={styles.guideText}>Line your parting up with this line</Text>
            </View>
          ) : (
            <View style={styles.guideOval}>
              <View style={styles.guideLineH} />
              <Text style={styles.guideText}>Hairline on this line</Text>
            </View>
          )}
        </View>

        <SafeAreaView style={styles.overlay} pointerEvents="box-none">
          {/* top bar */}
          <View style={styles.topBar}>
            <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close camera">
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
            <View style={[styles.levelPill, level && styles.levelPillOk]}>
              <Text style={styles.levelText}>{levelText}</Text>
            </View>
            <Pressable onPress={() => setShowGuide(true)} hitSlop={12} accessibilityLabel="Photo guide">
              <Ionicons name="help-circle-outline" size={28} color="#fff" />
            </Pressable>
          </View>

          {phase === "counting" && (
            <View style={styles.countWrap} pointerEvents="none">
              <Text style={styles.countText}>{count}</Text>
            </View>
          )}

          {/* bottom controls */}
          <View style={styles.bottom}>
            {phase === "live" && (
              <>
                <View style={styles.chipRow}>
                  {(["top", "front"] as const).map((p) => (
                    <Pressable
                      key={p}
                      style={[styles.chip, pose === p && styles.chipActive]}
                      onPress={() => choosePose(p)}
                    >
                      <Text style={[styles.chipText, pose === p && styles.chipTextActive]}>
                        {p === "top" ? "Top view" : "Front view"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.chipRow}>
                  {[0, 5, 10].map((t) => (
                    <Pressable
                      key={t}
                      style={[styles.chip, timerSec === t && styles.chipActive]}
                      onPress={() => chooseTimer(t)}
                    >
                      <Text style={[styles.chipText, timerSec === t && styles.chipTextActive]}>
                        {t === 0 ? "No timer" : `${t}s timer`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <View style={styles.shutterRow}>
              <View style={{ width: 48 }} />
              {phase === "counting" ? (
                <Pressable style={styles.cancelBtn} onPress={cancelCountdown}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.shutter} onPress={startShot} accessibilityLabel="Take photo">
                  <View style={styles.shutterInner} />
                </Pressable>
              )}
              <Pressable
                style={styles.flip}
                onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
                accessibilityLabel="Switch camera"
                disabled={phase === "counting"}
              >
                <Ionicons name="camera-reverse-outline" size={26} color="#fff" />
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {renderBody()}
    </Modal>
  );
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.lg },
  overlay: { flex: 1, justifyContent: "space-between" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  levelPill: {
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  levelPillOk: { backgroundColor: "rgba(46,160,67,0.9)" },
  levelText: { ...typography.caption, color: "#fff", fontWeight: "700" },
  guideWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  guideBox: {
    width: "78%",
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.8)",
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  guideOval: {
    width: "68%",
    aspectRatio: 0.75,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.8)",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  guideLineV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  guideLineH: {
    position: "absolute",
    top: "22%",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  guideText: {
    ...typography.caption,
    color: "#fff",
    marginBottom: spacing.sm,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowRadius: 4,
    textAlign: "center",
  },
  countWrap: { position: "absolute", top: "35%", left: 0, right: 0, alignItems: "center" },
  countText: {
    fontSize: 96,
    fontWeight: "800",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 8,
  },
  bottom: { paddingBottom: spacing.lg, gap: spacing.sm },
  chipRow: { flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  chipActive: { backgroundColor: "#fff" },
  chipText: { ...typography.caption, color: "#fff" },
  chipTextActive: { color: "#000", fontWeight: "700" },
  shutterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff" },
  cancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radii.pill,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  cancelText: { ...typography.body, color: "#fff", fontWeight: "700" },
  flip: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  reviewImage: { flex: 1, width: "100%" },
  reviewHint: { ...typography.body, color: "#fff", textAlign: "center", padding: spacing.md },
  reviewRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg },
  reviewBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: "#fff",
  },
  reviewBtnAlt: { backgroundColor: "rgba(255,255,255,0.18)" },
  reviewBtnText: { ...typography.body, fontWeight: "700", color: "#000" },
  permTitle: { ...typography.h3, color: "#fff" },
  permBody: { ...typography.body, color: "#ccc", marginTop: spacing.xs, textAlign: "center" },
  permBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
  },
  permBtnText: { ...typography.body, color: "#fff", fontWeight: "700" },
  link: { ...typography.body, color: "#ccc" },
});