"use client";
import { useState, useEffect } from "react";

interface RetakeQuestionModalProps {
  show: boolean;
  onClose: () => void;
  onNext: (counts: {
    frontendMcqa: number;
    uxMcqa: number;
    coding: number;
    debugging: number;
  }) => void;
}

export default function RetakeQuestionModal({ show, onClose, onNext }: RetakeQuestionModalProps) {
  const [frontendMcqa, setFrontendMcqa] = useState(10);
  const [uxMcqa, setUxMcqa] = useState(10);
  const [coding, setCoding] = useState(2);
  const [debugging, setDebugging] = useState(2);

  // Reset to defaults when modal opens
  useEffect(() => {
    if (show) {
      setFrontendMcqa(10);
      setUxMcqa(10);
      setCoding(2);
      setDebugging(2);
    }
  }, [show]);

  if (!show) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({
      frontendMcqa,
      uxMcqa,
      coding,
      debugging,
    });
  };

  const handleClose = () => {
    onClose();
  };

  const totalQuestions = frontendMcqa + uxMcqa + coding + debugging;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        style={{
          backgroundColor: '#1f2937',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '600px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '24px 24px 16px 24px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
          }}
        >
          <h2
            style={{
              color: '#e2e8f0',
              fontSize: '22px',
              fontWeight: 600,
              letterSpacing: '0.01em',
              margin: 0,
            }}
          >
            Build-Your-Own Skill Check
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px 8px',
              lineHeight: 1,
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#9ca3af';
            }}
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '24px',
            gap: '32px',
            overflowY: 'auto',
            minHeight: 0,
          }}
        >
          <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>
            Select how many questions you'd like for each category. Questions will be randomly selected from the available pool.
          </p>

          {/* Frontend MCQA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label
              htmlFor="frontend-mcqa"
              style={{
                color: '#e5e7eb',
                fontWeight: 500,
                fontSize: '16px',
              }}
            >
              Frontend Multiple Choice Questions: <span style={{ color: '#60a5fa' }}>{frontendMcqa}</span>
            </label>
            <input
              type="range"
              id="frontend-mcqa"
              min="0"
              max="15"
              value={frontendMcqa}
              onChange={(e) => setFrontendMcqa(parseInt(e.target.value))}
              style={{
                width: '100%',
                height: '6px',
                borderRadius: '3px',
                background: '#374151',
                outline: 'none',
                cursor: 'pointer',
              }}
            />
            {/* Number labels */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              fontSize: '10px',
              color: '#6b7280',
              marginTop: '-4px',
            }}>
              {[0, 5, 10, 15].map((val) => (
                <span key={val}>{val}</span>
              ))}
            </div>
          </div>

          {/* UX MCQA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label
              htmlFor="ux-mcqa"
              style={{
                color: '#e5e7eb',
                fontWeight: 500,
                fontSize: '16px',
              }}
            >
              UX Multiple Choice Questions: <span style={{ color: '#60a5fa' }}>{uxMcqa}</span>
            </label>
            <input
              type="range"
              id="ux-mcqa"
              min="0"
              max="15"
              value={uxMcqa}
              onChange={(e) => setUxMcqa(parseInt(e.target.value))}
              style={{
                width: '100%',
                height: '6px',
                borderRadius: '3px',
                background: '#374151',
                outline: 'none',
                cursor: 'pointer',
              }}
            />
            {/* Number labels */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              fontSize: '10px',
              color: '#6b7280',
              marginTop: '-4px',
            }}>
              {[0, 5, 10, 15].map((val) => (
                <span key={val}>{val}</span>
              ))}
            </div>
          </div>

          {/* Coding from Scratch */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label
              htmlFor="coding"
              style={{
                color: '#e5e7eb',
                fontWeight: 500,
                fontSize: '16px',
              }}
            >
              Coding from Scratch Problems: <span style={{ color: '#60a5fa' }}>{coding}</span>
            </label>
            <input
              type="range"
              id="coding"
              min="0"
              max="5"
              value={coding}
              onChange={(e) => setCoding(parseInt(e.target.value))}
              style={{
                width: '100%',
                height: '6px',
                borderRadius: '3px',
                background: '#374151',
                outline: 'none',
                cursor: 'pointer',
              }}
            />
            {/* Number labels */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              fontSize: '10px',
              color: '#6b7280',
              marginTop: '-4px',
            }}>
              {[0, 1, 2, 3, 4, 5].map((val) => (
                <span key={val}>{val}</span>
              ))}
            </div>
          </div>

          {/* Debugging */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label
              htmlFor="debugging"
              style={{
                color: '#e5e7eb',
                fontWeight: 500,
                fontSize: '16px',
              }}
            >
              Debugging Problems: <span style={{ color: '#60a5fa' }}>{debugging}</span>
            </label>
            <input
              type="range"
              id="debugging"
              min="0"
              max="5"
              value={debugging}
              onChange={(e) => setDebugging(parseInt(e.target.value))}
              style={{
                width: '100%',
                height: '6px',
                borderRadius: '3px',
                background: '#374151',
                outline: 'none',
                cursor: 'pointer',
              }}
            />
            {/* Number labels */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              fontSize: '10px',
              color: '#6b7280',
              marginTop: '-4px',
            }}>
              {[0, 1, 2, 3, 4, 5].map((val) => (
                <span key={val}>{val}</span>
              ))}
            </div>
          </div>

          {/* Total Summary */}
          <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0, textAlign: 'left' }}>
            Total Questions: <span style={{ color: '#e5e7eb' }}>{totalQuestions}</span>
          </p>

          {/* Buttons */}
          <div
            style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end',
              marginTop: '8px',
            }}
          >
            <button
              type="button"
              onClick={handleClose}
              style={{
                padding: '10px 20px',
                backgroundColor: '#4b5563',
                color: '#f9fafb',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#6b7280';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#4b5563';
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={totalQuestions === 0}
              style={{
                padding: '10px 20px',
                backgroundColor: totalQuestions === 0 ? '#1e3a5f' : '#2563eb',
                color: totalQuestions === 0 ? '#9ca3af' : 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: totalQuestions === 0 ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'background-color 0.2s ease',
                opacity: totalQuestions === 0 ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (totalQuestions > 0) {
                  e.currentTarget.style.backgroundColor = '#1d4ed8';
                }
              }}
              onMouseLeave={(e) => {
                if (totalQuestions > 0) {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }
              }}
            >
              Next
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
