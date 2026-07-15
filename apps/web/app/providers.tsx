"use client";

import { Toaster } from "@github-repositories-fllow/ui/components/sonner";

import Header from "@/components/header";
import { ThemeProvider } from "@/components/theme-provider";

// 客户端边界：主题、全局导航、Toaster。整站是纯前端 SPA，交给客户端渲染。
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
      storageKey="vite-ui-theme"
    >
      <div className="grid grid-rows-[auto_1fr] h-svh">
        <Header />
        {children}
      </div>
      <Toaster richColors />
    </ThemeProvider>
  );
}
