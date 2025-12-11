"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export interface SnackbarMessage {
  id: string;
  message: string;
  duration?: number; // in milliseconds, default 7000
}

interface SnackbarProps {
  message: SnackbarMessage;
  onClose: (id: string) => void;
}

const Snackbar = ({ message, onClose }: SnackbarProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const duration = message.duration ?? 7000;
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => {
        onClose(message.id);
      }, 400); // Match animation duration
    }, duration);

    return () => clearTimeout(timer);
  }, [message.id, message.duration, onClose]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose(message.id);
    }, 400); // Match animation duration
  };

  return (
    <div
      className={`snackbar ${isVisible && !isExiting ? 'snackbar-visible' : 'snackbar-hidden'}`}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '14px 18px',
        backgroundColor: '#e2e8f0',
        color: '#0f172a',
        borderRadius: '8px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
        border: '1px solid rgba(148, 163, 184, 0.3)',
        fontSize: '14px',
        lineHeight: '1.5',
        fontWeight: 500,
        zIndex: 10000,
        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        transform: isVisible && !isExiting ? 'translateY(0)' : 'translateY(20px)',
        opacity: isVisible && !isExiting ? 1 : 0,
      }}
    >
      <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{message.message}</span>
      <button
        onClick={handleClose}
        aria-label="Close notification"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#475569',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          transition: 'color 0.2s ease, background-color 0.2s ease',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#0f172a';
          e.currentTarget.style.backgroundColor = 'rgba(148, 163, 184, 0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#475569';
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <X size={18} strokeWidth={2} />
      </button>
    </div>
  );
};

export default Snackbar;

