"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Storage key of the theme choice. It was the library default (`theme`) while the app was dark-only, and many
 * browsers still hold an old `dark` there that would override the device setting forever. A new key starts
 * everyone on Device once; from then on an explicit Light or Dark choice is remembered as before.
 */
export const THEME_STORAGE_KEY = "opes-theme-v2";

/**
 * The app follows the device's light/dark setting until the user picks one explicitly (Light, Dark or Device
 * in `ThemeToggle`). `next-themes` writes the choice to localStorage and sets the `dark` class on <html>
 * before first paint, so there is no flash; a stored "light" or "dark" from earlier visits is kept.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey={THEME_STORAGE_KEY}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
