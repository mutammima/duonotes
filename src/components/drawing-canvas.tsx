import { Ionicons } from '@expo/vector-icons';
import { Canvas, ImageFormat, Path, Skia, useCanvasRef } from '@shopify/react-native-skia';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Accent swatches; the first slot is filled in with the current theme's text
 *  color at render time so the default ink is always readable. */
const ACCENT_COLORS = ['#E6488E', '#FB7185', '#9B7EDE', '#3C87F7'];
const STROKE_WIDTHS = [3, 6, 10];

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; width: number };

function pathFromPoints(points: Point[]) {
  const path = Skia.Path.Make();
  if (points.length === 0) return path;
  path.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) path.lineTo(points[i].x, points[i].y);
  return path;
}

/**
 * Freehand sketch overlay. A transparent Skia canvas layers directly on top
 * of the note's RichText WebView (rendered as a later sibling in
 * RichNoteEditor) so the existing text/images stay visible while drawing —
 * ink can be aligned against specific words instead of sketching on a blank
 * surface. Tap Done to flatten the strokes into a transparent PNG data URI,
 * which the caller inserts at the cursor the same way as a picked photo
 * (`editor.setImage(...)`).
 */
export function DrawingCanvas({
  visible,
  onCancel,
  onSave,
}: {
  visible: boolean;
  onCancel: () => void;
  onSave: (dataUri: string) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const canvasRef = useCanvasRef();
  const penColors = [theme.text, ...ACCENT_COLORS];
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState<string>(theme.text);
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[1]);
  const currentPoints = useRef<Point[]>([]);
  const [, forceTick] = useReducer((c) => c + 1, 0);

  // Reset to a fresh sketch — and a default ink color that's actually visible
  // against the current theme — every time the overlay opens.
  useEffect(() => {
    if (visible) setColor(theme.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onStart((e) => {
      currentPoints.current = [{ x: e.x, y: e.y }];
      forceTick();
    })
    .onUpdate((e) => {
      currentPoints.current = [...currentPoints.current, { x: e.x, y: e.y }];
      forceTick();
    })
    .onEnd(() => {
      const points = currentPoints.current;
      if (points.length > 0) {
        setStrokes((s) => [...s, { points, color, width: strokeWidth }]);
      }
      currentPoints.current = [];
      forceTick();
    });

  function close(clear: boolean) {
    if (clear) setStrokes([]);
    onCancel();
  }

  function handleDone() {
    // No background fill here (unlike the old standalone modal) — this
    // canvas is meant to composite over the note, so the export stays
    // transparent and only the ink strokes get inserted.
    const image = canvasRef.current?.makeImageSnapshot();
    if (image) {
      const base64 = image.encodeToBase64(ImageFormat.PNG);
      onSave(`data:image/png;base64,${base64}`);
    }
    setStrokes([]);
  }

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <View
        style={[
          styles.header,
          { backgroundColor: theme.backgroundElement, paddingTop: insets.top + Spacing.two },
        ]}>
        <Pressable onPress={() => close(true)} hitSlop={10}>
          <ThemedText type="link" style={{ color: theme.accent }}>
            Cancel
          </ThemedText>
        </Pressable>
        <ThemedText type="smallBold">Sketch</ThemedText>
        <Pressable onPress={handleDone} hitSlop={10} disabled={strokes.length === 0}>
          <ThemedText
            type="link"
            style={{ color: strokes.length === 0 ? theme.textSecondary : theme.accent }}>
            Done
          </ThemedText>
        </Pressable>
      </View>

      <GestureDetector gesture={pan}>
        <Canvas ref={canvasRef} style={styles.canvas}>
          {strokes.map((s, i) => (
            <Path
              key={i}
              path={pathFromPoints(s.points)}
              color={s.color}
              style="stroke"
              strokeWidth={s.width}
              strokeCap="round"
              strokeJoin="round"
            />
          ))}
          {currentPoints.current.length > 1 && (
            <Path
              path={pathFromPoints(currentPoints.current)}
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
                  style={[
                    styles.widthDot,
                    {
                      width: w * 2,
                      height: w * 2,
                      borderRadius: w,
                      backgroundColor: strokeWidth === w ? theme.accent : theme.textSecondary,
                    },
                  ]}
                />
              </Pressable>
            ))}
          </View>
          <View style={styles.actionsRow}>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
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
  widthDot: {},
  actionButton: { padding: Spacing.one },
});
