// components/HeadPhoto.tsx
// Two photo-real views of a head (from above and from behind). The area you should be massaging
// glows in your app colour, and the view that doesn't show the current area dims a little.
// Three areas: hairline, vertex (crown) and sides. The sides also cover the back of the head and nape.
// "all" lights the whole scalp (used for the warm-up). Images live in assets/head/.
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Image, ImageSourcePropType, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "@/constants/theme";

export type DiagramZone = "hairline" | "vertex" | "sides";
type Layer = { fill: ImageSourcePropType; rim: ImageSourcePropType };
type View_ = { base: ImageSourcePropType; aspect: number; label: string; zones: Partial<Record<DiagramZone, Layer[]>> };

const VIEWS: Record<"top" | "back", View_> = {
  top: {
    base: require("@/assets/head/top.jpg"),
    aspect: 655 / 600,
    label: "From above",
    zones: {
      hairline: [{ fill: require("@/assets/head/top-front-fill.png"), rim: require("@/assets/head/top-front-rim.png") }],
      sides: [{ fill: require("@/assets/head/top-sides-fill.png"), rim: require("@/assets/head/top-sides-rim.png") }],
      vertex: [{ fill: require("@/assets/head/top-crown-fill.png"), rim: require("@/assets/head/top-crown-rim.png") }],
    },
  },
  back: {
    base: require("@/assets/head/back.jpg"),
    aspect: 665 / 600,
    label: "From behind",
    zones: {
      // The sides area includes the back of the head and nape, so two overlays light up together
      sides: [
        { fill: require("@/assets/head/back-sides-fill.png"), rim: require("@/assets/head/back-sides-rim.png") },
        { fill: require("@/assets/head/back-back-fill.png"), rim: require("@/assets/head/back-back-rim.png") },
      ],
      vertex: [{ fill: require("@/assets/head/back-crown-fill.png"), rim: require("@/assets/head/back-crown-rim.png") }],
    },
  },
};

type Props = {
  /** The area to light up right now ("all" = whole scalp, null = none yet) */
  active: DiagramZone | "all" | null;
  /** Areas to keep softly tinted (optional) */
  done?: DiagramZone[];
  /** Width of each of the two views, in pixels */
  size?: number;
};

const ZONES: DiagramZone[] = ["hairline", "sides", "vertex"];
const NAMES: Record<DiagramZone | "all", string> = {
  hairline: "hairline, front and temples",
  sides: "sides, back and nape",
  vertex: "vertex, the crown of the head",
  all: "whole scalp",
};

export default function HeadPhoto({ active, done = [], size = 148 }: Props) {
  // one fade value per area: 1 = lit, 0.35 = done, 0 = off
  const values = useRef<Record<DiagramZone, Animated.Value>>({
    hairline: new Animated.Value(0),
    sides: new Animated.Value(0),
    vertex: new Animated.Value(0),
  }).current;
  // each view dims when it doesn't show the active area
  const focus = useRef({ top: new Animated.Value(1), back: new Animated.Value(1) }).current;

  const doneKey = done.join(",");
  useEffect(() => {
    ZONES.forEach((z) => {
      const target = active === "all" || z === active ? 1 : done.includes(z) ? 0.35 : 0;
      Animated.timing(values[z], { toValue: target, duration: 300, useNativeDriver: true }).start();
    });
    (["top", "back"] as const).forEach((v) => {
      const shows = !active || active === "all" || !!VIEWS[v].zones[active];
      Animated.timing(focus[v], { toValue: shows ? 1 : 0.5, duration: 300, useNativeDriver: true }).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, doneKey]);

  const rimOpacity = useMemo(
    () =>
      Object.fromEntries(
        ZONES.map((z) => [z, values[z].interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0, 1] })]),
      ) as Record<DiagramZone, Animated.AnimatedInterpolation<number>>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={active ? `Head diagrams, now massaging the ${NAMES[active]}` : "Head diagrams"}
    >
      {(["top", "back"] as const).map((key) => {
        const v = VIEWS[key];
        const h = size * v.aspect;
        return (
          <View key={key} style={{ width: size, alignItems: "center" }}>
            <Animated.View style={{ width: size, height: h, opacity: focus[key] }}>
              <Image source={v.base} style={{ width: size, height: h, borderRadius: 10 }} />
              {ZONES.map((z) => {
                const layers = v.zones[z];
                if (!layers) return null;
                return layers.map((layer, i) => (
                  <React.Fragment key={`${z}-${i}`}>
                    <Animated.Image
                      source={layer.fill}
                      style={[StyleSheet.absoluteFill, { width: size, height: h, tintColor: colors.primary, opacity: values[z] }]}
                    />
                    <Animated.Image
                      source={layer.rim}
                      style={[StyleSheet.absoluteFill, { width: size, height: h, opacity: rimOpacity[z] }]}
                    />
                  </React.Fragment>
                ));
              })}
            </Animated.View>
            <Text style={styles.caption}>{v.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  caption: { ...typography.caption, color: colors.textMuted, marginTop: 4 },
});