/**
 * Submission rating criteria. Edit scale and dimensions to customize scoring.
 */
export const SUBMISSION_RATING_CRITERIA = {
  scale: { min: 1, max: 5, default: 3 },
  dimensions: [
    { key: "theme", name: "Task Fulfillment", description: "How well the interface adheres to the task requirements." },
    { key: "style", name: "Style", description: "Quality of the visual design: layout, colors, typography, and polish." },
    { key: "enjoyment", name: "Enjoyment", description: "How engaging and satisfying it feels to interact with the UI." },
    { key: "creativity", name: "Creativity", description: "Original touches or mechanics that make the UI stand out." },
  ],
} as const;

export const RATING_DIMENSIONS = SUBMISSION_RATING_CRITERIA.dimensions;
export const RATING_SCALE_MIN = SUBMISSION_RATING_CRITERIA.scale.min;
export const RATING_SCALE_MAX = SUBMISSION_RATING_CRITERIA.scale.max;
export const RATING_SCALE_DEFAULT = SUBMISSION_RATING_CRITERIA.scale.default;

export function createDefaultScores(): Record<string, number> {
  const initial: Record<string, number> = {};
  RATING_DIMENSIONS.forEach((d) => {
    initial[d.key] = RATING_SCALE_DEFAULT;
  });
  return initial;
}
