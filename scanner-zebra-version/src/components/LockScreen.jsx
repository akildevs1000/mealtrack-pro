import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Vibration,
  ActivityIndicator,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { loginManager } from "../api/client";
import { useTheme, radii, spacing } from "../lib/theme";

const PIN_MAX = 4;
const PIN_MIN = 4;
const DOT_COUNT = PIN_MIN;

// `manager` is { id, username, name, campCode }. `deviceMac` is REQUIRED —
// the server rejects login without a registered device MAC.
// `onUnlock(payload)` receives { manager, device, camp, campMismatch } from the server.
export default function LockScreen({ manager, deviceMac, onUnlock }) {
  // `site` kept as a local alias for legacy styles below — same shape.
  const site = manager
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const keyGap = 12;
  const sidePad = spacing.lg;
  const padInnerW = Math.max(0, width - sidePad * 2);
  // 3-column grid that fills the row width (capped so keys don't get oversized
  // on tablets). Height is also bounded by the space left under the header so
  // all 4 rows fit on short screens — on phones the keys grow to fill instead
  // of staying clustered at the old fixed 68×54 size.
  const keyW = Math.min(120, Math.floor((padInnerW - keyGap * 2) / 3));
  const availH = height - insets.top - insets.bottom - spacing.md * 2;
  const maxKeyH = Math.floor((availH - 210 - keyGap * 3) / 4);
  const keyH = Math.max(48, Math.min(keyW, maxKeyH));

  const lockBadgeSize = Math.min(88, Math.max(60, Math.round(width * 0.18)));
  const lockIconSize = Math.round(lockBadgeSize * 0.5);
  const keyIconSize = Math.max(22, Math.min(30, Math.round(keyH * 0.42)));
  const keyFontSize = Math.max(22, Math.min(34, Math.round(keyH * 0.46)));

  const styles = makeStyles(colors, {
    keyW,
    keyH,
    keyGap,
    sidePad,
    insets,
    lockBadgeSize,
    keyFontSize,
  });
  const [pin, setPin] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const push = (ch) => {
    if (busy) return;
    setError(null);
    setPin((p) => (p.length >= PIN_MAX ? p : p + ch));
  };
  const back = () => {
    if (busy) return;
    setError(null);
    setPin((p) => p.slice(0, -1));
  };

  const submit = async () => {
    if (busy || pin.length < PIN_MIN) return;
    setBusy(true);
    try {
      const result = await loginManager({
        managerId: manager.id,
        pin,
        deviceMac,
      });
      if (result?.error === "device_not_registered") {
        setError(result.message || "This device is not registered. Ask an admin.");
        Vibration.vibrate(120);
        setPin("");
      } else if (result?.token) {
        onUnlock(result);
      } else {
        setError("Incorrect PIN");
        Vibration.vibrate(120);
        setPin("");
      }
    } catch {
      setError("Could not verify. Check network.");
    } finally {
      setBusy(false);
    }
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const overflow = Math.max(0, pin.length - DOT_COUNT);

  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.topScroll}
        contentContainerStyle={styles.topScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.top}>
          <View style={styles.lockBadge}>
            <Ionicons
              name="lock-closed"
              size={lockIconSize}
              color={colors.primary}
            />
          </View>
          <Text style={styles.title}>Scanner locked</Text>

          <View style={styles.dots}>
            {Array.from({ length: DOT_COUNT }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i < pin.length ? styles.dotFilled : null]}
              />
            ))}
            {overflow > 0 && <Text style={styles.overflow}>+{overflow}</Text>}
          </View>

          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <View style={styles.errorSpacer} />
          )}
        </View>
      </ScrollView>

      <View style={styles.pad}>
        {keys.map((k) => (
          <Pressable
            key={k}
            onPress={() => push(k)}
            style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
            android_ripple={{
              color: colors.surfaceContainerHigh,
              borderless: true,
            }}
          >
            <Text style={styles.keyText}>{k}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={back}
          style={({ pressed }) => [
            styles.key,
            styles.keyAux,
            pressed && { opacity: 0.6 },
          ]}
          android_ripple={{
            color: colors.surfaceContainerHigh,
            borderless: true,
          }}
        >
          <Ionicons
            name="backspace-outline"
            size={keyIconSize}
            color={colors.onSurfaceVariant}
          />
        </Pressable>
        <Pressable
          onPress={() => push("0")}
          style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
          android_ripple={{
            color: colors.surfaceContainerHigh,
            borderless: true,
          }}
        >
          <Text style={styles.keyText}>0</Text>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={busy || pin.length < PIN_MIN}
          style={({ pressed }) => [
            styles.key,
            styles.keySubmit,
            (busy || pin.length < PIN_MIN) && styles.keyDisabled,
            pressed && styles.keyPressed,
          ]}
          android_ripple={{ color: "#1d4ed8", borderless: true }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="arrow-forward" size={keyIconSize} color="#fff" />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (
  colors,
  { keyW, keyH, keyGap, sidePad, insets, lockBadgeSize, keyFontSize },
) =>
  StyleSheet.create({
    wrap: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: colors.background,
      paddingHorizontal: sidePad,
      paddingTop: insets.top + spacing.md,
      paddingBottom: insets.bottom + spacing.md,
      zIndex: 90,
    },
    topScroll: { flexShrink: 1, flexGrow: 1 },
    topScrollContent: {
      flexGrow: 1,
      justifyContent: "flex-start",
      paddingVertical: spacing.xs,
    },
    top: { alignItems: "center" },
    lockBadge: {
      width: lockBadgeSize,
      height: lockBadgeSize,
      borderRadius: lockBadgeSize / 2,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 0,
    },
    title: {
      color: colors.onSurface,
      fontSize: 22,
      fontWeight: "700",
      letterSpacing: -0.3,
    },
    subtitle: {
      color: colors.onSurfaceVariant,
      fontSize: 14,
      marginTop: spacing.sm,
      textAlign: "center",
    },
    siteName: { color: colors.primary, fontWeight: "700" },
    siteCode: {
      color: colors.textMuted,
      fontFamily: "monospace",
      fontSize: 12,
      marginTop: 2,
      letterSpacing: 1,
    },
    dots: {
      flexDirection: "row",
      gap: 14,
      marginTop: spacing.lg,
      alignItems: "center",
    },
    dot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 1.5,
      borderColor: colors.outlineVariant,
      backgroundColor: "transparent",
    },
    dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
    overflow: {
      color: colors.textMuted,
      fontSize: 13,
      marginLeft: 6,
      fontWeight: "600",
    },
    error: {
      color: colors.danger,
      fontSize: 14,
      fontWeight: "600",
      marginTop: spacing.sm,
    },
    errorSpacer: { height: 14, marginTop: spacing.sm },

    pad: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: keyGap,
      paddingBottom: 0,
    },
    key: {
      width: keyW,
      height: keyH,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      alignItems: "center",
      justifyContent: "center",
    },
    keyPressed: { backgroundColor: colors.surfaceContainerHigh },
    keyText: {
      color: colors.onSurface,
      fontSize: keyFontSize,
      fontWeight: "600",
    },
    keyAux: { backgroundColor: "transparent", borderColor: "transparent" },
    keySubmit: {
      backgroundColor: colors.primaryAccent,
      borderColor: colors.primaryAccent,
    },
    keyDisabled: { opacity: 0.4 },
  });
