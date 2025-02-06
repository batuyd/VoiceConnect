import { createContext, ReactNode, useContext, useEffect } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { t } = useLanguage();

  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: 30000, // Cache valid for 30 seconds
  });

  // Oturum durumu değişikliklerinde temizleme işlemleri
  useEffect(() => {
    // WebSocket ve medya bağlantılarını temizle
    const cleanup = () => {
      // Mevcut WebSocket bağlantılarını kapat
      const ws = new WebSocket(`${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`);
      if (ws) {
        ws.close();
      }

      // Medya akışlarını temizle
      Array.from(document.querySelectorAll('audio, video'))
        .map(media => (media as HTMLMediaElement).srcObject)
        .filter(stream => stream instanceof MediaStream)
        .forEach(stream => {
          stream?.getTracks().forEach(track => track.stop());
        });
    };

    // Oturum durumu değiştiğinde temizlik yap
    if (!user) {
      cleanup();
    }

    // Component unmount olduğunda temizlik yap
    return cleanup;
  }, [user?.id]);

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      try {
        const res = await apiRequest("POST", "/api/login", credentials);
        if (!res.ok) {
          throw new Error(t('auth.errors.invalidCredentials'));
        }
        return await res.json();
      } catch (error: any) {
        throw new Error(error.message || t('auth.errors.loginFailed'));
      }
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      // Bağımlı sorguları geçersiz kıl
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      toast({
        description: t('auth.loginSuccess'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.errors.loginFailed'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      try {
        const res = await apiRequest("POST", "/api/register", credentials);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || t('auth.errors.registrationFailed'));
        }
        return await res.json();
      } catch (error: any) {
        throw new Error(error.message || t('auth.errors.registrationFailed'));
      }
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      toast({
        description: t('auth.registrationSuccess'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.errors.registrationFailed'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        const res = await apiRequest("POST", "/api/logout");
        if (!res.ok) {
          throw new Error(t('auth.errors.logoutFailed'));
        }
        // WebSocket ve medya bağlantılarını temizle
        Array.from(document.querySelectorAll('audio, video'))
          .map(media => (media as HTMLMediaElement).srcObject)
          .filter(stream => stream instanceof MediaStream)
          .forEach(stream => {
            stream?.getTracks().forEach(track => track.stop());
          });
      } catch (error: any) {
        throw new Error(error.message || t('auth.errors.logoutFailed'));
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear(); // Tüm önbelleği temizle
      toast({
        description: t('auth.logoutSuccess'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.errors.logoutFailed'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}