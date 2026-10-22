// components/Confetti.tsx
// A one-shot confetti burst. No extra packages: plain Animated, runs on the native driver.
// Usage: <Confetti active={done} />  (render it above your content; it ignores touches)
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { colors } from '@/constants/theme';

const DURATION_MS = 2600;
const GRAVITY = 1100; // px per second squared
const SAMPLES = 12; // points used to approximate each particle's arc

const PALETTE = [colors.primary, colors.secondary, colors.accent, '#F4B942'];

type Particle = {
  key: number;
  color: string;
  w: number;
  h: number;
  round: boolean;
  xs: number[];
  ys: number[];
  spin: number;
};

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, key) => {
    // Fan upward (-160 to -20 degrees), then gravity pulls everything down.
    const angle = ((-160 + Math.random() * 140) * Math.PI) / 180;
    const speed = 380 + Math.random() * 520;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const sec = ((i / SAMPLES) * DURATION_MS) / 1000;
      xs.push(vx * sec);
      ys.push(vy * sec + 0.5 * GRAVITY * sec * sec);
    }
    const round = Math.random() < 0.3;
    return {
      key,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      w: round ? 9 : 8 + Math.random() * 4,
      h: round ? 9 : 12 + Math.random() * 6,
      round,
      xs,
      ys,
      spin: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 720),
    };
  });
}

type Props = {
  active: boolean;
  count?: number;
  /** Where the burst starts, as a fraction of the screen height from the top. */
  originY?: number;
};

export default function Confetti({ active, count = 60, originY = 0.4 }: Props) {
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const particles = useMemo(() => (active ? makeParticles(count) : []), [active, count]);

  useEffect(() => {
    if (!active) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [active, progress]);

  if (!active) return null;

  const inputRange = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p) => (
        <Animated.View
          key={p.key}
          style={{
            position: 'absolute',
            left: width / 2 - p.w / 2,
            top: height * originY,
            width: p.w,
            height: p.h,
            borderRadius: p.round ? p.w / 2 : 2,
            backgroundColor: p.color,
            opacity: progress.interpolate({
              inputRange: [0, 0.05, 0.8, 1],
              outputRange: [0, 1, 1, 0],
            }),
            transform: [
              { translateX: progress.interpolate({ inputRange, outputRange: p.xs }) },
              { translateY: progress.interpolate({ inputRange, outputRange: p.ys }) },
              {
                rotate: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', `${p.spin}deg`],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}