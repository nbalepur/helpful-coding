/**
 * Study lifecycle configuration.
 */

export const STUDY_END_DATE_ISO =
  process.env.NEXT_PUBLIC_STUDY_END_DATE || "2050-12-31T23:59:59Z";

const studyEndTimestamp = Date.parse(STUDY_END_DATE_ISO);

export const isStudyEnded = (): boolean => {
  if (Number.isNaN(studyEndTimestamp)) {
    return false;
  }
  return Date.now() > studyEndTimestamp;
};
