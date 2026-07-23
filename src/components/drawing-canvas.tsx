import { Ionicons } from '@expo/vector-icons';
import { Canvas, Path, Skia, useCanvasRef, type SkPath } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ACCENTS, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DrawingInsertPayload } from '@/lib/drawing-bridge';

const STROKE_WIDTHS = [3, 6, 10];

type Point = { x: number; y: number };
type Stroke = { path: SkPath; points: Point[]; color: string; width: number };

function pathFromPoints(points: Point[]) {
  const path = Skia.Path.Make();
  if (points.length === 0) return path;
  path.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) path.lineTo(points[i].x, points[i].y);
  return path;
}

/**
 * Freehand sketch overlay, styled after Apple Notes' own markup tool: no
 * separate Cancel/Sketch/Done bar — the pen toggle that opened this (in
 * RichNoteEditor's toolbar) is mirrored here as the leftmost bottom-bar
 * button, and tapping it again commits whatever was drawn (or exits cleanly
 * if nothing was) via `onExit`. A transparent Skia canvas layers directly on
 * top of the note's RichText WebView (rendered as a later sibling in
 * RichNoteEditor) so the existing text/images stay visible while drawing —
 * ink can be aligned against specific words instead of sketching on a blank
 * surface.
 *
 * The parent mounts this only while sketching, so every open starts from a
 * fresh instance — no strokes carried over, and the default ink color
 * re-initialises to one that's visible against the current theme.
 *
 * Note: any top-anchored element added here must NOT call
 * `useSafeAreaInsets().top` — the ancestor SafeAreaView (note/[id].tsx) has
 * already applied that inset once for the whole screen; double-applying it
 * is what used to push a since-removed header bar down with an empty gap
 * above it.
 */
