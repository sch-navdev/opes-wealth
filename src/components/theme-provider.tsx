"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

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
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
