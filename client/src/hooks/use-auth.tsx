// Authentication has been disabled
import { createContext } from "react";

export const AuthContext = createContext(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useAuth() {
  return { user: null, isLoading: false, error: null };
}