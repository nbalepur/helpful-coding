"use client";
import { useState, useEffect } from "react";

interface ReportSubmissionModalProps {
  show: boolean;
  onClose: () => void;
  onSubmit: (reportType: string, rationale: string) => void;
  isSubmitting?: boolean;
}

export default function ReportSubmissionModal({ show, onClose, onSubmit, isSubmitting = false }: ReportSubmissionModalProps) {
  const [selectedReportType, setSelectedReportType] = useState<string>("");
  const [rationale, setRationale] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Clear fields when modal opens
  useEffect(() => {
    if (show) {
      setSelectedReportType("");
      setRationale("");
      setError(null);
    }
  }, [show]);

  if (!show) {
    return null;
  }

  const countWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedReportType) {
      setError("Please select a reason for reporting this submission");
      return;
    }
    
    const trimmedRationale = rationale.trim();
    if (!trimmedRationale) {
      setError("Please provide a rationale for your report");
      return;
    }

    const wordCount = countWords(trimmedRationale);
    if (wordCount < 10) {
      setError(`Please provide at least 10 words in your rationale (currently ${wordCount} words)`);
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
    setSelectedReportType("");
    setRationale("");
    onClose();
  };

  const reportCategories = [
    { value: "offensive", label: "This submission is offensive" },
    { value: "cheating", label: "This submission tried to cheat / game the instructions" },
    { value: "broken", label: "This submission is broken, doesn't work, or is extremely slow" },
    { value: "bright_harsh", label: "This submission is visually overwhelming or harsh" },
    { value: "other", label: "Other" },
  ];

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
            Report Submission
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
              Why are you reporting this submission?
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {reportCategories.map((category) => (
                <label
                  key={category.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '2px solid',
                    borderColor: selectedReportType === category.value ? '#3b82f6' : '#4b5563',
                    backgroundColor: selectedReportType === category.value ? 'rgba(59, 130, 246, 0.1)' : '#1f2937',
                    color: '#e5e7eb',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    transition: 'border-color 0.2s ease, background-color 0.2s ease',
                    opacity: isSubmitting ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSubmitting && selectedReportType !== category.value) {
                      e.currentTarget.style.borderColor = '#6b7280';
                      e.currentTarget.style.backgroundColor = '#374151';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSubmitting && selectedReportType !== category.value) {
                      e.currentTarget.style.borderColor = '#4b5563';
                      e.currentTarget.style.backgroundColor = '#1f2937';
                    }
                  }}
                >
                  <input
                    type="radio"
                    name="reportType"
                    value={category.value}
                    checked={selectedReportType === category.value}
                    onChange={() => setSelectedReportType(category.value)}
                    disabled={isSubmitting}
                    style={{ marginRight: '12px' }}
                  />
                  {category.label}
                </label>
              ))}
            </div>
          </div>

          {/* Rationale */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label
              htmlFor="report-rationale"
              style={{
                color: '#e5e7eb',
                fontWeight: 500,
                fontSize: '16px',
              }}
            >
              Provide a rationale (minimum 10 words)
            </label>
            <textarea
              id="report-rationale"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              disabled={isSubmitting}
              rows={5}
              placeholder="Explain why you are reporting this submission..."
              style={{
                width: '100%',
                borderRadius: '10px',
                padding: '12px 14px',
                border: error ? '1px solid #ef4444' : '1px solid rgba(148, 163, 184, 0.3)',
                backgroundColor: '#111827',
                color: '#e5e7eb',
                resize: 'vertical',
                fontSize: '14px',
                minHeight: '120px',
                outline: 'none',
                boxShadow: '0 0 0 2px transparent',
                opacity: isSubmitting ? 0.6 : 1,
              }}
              onFocus={(e) => {
                if (!error) {
                  e.currentTarget.style.borderColor = '#3b82f6';
                }
              }}
              onBlur={(e) => {
                if (!error) {
                  e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.3)';
                }
              }}
            />
            {error && (
              <div style={{ color: '#f87171', fontSize: '13px', marginTop: '-4px' }}>
                {error}
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                backgroundColor: 'transparent',
                color: '#e5e7eb',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                transition: 'background-color 0.2s ease, color 0.2s ease',
                opacity: isSubmitting ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = 'rgba(148, 163, 184, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                transition: 'background-color 0.2s ease',
                opacity: isSubmitting ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = '#3b82f6';
                }
              }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
