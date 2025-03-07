import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
  QueryFunction,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { DialogContent, DialogContentProps } from "../components/ui/dialog"; // Ensure this import is correct

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

function CustomDialogContent(props: DialogContentProps) {
  if (!props.Description && !props['aria-describedby']) {
    console.warn('Missing `Description` or `aria-describedby` for {DialogContent}.');
  }
  return <DialogContent {...props} />;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem("accessToken"));

  useEffect(() => {
    setIsAuthenticated(!!localStorage.getItem("accessToken"));
  }, []);

  const {
    data: user = null,
    error,
    isLoading,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }) as QueryFunction<SelectUser | null>,
    retry: false,
    staleTime: 30000,
    enabled: isAuthenticated, // Yalnızca kullanıcı giriş yaptığında çalıştır
  });

  const {
    data: friendRequests = [],
    isLoading: friendRequestsLoading,
  } = useQuery<SelectUser[], Error>({
    queryKey: ["/api/friends/requests"],
    queryFn: getQueryFn({ on401: "throw" }) as QueryFunction<SelectUser[]>,
    enabled: !!user,
    refetchInterval: 30000,
  });

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

  const loginMutation = useMutation<SelectUser, Error, LoginData>({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      const data = await res.json();
      return data;
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData<SelectUser | null>(["/api/user"], user);
      setIsAuthenticated(true);
      toast({
        description: t('auth.loginSuccess'),
      });
    },
    onError: (error: Error) => {
      console.error('Login error:', error);
      toast({
        title: t('auth.errors.loginFailed'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation<SelectUser, Error, InsertUser>({
    mutationFn: async (credentials: InsertUser) => {
      const res = await apiRequest("POST", "/api/register", credentials);
      const data = await res.json();
      return data;
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData<SelectUser | null>(["/api/user"], user);
      setIsAuthenticated(true);
      toast({
        description: t('auth.registrationSuccess'),
      });
    },
    onError: (error: Error) => {
      console.error('Registration error:', error);
      toast({
        title: t('auth.errors.registrationFailed'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData<SelectUser | null>(["/api/user"], null);
      queryClient.clear();
      setIsAuthenticated(false);
      toast({
        description: t('auth.logoutSuccess'),
      });
    },
    onError: (error: Error) => {
      console.error('Logout error:', error);
      toast({
        title: t('auth.errors.logoutFailed'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const acceptFriendRequestMutation = useMutation<void, Error, number>({
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

  const rejectFriendRequestMutation = useMutation<void, Error, number>({
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