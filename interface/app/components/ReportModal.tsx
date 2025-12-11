"use client";
import { useState } from "react";

interface ReportModalProps {
  show: boolean;
  onClose: () => void;
  onSubmit: (reportType: string, rationale: string) => void;
  isSubmitting?: boolean;
}

export default function ReportModal({ show, onClose, onSubmit, isSubmitting = false }: ReportModalProps) {
  const [selectedReportType, setSelectedReportType] = useState<string>("");
  const [rationale, setRationale] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  if (!show) {
    return null;
  }

  const countWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedReportType) {
      setError("Please select a reason for reporting this question");
      return;
    }
    
    const trimmedRationale = rationale.trim();
    if (!trimmedRationale) {
      setError("Please provide a justification for your report");
      return;
    }

    const wordCount = countWords(trimmedRationale);
    if (wordCount < 10) {
      setError(`Please provide at least 10 words in your justification (currently ${wordCount} words)`);
      return;
    }
    
    setError(null);
    onSubmit(selectedReportType, trimmedRationale);
    
    // Clear fields after submission
    setSelectedReportType("");
    setRationale("");
    setError(null);
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

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
            Report Question
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close report modal"
            disabled={isSubmitting}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              fontSize: '18px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              padding: '4px 8px',
              lineHeight: 1,
              transition: 'color 0.2s ease',
              opacity: isSubmitting ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.color = '#ffffff';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.color = '#9ca3af';
              }
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
            gap: '24px',
            overflowY: 'auto',
            minHeight: 0,
          }}
        >
          {/* Report Type Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label
              style={{
                color: '#e5e7eb',
                fontWeight: 500,
                fontSize: '16px',
                marginBottom: 0,
              }}
            >
              Why are you reporting this question?
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '2px solid',
                  borderColor: selectedReportType === 'issue_stops_solving' ? '#3b82f6' : '#4b5563',
                  backgroundColor: selectedReportType === 'issue_stops_solving' ? 'rgba(59, 130, 246, 0.1)' : '#1f2937',
                  color: '#e5e7eb',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  transition: 'border-color 0.2s ease, background-color 0.2s ease',
                  opacity: isSubmitting ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isSubmitting && selectedReportType !== 'issue_stops_solving') {
                    e.currentTarget.style.borderColor = '#6b7280';
                    e.currentTarget.style.backgroundColor = '#374151';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSubmitting && selectedReportType !== 'issue_stops_solving') {
                    e.currentTarget.style.borderColor = '#4b5563';
                    e.currentTarget.style.backgroundColor = '#1f2937';
                  }
                }}
              >
                <input
                  type="radio"
                  name="reportType"
                  value="issue_stops_solving"
                  checked={selectedReportType === 'issue_stops_solving'}
                  onChange={(e) => setSelectedReportType(e.target.value)}
                  disabled={isSubmitting}
                  style={{
                    marginRight: '12px',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                />
                <span>There is an issue with this question that stops me from solving it</span>
              </label>
              
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '2px solid',
                  borderColor: selectedReportType === 'frustrated_unable_to_solve' ? '#3b82f6' : '#4b5563',
                  backgroundColor: selectedReportType === 'frustrated_unable_to_solve' ? 'rgba(59, 130, 246, 0.1)' : '#1f2937',
                  color: '#e5e7eb',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  transition: 'border-color 0.2s ease, background-color 0.2s ease',
                  opacity: isSubmitting ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isSubmitting && selectedReportType !== 'frustrated_unable_to_solve') {
                    e.currentTarget.style.borderColor = '#6b7280';
                    e.currentTarget.style.backgroundColor = '#374151';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSubmitting && selectedReportType !== 'frustrated_unable_to_solve') {
                    e.currentTarget.style.borderColor = '#4b5563';
                    e.currentTarget.style.backgroundColor = '#1f2937';
                  }
                }}
              >
                <input
                  type="radio"
                  name="reportType"
                  value="frustrated_unable_to_solve"
                  checked={selectedReportType === 'frustrated_unable_to_solve'}
                  onChange={(e) => setSelectedReportType(e.target.value)}
                  disabled={isSubmitting}
                  style={{
                    marginRight: '12px',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                />
                <span>I am frustrated and unable to solve this question</span>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '2px solid',
                  borderColor: selectedReportType === 'other' ? '#3b82f6' : '#4b5563',
                  backgroundColor: selectedReportType === 'other' ? 'rgba(59, 130, 246, 0.1)' : '#1f2937',
                  color: '#e5e7eb',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  transition: 'border-color 0.2s ease, background-color 0.2s ease',
                  opacity: isSubmitting ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isSubmitting && selectedReportType !== 'other') {
                    e.currentTarget.style.borderColor = '#6b7280';
                    e.currentTarget.style.backgroundColor = '#374151';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSubmitting && selectedReportType !== 'other') {
                    e.currentTarget.style.borderColor = '#4b5563';
                    e.currentTarget.style.backgroundColor = '#1f2937';
                  }
                }}
              >
                <input
                  type="radio"
                  name="reportType"
                  value="other"
                  checked={selectedReportType === 'other'}
                  onChange={(e) => setSelectedReportType(e.target.value)}
                  disabled={isSubmitting}
                  style={{
                    marginRight: '12px',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                />
                <span>Other</span>
              </label>
            </div>
          </div>

          {/* Justification Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label
                htmlFor="rationale"
                style={{
                  color: '#e5e7eb',
                  fontWeight: 500,
                  fontSize: '14px',
                  marginBottom: 0,
                }}
              >
                Justification <span style={{ color: '#f87171' }}>*</span>
              </label>
              <span
                style={{
                  color: countWords(rationale.trim()) >= 10 ? '#10b981' : (countWords(rationale.trim()) > 0 ? '#f59e0b' : '#9ca3af'),
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                ({countWords(rationale.trim())}/10 words)
              </span>
            </div>
            <textarea
              id="rationale"
              value={rationale}
              onChange={(e) => {
                setRationale(e.target.value);
                if (error) {
                  const trimmed = e.target.value.trim();
                  const wordCount = countWords(trimmed);
                  if (trimmed && wordCount < 10) {
                    setError(`Please provide at least 10 words in your justification (currently ${wordCount} words)`);
                  } else {
                    setError(null);
                  }
                }
              }}
              placeholder="Please explain why you are reporting this question..."
              rows={6}
              required
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '6px',
                border: error ? '1px solid #f87171' : '1px solid #4b5563',
                backgroundColor: '#1f2937',
                color: '#e5e7eb',
                fontSize: '14px',
                resize: 'vertical',
                overflowY: 'auto',
                fontFamily: 'inherit',
                opacity: isSubmitting ? 0.6 : 1,
                cursor: isSubmitting ? 'not-allowed' : 'text',
              }}
              onFocus={(e) => {
                if (!isSubmitting) {
                  e.target.style.borderColor = '#3b82f6';
                }
              }}
              onBlur={(e) => {
                if (!error) {
                  e.target.style.borderColor = '#4b5563';
                }
              }}
            />
            {error && (
              <div style={{ color: '#f87171', fontSize: '12px', marginTop: '-4px' }}>
                {error}
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && !selectedReportType && !rationale.trim() && (
            <div style={{ color: '#f87171', fontSize: '12px', textAlign: 'center' }}>
              {error}
            </div>
          )}

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
              disabled={isSubmitting}
              style={{
                padding: '6px 14px',
                backgroundColor: '#4b5563',
                color: '#f9fafb',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: '6px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                opacity: isSubmitting ? 0.6 : 1,
                transition: 'background-color 0.2s ease, opacity 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = '#6b7280';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = '#4b5563';
                }
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedReportType || !rationale.trim() || countWords(rationale.trim()) < 10}
              style={{
                padding: '6px 16px',
                backgroundColor: (isSubmitting || !selectedReportType || !rationale.trim() || countWords(rationale.trim()) < 10) ? '#1e3a5f' : '#2563eb',
                color: (isSubmitting || !selectedReportType || !rationale.trim() || countWords(rationale.trim()) < 10) ? '#9ca3af' : 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: (isSubmitting || !selectedReportType || !rationale.trim() || countWords(rationale.trim()) < 10) ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                transition: 'background-color 0.2s ease',
                opacity: (isSubmitting || !selectedReportType || !rationale.trim() || countWords(rationale.trim()) < 10) ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting && selectedReportType && rationale.trim() && countWords(rationale.trim()) >= 10) {
                  e.currentTarget.style.backgroundColor = '#1d4ed8';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting && selectedReportType && rationale.trim() && countWords(rationale.trim()) >= 10) {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }
              }}
            >
              {isSubmitting ? 'Submitting…' : 'Report & Skip Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

