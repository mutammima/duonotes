import { Ionicons } from '@expo/vector-icons';
import { Canvas, ImageFormat, Path, Skia, useCanvasRef } from '@shopify/react-native-skia';
import { useReducer, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const PEN_COLORS = ['#1A1618', '#E6488E', '#FB7185', '#9B7EDE', '#3C87F7'];
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
 * Freehand sketch modal. Draw with a finger, tap Done to flatten the canvas
 * into a PNG data URI, which the caller inserts into the note the same way
 * as a picked photo (`editor.setImage(...)`).
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
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[1]);
  const currentPoints = useRef<Point[]>([]);
  const [, forceTick] = useReducer((c) => c + 1, 0);

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
    const image = canvasRef.current?.makeImageSnapshot();
    if (image) {
      const base64 = image.encodeToBase64(ImageFormat.PNG);
      onSave(`data:image/png;base64,${base64}`);
    }
    setStrokes([]);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => close(false)}>
      {/* RN's Modal mounts a separate native view hierarchy on iOS, so the app
          root's GestureHandlerRootView doesn't reach inside it — without this,
          the drawing Pan gesture silently never fires. */}
      <GestureHandlerRootView style={styles.flex}>
      <View
        style={[
          styles.container,
          { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}>

        <View style={styles.header}>
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
          <View style={styles.canvasWrap}>
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
          </View>
        </GestureDetector>

        <View style={[styles.toolbar, { borderTopColor: theme.backgroundSelected }]}>
          <View style={styles.swatchRow}>
            {PEN_COLORS.map((c) => (
              <Pressable key={c} onPress={() => setColor(c)} hitSlop={4}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: c },
                    color === c && { borderColor: theme.text, borderWidth: 2 },
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
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  canvasWrap: { flex: 1, backgroundColor: '#FFFFFF' },
  canvas: { flex: 1 },
  toolbar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
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
