import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "./hooks/use-auth";
import { LanguageProvider } from "./hooks/use-language";
import { ThemeProvider } from "./hooks/use-theme";
import { AudioSettingsProvider } from "./hooks/use-audio-settings";
import { ProtectedRoute } from "./lib/protected-route";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import HomePage from "@/pages/home-page";
import ProfilePage from "@/pages/profile-page";
import SettingsPage from "@/pages/settings-page";
import { SettingsDialog } from "@/components/settings-dialog";
import { CoinDisplay } from "@/components/coin-display";
import { useAuth } from "@/hooks/use-auth";
import { useWebSocket } from "./hooks/use-websocket";
import React from "react";

function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // WebSocket hook'unu burada çağırıyoruz
  useWebSocket();

  return (
    <div className="min-h-screen bg-gray-900">
      {children}
      {user && (
        <>
          <div className="fixed top-4 right-4 z-50">
            <CoinDisplay />
          </div>
          <div className="fixed bottom-4 right-4 z-50">
            <SettingsDialog />
          </div>
        </>
      )}
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
            <AudioSettingsProvider>
              <Layout>
                <Router />
              </Layout>
              <Toaster />
            </AudioSettingsProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;