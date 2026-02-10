/**
 * Static instruction copy and HTML structure for the task instruction panel.
 * Edit section content here instead of in TaskInstruction.tsx.
 */

import { SUBMISSION_RATING_CRITERIA } from "@/app/constants/submissionRatingCriteria";
import { isFunctionTaskLabel } from "@/app/utils/taskLabels";

export type InstructionTheme = {
  textColor: string;
  strongColor: string;
  accentColor: string;
  linkColor: string; 
};

export function getInstructionTheme(lightMode: boolean): InstructionTheme {
  return {
    textColor: lightMode ? "#1f2937" : "#d6dde6",
    strongColor: lightMode ? "#111827" : "#ffffff",
    accentColor: lightMode ? "#2563eb" : "#8ac4ff",
    linkColor: lightMode ? "#1e40af" : "#8ac4ff",
  };
}

function gettingStarted(theme: InstructionTheme, isFunctionTask: boolean): string {
  const previewSentence = isFunctionTask
    ? "You can test your code with the Test Cases panel."
    : "There's also a preview tab where you can see your work in real-time as you code.";
  return `
    <p style="margin: 12px 0; color: ${theme.textColor};">This interface provides you with everything you need to build your project. On the right side, you'll find the coding editor with an AI assistant that can help you implement features. ${previewSentence}</p>
    <p style="margin: 12px 0; color: ${theme.textColor};">To interact with the AI assistant, use the AI assistant tab to prompt it with your requests. The assistant will execute your request and show you a diff editor where you can review the proposed changes before accepting or rejecting them. After making changes, the assistant will generate a summary of changes and suggest follow-up actions that you can optionally choose from to continue building your project.</p>
    <p style="margin: 12px 0; color: ${theme.textColor};">Once you're satisfied with your work, you can make a submission. Before submitting, you'll need to answer some questions about your project.</p>
  `;
}

function taskTypeInfo(
  label: string | undefined,
  criteriaNames: string,
  theme: InstructionTheme
): string {
  if (label === "replication") {
    return `<p style="margin: 0 0 12px 0; color: ${theme.textColor};">This is a <span style="color: ${theme.accentColor}; font-weight: 600;">replication</span> web development task: fixed rules are provided to help scope the game, but you can do whatever you want within those rules. This is based on an existing, popular game. Other users will judge your project on ${criteriaNames}. The specification is described below:</p>`;
  }
  if (label === "open-ended") {
    return `<p style="margin: 0 0 12px 0; color: ${theme.textColor};">This is an <span style="color: ${theme.accentColor}; font-weight: 600;">open-ended</span> web development task: there is much more room for creativity, and you can do anything that adheres to the high-level theme. Other users will judge your project on ${criteriaNames}. The specification is described below:</p>`;
  }
  if (label === "write_function") {
    return `<p style="margin: 0 0 12px 0; color: ${theme.textColor};">This is a <span style="color: ${theme.accentColor}; font-weight: 600;">function completion</span> task: implement a function from scratch that satisfies the specification and passes the provided test cases. The specification is described below:</p>`;
  }
  if (label === "debug_function") {
    return `<p style="margin: 0 0 12px 0; color: ${theme.textColor};">This is a <span style="color: ${theme.accentColor}; font-weight: 600;">function debugging</span> task: the starter code contains bugs; fix them so the function satisfies the specification and passes the provided test cases. The specification is described below:</p>`;
  }
  return "";
}

function judgmentCriteria(theme: InstructionTheme): string {
  const { scale, dimensions } = SUBMISSION_RATING_CRITERIA;
  const criteriaListItems = dimensions
    .map(
      (d) =>
        `<li style="margin: 6px 0; color: ${theme.textColor};"><strong style="color: ${theme.strongColor};">${d.name}:</strong> ${d.description}</li>`
    )
    .join("");
  return `
    <p style="margin: 6px 0; color: ${theme.textColor};">Your submission will be evaluated by other users through voting. They will rate your work on the following criteria, each on a scale from ${scale.min} to ${scale.max} (higher scores are better):</p>
    <ul style="margin: 12px 0; padding-left: 20px;">
      ${criteriaListItems}
    </ul>
    <p style="margin: 6px 0; color: ${theme.textColor};">After the voting period, your code may go under expert review for additional evaluation.</p>
  `;
}

