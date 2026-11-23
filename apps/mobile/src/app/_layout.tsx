import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '../theme';

/** The one route directory: a plain stack with no header (the screen draws its own pivot header). */
export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.canvas },
        }}
      />
    </>
  );
}
