import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "./hooks/use-auth";
import { LanguageProvider } from "./hooks/use-language";
import { ThemeProvider } from "./hooks/use-theme";
import { AudioSettingsProvider } from "./hooks/use-audio-settings";
import { RefreshFriendshipProvider } from "./hooks/use-friendship-refresh";
import { ProtectedRoute } from "./lib/protected-route";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import HomePage from "@/pages/home-page";
import ProfilePage from "@/pages/profile-page";
import SettingsPage from "@/pages/settings-page";
import { SettingsDialog } from "@/components/settings-dialog";
import { CoinDisplay } from "@/components/coin-display";
import { LanguageSelector } from "@/components/language-selector";
import { useAuth } from "@/hooks/use-auth";
import { useWebSocket } from "./hooks/use-websocket";
import React from "react";

function Header() {
  const { user } = useAuth();
  const { connectionStatus } = useWebSocket();

  if (!user) return null;

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50 border-b">
      <div className="container h-full mx-auto flex items-center justify-between px-4">
        <LanguageSelector />
        <div className="flex items-center gap-4">
          <CoinDisplay />
          <SettingsDialog />
        </div>
      </div>
    </header>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-900">
      <Header />
      <main className={user ? "pt-16" : ""}>
        {children}
      </main>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute path="/" component={HomePage} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <RefreshFriendshipProvider>
              <AudioSettingsProvider>
                <Layout>
                  <Router />
                </Layout>
                <Toaster />
              </AudioSettingsProvider>
            </RefreshFriendshipProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;