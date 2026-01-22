import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Helper to get headers with Device ID
async function getHeaders(data?: any) {
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  
  // @ts-ignore - electronAPI is exposed in window
  if (window.electronAPI) {
    try {
      // @ts-ignore
      const deviceId = await window.electronAPI.getDeviceId();
      if (deviceId) {
        headers["x-device-id"] = deviceId;
      }
    } catch (e) {
      console.error("Failed to get device ID", e);
    }
  }
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    
    // Check for Device Blocked
    if (res.status === 403 && (text.includes("DEVICE_BLOCKED") || text.includes("Device Blocked"))) {
      // Redirect or show blocking screen
      // Since we are in a helper, we might need to dispatch an event or just throw a specific error
      // that the UI can catch.
      window.location.href = '/device-blocked'; // Simple redirect strategy
      throw new Error("DEVICE_BLOCKED");
    }

    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers = await getHeaders(data);
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers = await getHeaders();
    
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
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