function restrictions(theme: InstructionTheme): string {
  return `
    <p style="margin: 12px 0; color: ${theme.textColor};">Since you can only use raw HTML, CSS, and JavaScript, your UI will have some restrictions. These are not things that definitely won't work, but rather things you might have trouble trying to do:</p>
    <ul style="margin: 12px 0; padding-left: 20px;">
      <li style="margin: 6px 0; color: ${theme.textColor};"><strong style="color: ${theme.strongColor};">No External Libraries:</strong> You cannot use npm packages, CDN imports, or any external JavaScript frameworks (React, Vue, Angular, etc.). Only native browser APIs and vanilla JavaScript are available.</li>
      <li style="margin: 6px 0; color: ${theme.textColor};"><strong style="color: ${theme.strongColor};">No Build Tools:</strong> There are no compilers, bundlers, or transpilers available. You must write code that runs directly in the browser without preprocessing.</li>
      <li style="margin: 6px 0; color: ${theme.textColor};"><strong style="color: ${theme.strongColor};">No Backend Code:</strong> You cannot write server-side code or connect to databases. All logic must run client-side in the browser.</li>
      <li style="margin: 6px 0; color: ${theme.textColor};"><strong style="color: ${theme.strongColor};">Imports and Assets:</strong> Using imports or including external assets (images, fonts, etc.) might not work. Since you cannot upload files, you'll need to use data URIs, external URLs, or create assets programmatically with CSS/Canvas. For custom SVG image assets, we recommend using <a href="https://www.svgrepo.com/" target="_blank">SVGRepo</a>.</li>
      <li style="margin: 6px 0; color: ${theme.textColor};"><strong style="color: ${theme.strongColor};">Persistent Storage:</strong> Browser storage options like localStorage and sessionStorage are available, but they are limited and tied to the browser session. There is no backend storage available.</li>
      <li style="margin: 6px 0; color: ${theme.textColor};"><strong style="color: ${theme.strongColor};">CORS Restrictions:</strong> Fetching data from external APIs may be blocked by browser CORS policies. You can only reliably use publicly accessible APIs that allow cross-origin requests.</li>
    </ul>
    <p style="margin: 12px 0; color: ${theme.textColor};">⚠️ You will not receive compensation if you are found to submit offensive text or content.</p>
  `;
}

function examplesSection(exampleHtml: string | undefined, theme: InstructionTheme): string {
  if (!exampleHtml) return "";
  const exampleLines = exampleHtml.split("\n").filter((line) => line.trim() !== "");
  if (exampleLines.length === 0) return "";
  const examples = exampleLines
    .map((line) => `<div class="example">${line.trim()}</div>`)
    .join("");
  return `
    <h2>Examples</h2>
    <p style="margin: 0 0 12px 0; color: ${theme.strongColor};">Here are some examples you can draw inspiration from:</p>
    ${examples}
  `;
}

export interface BuildStructuredContentOptions {
  descriptionHtml: string;
  exampleHtml?: string;
  label?: string;
  taskName?: string;
  lightMode: boolean;
}

/**
 * Builds the full structured instruction HTML from task description and shared sections.
 */
export function buildStructuredContent(options: BuildStructuredContentOptions): string {
  const { descriptionHtml, exampleHtml, label, lightMode } = options;
  const theme = getInstructionTheme(lightMode);
  const criteriaNames = SUBMISSION_RATING_CRITERIA.dimensions.map((d) => d.name).join(", ");
  const isFunctionTask = isFunctionTaskLabel(label);

  const taskDescription = descriptionHtml.trim() || "<p>No task description available.</p>";
  const taskTypeBlock = taskTypeInfo(label, criteriaNames, theme);
  const examplesBlock = examplesSection(exampleHtml, theme);
  const aboutLink = `<p style="margin: 12px 0; color: ${theme.textColor};">Below is an abridged version of the instructions for coding with the AI assistant, but more information can be found on the <a href="/about">about page</a>.</p>`;

  const restrictionsBlock = isFunctionTask
    ? ""
    : `
    <h2>Restrictions</h2>
    ${restrictions(theme)}
  `;

  return `
    <h2>Task Description</h2>
    ${taskTypeBlock}
    ${taskTypeBlock ? "<hr />" : ""}
    ${taskDescription}

    ${examplesBlock}

    <hr />

    ${aboutLink}

    <h2>Getting Started</h2>
    ${gettingStarted(theme, isFunctionTask)}

    <h2>Judgment Criteria</h2>
    ${judgmentCriteria(theme)}
    ${restrictionsBlock}
  `;
}
