import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage = res.statusText;
    try {
      const errorData = await res.json();
      errorMessage = errorData.message || errorMessage;
    } catch {
      // If JSON parsing fails, use the status text
    }
    throw new Error(errorMessage);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn = <TData = unknown>({
  on401,
}: {
  on401: UnauthorizedBehavior;
}): QueryFunction<TData, readonly unknown[]> => {
  return async ({ queryKey }) => {
    const [url] = queryKey as [string];
    const res = await fetch(url, {
      credentials: "include",
    });

    if (res.status === 401) {
      if (on401 === "returnNull") {
        return null as TData;
      }
      throw new Error("Unauthorized");
    }

    await throwIfResNotOk(res);
    return res.json();
  };
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});