export function DrawingCanvas({
  onExit,
  anchorOffset,
}: {
  onExit: (drawing: DrawingInsertPayload | null) => void;
  /** This canvas's own screen position relative to the note's RichText
   *  WebView, in RN points (from RichNoteEditor's `measureInWindow` on both).
   *  Since this canvas otherwise renders as an absolute-fill overlay with no
   *  header above it, its own (0,0) is that WebView's (0,0) MINUS this offset
   *  — used to translate a stroke's on-screen position into a WebView-local
   *  coordinate the web bridge can resolve with `posAtCoords`. */
  anchorOffset: { x: number; y: number };
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const canvasRef = useCanvasRef();
  const penColors = useMemo(() => [theme.text, ...Object.values(ACCENTS)], [theme.text]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState<string>(theme.text);
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[1]);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);

  // Functional state updates throughout, so this never needs `currentPoints`
  // itself in its dependency array — memoizing on just [color, strokeWidth]
  // still always sees the latest in-progress points.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onStart((e) => setCurrentPoints([{ x: e.x, y: e.y }]))
        .onUpdate((e) => setCurrentPoints((pts) => [...pts, { x: e.x, y: e.y }]))
        .onEnd(() =>
          setCurrentPoints((pts) => {
            if (pts.length > 0) {
              setStrokes((s) => [...s, { path: pathFromPoints(pts), points: pts, color, width: strokeWidth }]);
            }
            return [];
          }),
        ),
    [color, strokeWidth],
  );

  // Android hardware back should behave like tapping the pen toggle again
  // (commit-and-exit), not fall through to the note screen's own back nav.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleExit();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes]);

  function handleExit() {
    if (strokes.length === 0) {
      onExit(null);
      return;
    }

    // Crop to the ink's bounding box so the drawing lands at the size it was
    // actually drawn, and translate points into that box's own coordinate
    // space so the exported SVG viewBox starts at 0,0.
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const s of strokes) {
      const pad = s.width / 2 + 2; // round caps extend past the centerline
      for (const p of s.points) {
        left = Math.min(left, p.x - pad);
        top = Math.min(top, p.y - pad);
        right = Math.max(right, p.x + pad);
        bottom = Math.max(bottom, p.y + pad);
      }
    }
    if (!Number.isFinite(left) || right <= left || bottom <= top) {
      onExit(null);
      return;
    }

    // The ink's own bbox center, in THIS canvas's local coordinate space —
    // still untranslated at this point (the crop-into-0..w/0..h step below is
    // for the exported SVG only). Corrected by `anchorOffset` because this
    // canvas has no header of its own to offset against; its (0,0) sits
    // `anchorOffset` away from the WebView's (0,0) that the web bridge's
    // `posAtCoords` call actually needs coordinates relative to.
    const anchor = { x: (left + right) / 2 - anchorOffset.x, y: (top + bottom) / 2 - anchorOffset.y };

    const w = Math.max(1, Math.ceil(right - left));
    const h = Math.max(1, Math.ceil(bottom - top));
    const serialized = strokes.map((s) => ({
      // 1 decimal is well below what's visible and keeps the note body small.
      d: s.points.map((p) => `${(p.x - left).toFixed(1)},${(p.y - top).toFixed(1)}`).join(' '),
      c: s.color,
      w: s.width,
    }));

    onExit({ strokes: serialized, w, h, anchor });
    setStrokes([]);
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={pan}>
        <Canvas ref={canvasRef} style={styles.canvas}>
          {strokes.map((s, i) => (
            <Path
              key={i}
              path={s.path}
              color={s.color}
              style="stroke"
              strokeWidth={s.width}
              strokeCap="round"
              strokeJoin="round"
            />
          ))}
          {currentPoints.length > 1 && (
            <Path
              path={pathFromPoints(currentPoints)}
              color={color}
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="round"
              strokeJoin="round"
            />
          )}
        </Canvas>
      </GestureDetector>

      <View
        style={[
          styles.toolbar,
          {
            backgroundColor: theme.backgroundElement,
            borderTopColor: theme.backgroundSelected,
            paddingBottom: insets.bottom + Spacing.three,
          },
        ]}>
        <View style={styles.swatchRow}>
          {penColors.map((c) => (
            <Pressable key={c} onPress={() => setColor(c)} hitSlop={4}>
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: c },
                  // theme.accent, not theme.text — the first swatch IS
                  // theme.text, so a text-colored ring would be invisible
                  // against its own fill when that swatch is selected.
                  color === c && { borderColor: theme.accent, borderWidth: 2 },
                ]}
              />
            </Pressable>
          ))}
        </View>
        <View style={styles.actionsRow}>
          <View style={styles.widthRow}>
            {STROKE_WIDTHS.map((w) => (
              <Pressable key={w} onPress={() => setStrokeWidth(w)} style={styles.widthDotWrap} hitSlop={6}>
                <View
                  style={{
                    width: w * 2,
                    height: w * 2,
                    borderRadius: w,
                    backgroundColor: strokeWidth === w ? theme.accent : theme.textSecondary,
                  }}
                />
              </Pressable>
            ))}
          </View>
          <View style={styles.actionsRow}>
            {/* This button only ever renders while sketching is active, so it's
                permanently shown in its "on" look — matching Ionicons'
                outline/filled convention this app already uses elsewhere
                (e.g. people / people-outline). */}
            <Pressable
              onPress={handleExit}
              hitSlop={8}
              style={[styles.penButton, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name="brush" size={22} color={theme.accent} />
            </Pressable>
            <Pressable
              onPress={() => setStrokes((s) => s.slice(0, -1))}
              disabled={strokes.length === 0}
              hitSlop={8}
              style={styles.actionButton}>
              <Ionicons
                name="arrow-undo-outline"
                size={22}
                color={strokes.length === 0 ? theme.backgroundSelected : theme.text}
              />
            </Pressable>
            <Pressable
              onPress={() => setStrokes([])}
              disabled={strokes.length === 0}
              hitSlop={8}
              style={styles.actionButton}>
              <Ionicons
                name="trash-outline"
                size={22}
                color={strokes.length === 0 ? theme.backgroundSelected : '#E5484D'}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1 },
  toolbar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  swatchRow: { flexDirection: 'row', gap: Spacing.three, justifyContent: 'center' },
  swatch: { width: 32, height: 32, borderRadius: 16 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  widthRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  widthDotWrap: { alignItems: 'center', justifyContent: 'center', width: 28, height: 28 },
  actionButton: { padding: Spacing.one },
  penButton: { padding: Spacing.one, borderRadius: 999 },
});
