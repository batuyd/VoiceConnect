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
  friendRequests: SelectUser[];
  friendRequestsLoading: boolean;
  acceptFriendRequestMutation: UseMutationResult<void, Error, number>;
  rejectFriendRequestMutation: UseMutationResult<void, Error, number>;
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
  } = useQuery<SelectUser | null>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      try {
        const response = await getQueryFn({ on401: "returnNull" })("/api/user");
        return response as SelectUser;
      } catch (error) {
        console.error("Auth error:", error);
        return null;
      }
    },
    retry: false,
    staleTime: 30000,
  });

  const {
    data: friendRequests = [],
    isLoading: friendRequestsLoading,
  } = useQuery<SelectUser[]>({
    queryKey: ["/api/friends/requests"],
    queryFn: async () => {
      try {
        const response = await getQueryFn()("/api/friends/requests");
        return response as SelectUser[];
      } catch (error) {
        console.error("Friend requests error:", error);
        return [];
      }
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Cleanup media streams when session changes
  useEffect(() => {
    const cleanup = () => {
      Array.from(document.querySelectorAll('audio, video'))
        .map(media => (media as HTMLMediaElement).srcObject)
        .filter((stream): stream is MediaStream => stream instanceof MediaStream)
        .forEach(stream => {
          stream.getTracks().forEach(track => track.stop());
        });
    };

    if (!user) {
      cleanup();
    }

    return cleanup;
  }, [user]);

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      if (!res.ok) {
        throw new Error(t('auth.errors.invalidCredentials'));
      }
      return res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
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
      const res = await apiRequest("POST", "/api/register", credentials);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || t('auth.errors.registrationFailed'));
      }
      return res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
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
      const res = await apiRequest("POST", "/api/logout");
      if (!res.ok) {
        throw new Error(t('auth.errors.logoutFailed'));
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear();
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

  const acceptFriendRequestMutation = useMutation({
    mutationFn: async (friendshipId: number) => {
      const res = await apiRequest("POST", `/api/friends/${friendshipId}/accept`);
      if (!res.ok) {
        throw new Error(t('friends.acceptError'));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      toast({
        description: t('friends.acceptSuccess'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('friends.acceptError'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rejectFriendRequestMutation = useMutation({
    mutationFn: async (friendshipId: number) => {
      const res = await apiRequest("POST", `/api/friends/${friendshipId}/reject`);
      if (!res.ok) {
        throw new Error(t('friends.rejectError'));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      toast({
        description: t('friends.rejectSuccess'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('friends.rejectError'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
        friendRequests,
        friendRequestsLoading,
        acceptFriendRequestMutation,
        rejectFriendRequestMutation,
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