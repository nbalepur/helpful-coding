"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { createPortal } from "react-dom";
import Snackbar, { SnackbarMessage } from "./Snackbar";

interface SnackbarContextType {
  showSnackbar: (message: string, duration?: number) => void;
}

const SnackbarContext = createContext<SnackbarContextType | undefined>(undefined);

export const useSnackbar = () => {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error("useSnackbar must be used within a SnackbarProvider");
  }
  return context;
};

interface SnackbarProviderProps {
  children: ReactNode;
}

export const SnackbarProvider = ({ children }: SnackbarProviderProps) => {
  const [snackbars, setSnackbars] = useState<SnackbarMessage[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const showSnackbar = useCallback((message: string, duration?: number) => {
    const id = `snackbar-${Date.now()}-${Math.random()}`;
    const newSnackbar: SnackbarMessage = {
      id,
      message,
      duration,
    };
    setSnackbars((prev) => [...prev, newSnackbar]);
  }, []);

  const removeSnackbar = useCallback((id: string) => {
    setSnackbars((prev) => prev.filter((snackbar) => snackbar.id !== id));
  }, []);

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}
      {isMounted &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              bottom: "24px",
              right: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              zIndex: 10000,
              pointerEvents: "none",
            }}
          >
            {snackbars.map((snackbar) => (
              <div key={snackbar.id} style={{ pointerEvents: "auto" }}>
                <Snackbar message={snackbar} onClose={removeSnackbar} />
              </div>
            ))}
          </div>,
          document.body
        )}
    </SnackbarContext.Provider>
  );
};

