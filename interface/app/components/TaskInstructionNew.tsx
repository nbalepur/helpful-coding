"use client";
import React, { useEffect, useState } from 'react';
import Markdown from "react-markdown";
import { BsBoxArrowUpRight, BsX } from 'react-icons/bs';
import { Video } from 'lucide-react';
import { CodeBlockWithCopy } from './AssistantTerminalPane';
import { ENV } from '@/app/config/env';
import { useIframeTheme } from '@/app/utils/IframeThemeContext';

// Module-level cache that persists across component remounts
const htmlCache = new Map<string, string>();

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'] as const;
function numberToWord(n: number): string {
  return n >= 0 && n <= 20 ? NUMBER_WORDS[n] : String(n);
}

interface TaskInstructionProps {
  taskDescription?: string;
  requirements?: string[];
  videoDemo?: string;
  instructionsFile?: string;
  example?: string;
  taskName?: string;
  taskLabel?: string;
  aiAssistantMode?: 'agent' | 'ask' | 'brainstorm';
  isAiGroupUser?: boolean;
  showAIAssistantDetails?: boolean;
  onHide?: () => void;
  showHeader?: boolean;
  compact?: boolean;
}

const TaskInstructionNew: React.FC<TaskInstructionProps> = ({ 
  taskDescription, 
  requirements, 
  videoDemo, 
  instructionsFile,
  example,
  taskName,
  taskLabel,
  aiAssistantMode,
  isAiGroupUser = false,
  showAIAssistantDetails = false,
  onHide, 
  showHeader = true,
  compact = false 
}) => {
  const { isLightMode, toggleLightMode } = useIframeTheme();
  
  // Listen for postMessage from iframe to toggle theme
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'toggleIframeTheme') {
        toggleLightMode();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [toggleLightMode]);
  
  // Check if content is HTML (starts with <!DOCTYPE, <html, or HTML tags like <p>, <div>, etc.)
  const raw = taskDescription || "";
  const trimmed = raw.trim();
  const isHTML = trimmed.startsWith('<!DOCTYPE') || 
                 trimmed.startsWith('<html') || 
                 /^<[a-z][\s\S]*>/.test(trimmed); // Check if starts with HTML tag

  // Build structured HTML content with the new format
  const buildStructuredContent = (
    descriptionHtml: string,
    exampleHtml?: string,
    label?: string,
    taskNameParam?: string,
    requirementsList?: string[],
    lightMode: boolean = false
  ) => {
    const textColor = lightMode ? '#1f2937' : '#d6dde6';
    const strongColor = lightMode ? '#111827' : '#ffffff';
    const agentModeColor = lightMode ? '#065f46' : '#a7f3d0';
    const askModeColor = lightMode ? '#b45309' : '#fde68a';
    const brainstormModeColor = lightMode ? '#4338ca' : '#c4b5fd';
    const accentColor = lightMode ? '#2563eb' : '#8ac4ff'; // Darker blue for light mode
    const linkColor = lightMode ? '#1e40af' : '#8ac4ff'; // Darker blue for light mode
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const normalizedTaskName = (taskNameParam || '').toLowerCase().replace(/_/g, '-');
    const isZicZacZoeFollowUpTask = normalizedTaskName === 'zic-zac-zoe-follow-up';
    
    const assistantWorkflowDescription =
      label !== 'website_requirements'
        ? `
          <p style="margin: 12px 0; color: ${textColor};">
            This task includes an AI assistant that works in three modes:
          </p>
          <ul style="margin: 8px 0 12px 0; padding-left: 20px;">
            <li style="margin: 4px 0; color: ${textColor};"><strong>Agent</strong>: Make changes to your code directly.</li>
            <li style="margin: 4px 0; color: ${textColor};"><strong>Ask</strong>: Answer questions about your code.</li>
            <li style="margin: 4px 0; color: ${textColor};"><strong>Brainstorm</strong>: Come up with ideas and approaches.</li>
          </ul>
          <p style="margin: 12px 0; color: ${textColor};">
            You can switch between these modes at any time. Conversation history is isolated to each individual mode.
          </p>
        `
        : aiAssistantMode === 'agent'
          ? `<p style="margin: 12px 0; color: ${textColor};">To interact with the AI assistant, use the AI assistant tab to prompt it with your requests (e.g., "Add a blue Reset button underneath the game canvas."). The assistant will attempt to make those code changes directly and show you a diff editor where you can review the proposed edits before accepting or rejecting them.</p>`
          : aiAssistantMode === 'brainstorm'
            ? `<p style="margin: 12px 0; color: ${textColor};">To interact with the AI assistant, use the AI assistant tab to brainstorm implementation ideas, UX improvements, and trade-offs (e.g., "Give me three ways to make this game more engaging"). In this mode, the assistant does not directly edit your files, so you'll apply changes yourself in the editor.</p>`
            : label === 'website_requirements'
              ? `<p style="margin: 12px 0; color: ${textColor};">To interact with the AI assistant, use the AI assistant tab to ask syntax or implementation questions (e.g., "How do I write a for loop in JavaScript?"). In this mode, the assistant does not directly edit your files, so you'll apply changes yourself in the editor.</p>`
              : `<p style="margin: 12px 0; color: ${textColor};">To interact with the AI assistant, use the AI assistant tab to ask syntax or implementation questions (e.g., "How do I write a for loop in JavaScript?"). In this mode, the assistant does not directly edit your files, so you'll apply changes yourself in the editor.</p>`;

    const generalDescription = `
      <p style="margin: 12px 0; color: ${textColor};">This interface provides you with everything you need to build your project. On the right side, you'll find the coding editor with an AI assistant that can help you implement features. There's also a preview tab where you can see your work in real-time as you code.</p>
      
      ${assistantWorkflowDescription}
      
      <p style="margin: 12px 0; color: ${textColor};">Once you're personally satisfied with your work, you can make a submission. Before submitting, you'll need to answer some questions about your project.</p>
    `;
    const zicZacZoeFollowUpDescription = `
      <p style="margin: 12px 0; color: ${textColor};">
        The rules of Zic-Zac-Zoe have changed a bit, so now you need to make changes to your website to reflect them.
        You'll start with your website that you previously submitted and update it based on the items listed in the <strong style="color: ${strongColor};">Requirements</strong> section below.
        Don't worry about trying to fix issues in your previous submission, just try to complete as many requirements as you can.
      </p>
    `;

    let taskDescription = isZicZacZoeFollowUpTask
      ? zicZacZoeFollowUpDescription
      : (descriptionHtml || '<p>No task description available.</p>');
    
    // For replication tasks, prepend the prefix to the description
    if (label === 'replication' && taskNameParam) {
      const prefix = '';
      const trimmedDesc = taskDescription.trim();
      taskDescription = trimmedDesc;
    }
    
    
    // Task type indicator
    let taskTypeInfo = '';
    if (label === 'replication') {
      taskTypeInfo = `<p style="margin: 0 0 12px 0; color: ${textColor};">This is a <span style="color: ${accentColor}; font-weight: 600;">replication</span> task based on an existing game. You will see a list of requirements, and your project will be judged by how well you fulfill them.</p>`;
    } else if (label === 'open-ended') {
      taskTypeInfo = `<p style="margin: 0 0 12px 0; color: ${textColor};">This is an <span style="color: ${accentColor}; font-weight: 600;">open-ended</span> task: there is much more room for creativity, and you can do anything that adheres to the high-level theme. Your submission will be judged by other users from 1-5 on theme fulfillment, style, enjoyment, and creativity, so try to make your website fun and engaging!</p>`;
    }
    
    // Split examples by newline and create individual example divs
    let examples = '<p><em>[Examples to be filled in]</em></p>';
    if (exampleHtml) {
      const exampleLines = exampleHtml.split('\n').filter(line => line.trim() !== '');
      if (exampleLines.length > 0) {
        examples = exampleLines.map(line => `<div class="example">${line.trim()}</div>`).join('');
      }
    }

    const isTutorialTask =
      taskNameParam === 'website_tutorial_intro' || taskNameParam === 'website_tutorial_follow_up';
    const aiGroupFollowUpReminder = isZicZacZoeFollowUpTask && isAiGroupUser
      ? `<p style="margin: 0; color: ${textColor};">As a reminder, this differs from the last task, as you no longer have access to an AI assistant that can edit your code directly. The assistant can only provide guidance and suggestions.</p>`
      : '';
    const tutorialPracticeNote = isTutorialTask
      ? (
          aiAssistantMode === 'agent'
            ? `<p style="margin: 0; color: ${textColor};">We encourage you to practice using the AI assistant to complete these warm-up tasks. For example, for the first requirement, you could prompt the AI: "Make the Blank Site header text blue" and review whether it edited your files accurately.</p>`
            : `<p style="margin: 0; color: ${textColor};">We encourage you to practice asking the AI assistant questions to complete these warm-up tasks if you are unsure on how to do so. For example, for the first requirement, you could ask "How do I change the color of a button?" and adapt the response to your own code.</p>`
        )
      : '';
    const showSubmitProjectInstruction = label === 'website_requirements';
    const showTimerInstruction = label === 'website_requirements' && !isTutorialTask;
    const submitProjectInstruction = showSubmitProjectInstruction
      ? `<p style="margin: 0; color: ${textColor};">If you've finished all the changes, or you're feeling stuck and can't make any more changes, you can hit <strong style="color: ${accentColor};">Submit Project</strong>. Focus on fulfilling the requirements versus trying to make the website look nice.</p>`
      : '';
    const timerInstruction = showTimerInstruction
      ? `<p style="margin: 0; color: ${textColor};">This task has a time limit, and there is a <strong>timer</strong> next to the "Code" tab.</p>`
      : '';
    const storageKeyEncoded = taskNameParam
      ? encodeURIComponent(`task-instruction-requirements:${taskNameParam}`)
      : '';
    const requirementsSection = requirementsList && requirementsList.length > 0 ? `
      <h2>Requirements</h2>
      <div class="requirements-checklist" data-storage-key="${storageKeyEncoded}" style="display: flex; flex-direction: column; gap: 8px;">
        <p style="margin: 0; color: ${textColor};">Here are the <strong style="color: ${strongColor};">${numberToWord(requirementsList.length)}</strong> requirements you must fulfill. You can check them off as you complete them to track your own progress.</p>
        ${requirementsList
          .map(
            (requirement, index) => `
          <label class="requirement-check-item" style="display: flex; align-items: flex-start; gap: 10px;">
            <input type="checkbox" data-req-index="${index}" style="width: 16px; height: 16px; margin: 2px 0 0 0; flex-shrink: 0;" />
            <span style="display: block; line-height: 1.45; margin: 0;">${escapeHtml(requirement)}</span>
          </label>
        `
          )
          .join('')}
        ${tutorialPracticeNote}
        ${submitProjectInstruction}
        ${timerInstruction}
      </div>
    ` : '';

    const videoEmbedBorderColor = lightMode ? 'rgba(107, 114, 128, 0.4)' : 'rgba(255, 255, 255, 0.2)';
    const websiteAssistantVideoId = aiAssistantMode === 'agent'
      ? 'C570JJM8Sd0'
      : 'N7IsrqiaxjU';
    const websiteAssistantVideoLabel = aiAssistantMode === 'agent' ? 'Agent Mode' : 'Chat Mode';
    const aiAssistantOverviewVideoEmbed = label === 'website_requirements'
      ? `<p style="margin: 12px 0 8px 0; color: ${textColor};">Overview of how the AI assistant works (${websiteAssistantVideoLabel}):</p><div style="margin: 12px auto; width: 75%; max-width: 75%; position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border: 1px solid ${videoEmbedBorderColor}; border-radius: 8px; box-sizing: border-box;"><iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 7px;" src="https://www.youtube-nocookie.com/embed/${websiteAssistantVideoId}?rel=0&modestbranding=1" title="AI assistant overview (${websiteAssistantVideoLabel})" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`
      : '';

    const aiAssistantSection = showAIAssistantDetails ? `
      <h2>AI Assistant Details</h2>
      <p style="margin: 0 0 12px 0; color: ${textColor};">
        ${
          aiAssistantMode === 'agent'
            ? `${isTutorialTask ? `For this warm-up and the next website task, you will have access to an AI assistant in <strong style="color: ${agentModeColor};">Agent Mode</strong>.` : `Your AI is currently in <strong style="color: ${agentModeColor};">Agent Mode</strong>.`} You can ask the AI to make changes to your code (e.g., "Make the reset button red"), and you can review the AI's proposed changes to your code.`
            : aiAssistantMode === 'brainstorm'
              ? `${isTutorialTask ? `For this warm-up and the next website task, you will have access to an AI assistant in <strong style="color: ${brainstormModeColor};">Brainstorm Mode</strong>.` : `Your AI is currently in <strong style="color: ${brainstormModeColor};">Brainstorm Mode</strong>.`} The AI can help you generate ideas, compare implementation approaches, and plan what to build next, but it cannot directly edit your files.`
              : `${isTutorialTask ? `For this warm-up and the next website task, you will have access to an AI assistant in <strong style="color: ${askModeColor};">${label === 'website_requirements' ? 'Chat Mode' : 'Ask Mode'}</strong>.` : `Your AI is currently in <strong style="color: ${askModeColor};">${label === 'website_requirements' ? 'Chat Mode' : 'Ask Mode'}</strong>.`} ${label === 'website_requirements' ? 'You can only ask the AI syntax questions (e.g., "How do I make the color of a button red?") and it will answer with text or a code snippet you can copy. It cannot write any code for you.`' : 'The AI can answer questions about your current code and provide examples, but it cannot directly edit your files.'}`
        }
      </p>
      ${aiAssistantOverviewVideoEmbed}
      ${aiGroupFollowUpReminder}
    ` : '';
    
    const judgmentCriteria = `
      <p style="margin: 6px 0; color: ${textColor};">Your submission will be evaluated by other users through voting. They will rate your work on the following criteria, each on a scale from 1 to 5 (higher scores are better):</p>
      
      <ul style="margin: 12px 0; padding-left: 20px;">
        <li style="margin: 6px 0; color: ${textColor};"><strong style="color: ${strongColor};">Task Fulfillment:</strong> How well the interface adheres to the task requirements.</li>
        <li style="margin: 6px 0; color: ${textColor};"><strong style="color: ${strongColor};">Style:</strong> Quality of the visual design: layout, colors, typography, and polish.</li>
        <li style="margin: 6px 0; color: ${textColor};"><strong style="color: ${strongColor};">Enjoyment:</strong> How engaging and satisfying it feels to interact with the UI.</li>
        <li style="margin: 6px 0; color: ${textColor};"><strong style="color: ${strongColor};">Creativity:</strong> Original touches or mechanics that make the UI stand out.</li>
      </ul>
      
      <p style="margin: 6px 0; color: ${textColor};">After the voting period, your code may go under expert review for additional evaluation.</p>
    `;
    const notes = `
      <p style="margin: 12px 0; color: ${textColor};">Since you can only use raw HTML, CSS, and JavaScript, your UI will have some restrictions. These are not things that definitely won't work, but rather things you might have trouble trying to do:</p>
      
      <ul style="margin: 12px 0; padding-left: 20px;">
        <li style="margin: 6px 0; color: ${textColor};"><strong style="color: ${strongColor};">No External Libraries:</strong> You cannot use npm packages, CDN imports, or any external JavaScript frameworks (React, Vue, Angular, etc.). Only native browser APIs and vanilla JavaScript are available.</li>
        <li style="margin: 6px 0; color: ${textColor};"><strong style="color: ${strongColor};">No Build Tools:</strong> There are no compilers, bundlers, or transpilers available. You must write code that runs directly in the browser without preprocessing.</li>
        <li style="margin: 6px 0; color: ${textColor};"><strong style="color: ${strongColor};">No Backend Code:</strong> You cannot write server-side code or connect to databases. All logic must run client-side in the browser.</li>
        <li style="margin: 6px 0; color: ${textColor};"><strong style="color: ${strongColor};">Imports and Assets:</strong> Using imports or including external assets (images, fonts, etc.) might not work. Since you cannot upload files, you'll need to use data URIs, external URLs, or create assets programmatically with CSS/Canvas. For custom SVG image assets, we recommend using <a href="https://www.svgrepo.com/" target="_blank">SVGRepo</a>.</li>
        <li style="margin: 6px 0; color: ${textColor};"><strong style="color: ${strongColor};">Persistent Storage:</strong> Browser storage options like localStorage and sessionStorage are available, but they are limited and tied to the browser session. There is no backend storage available.</li>
        <li style="margin: 6px 0; color: ${textColor};"><strong style="color: ${strongColor};">CORS Restrictions:</strong> Fetching data from external APIs may be blocked by browser CORS policies. You can only reliably use publicly accessible APIs that allow cross-origin requests.</li>
      </ul>
      
      <p style="margin: 12px 0; color: ${textColor};">⚠️ You will not receive compensation if you are found to submit offensive text or content.</p>
    `;

    // Only include examples section if there are actual examples
    const examplesIntroText = label === 'website_requirements'
      ? "Here's a video demo of how the game should work."
      : "Here are some examples you can draw inspiration from. Note that these are professional games, so they will likely be more polished than what you create, but they can serve as good reference points.";

    const examplesSection = exampleHtml ? `
      <h2>Examples</h2>
      <p style="margin: 0 0 12px 0; color: ${textColor};">${examplesIntroText}</p>
      ${examples}
    ` : '';

    const restrictionsSection = label === 'website_requirements'
      ? ''
      : `
      <h2>Restrictions</h2>
      ${notes}
    `;

    const assistantInstructionsIntro = label === 'website_requirements'
      ? `Below is an abridged version of the instructions for coding with the AI assistant. If you already feel comfortable with our UI, you can skip reading this.`
      : `Below is an abridged version of the instructions for coding with the AI assistant, but more information can be found on the <a href="/about">about page</a>. If you already feel comfortable with our UI, you can skip reading this.`;

    // For website_requirements: show Requirements before AI Assistant Details; otherwise keep original order
    const middleSections = label === 'website_requirements'
      ? `${requirementsSection}
      ${aiAssistantSection}`
      : `${aiAssistantSection}
      ${requirementsSection}`;

    return `
      <h2>Task Description</h2>
      ${taskTypeInfo}
      ${taskDescription}
      ${middleSections}
      
      ${examplesSection}
      
      <hr />
      
      <p style="margin: 12px 0; color: ${textColor};">${assistantInstructionsIntro}</p>
      
      <h2>Getting Started</h2>
      ${generalDescription}
      ${restrictionsSection}
    `;
  };

  // Extract content from HTML, handling various formats
  const extractDescriptionContent = (html: string): string => {
    // If it's a full HTML document, extract body content
    if (html.includes('<body>')) {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch && bodyMatch[1]) {
        let content = bodyMatch[1];
        // Remove wrapper divs but keep the actual content
        content = content.replace(/<div[^>]*class="ti-root"[^>]*>|<\/div>/gi, '').trim();
        if (content) return content;
      }
    }
    
    // If it's wrapped in HTML document tags, try to extract
    if (html.includes('<!DOCTYPE') || html.includes('<html')) {
      // Remove HTML structure but keep content
      let content = html
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/<html[^>]*>|<\/html>/gi, '')
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
        .replace(/<body[^>]*>|<\/body>/gi, '')
        .replace(/<div[^>]*class="ti-root"[^>]*>|<\/div>/gi, '')
        .trim();
      if (content) return content;
    }
    
    // Otherwise, return as-is (HTML fragments like <p>...</p> are fine as-is)
    return html.trim();
  };

  // If HTML, prepare an iframe document that wraps the raw content and applies
  // a minimal stylesheet (accent is handled by outer container)
  const buildIframeDoc = (html: string, useStructured: boolean = false) => {
    let content = html;
    
    // If we should use structured format
    if (useStructured) {
      const descriptionContent = extractDescriptionContent(html);
      content = buildStructuredContent(descriptionContent, example, taskLabel, taskName, requirements, isLightMode);
    }

    const normalizedTaskName = (taskName || '').toLowerCase();
    const isTutorialTask =
      normalizedTaskName === 'website_tutorial_intro' ||
      normalizedTaskName === 'website_tutorial_follow_up';
    const isPlaygroundTask = normalizedTaskName === 'playground';

    // Tutorial instruction HTML includes inline dark-theme colors; remap them in light mode for readability.
    if (isLightMode && (isTutorialTask || isPlaygroundTask)) {
      content = content
        .replace(/#ffe082/gi, '#b45309')
        .replace(/#8ac4ff/gi, '#1e40af');
    }
    
    // Use lowercase for image path - playground has name "Playground" but file is playground.png
    const imageName = taskName === 'Playground' || taskName === 'playground' ? 'playground' : taskName;
    const taskImagePath = imageName ? `/task_images/${imageName}.png` : undefined;
    const sunIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
    const moonIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    const toggleButton = `<button id="theme-toggle" style="position: absolute; top: 6px; ${taskImagePath ? 'right: 48px;' : 'right: 6px;'} width: 36px; height: 36px; border-radius: 4px; border: 1px solid rgba(107, 114, 128, 0.3); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2); z-index: 1000; background: ${isLightMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(17, 24, 39, 0.9)'}; cursor: pointer; display: flex; align-items: center; justify-content: center; color: ${isLightMode ? '#1f2937' : '#d1d5db'}; transition: all 0.2s;" title="${isLightMode ? 'Switch to dark mode' : 'Switch to light mode'}">${isLightMode ? sunIcon : moonIcon}</button>`;
    
    // Light mode styles
    if (isLightMode) {
      return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <style>\n    :root { color-scheme: light; }\n    html, body { margin: 0; padding: 0; height: 100%; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; overflow-y: auto; }\n    *, *::before, *::after { box-sizing: border-box; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }\n    /* Thin scrollbar styling */\n    ::-webkit-scrollbar { width: 4px; }\n    ::-webkit-scrollbar-track { background: transparent; }\n    ::-webkit-scrollbar-thumb { background: rgba(107, 114, 128, 0.4); border-radius: 2px; }\n    ::-webkit-scrollbar-thumb:hover { background: rgba(107, 114, 128, 0.6); }\n    /* Firefox scrollbar styling */\n    * { scrollbar-width: thin; scrollbar-color: rgba(107, 114, 128, 0.4) transparent; }\n    body { background: #ffffff; color: #1f2937; font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; }\n    .ti-root { max-width: 900px; margin: 0 auto; padding: 12px; position: relative; }\n    h1 { color:#111827; border-bottom:2px solid rgba(37,99,235,.4); padding-bottom:6px; margin:0 0 12px 0; font-size:1.8em; }\n    h2 { color:#2563eb; margin:24px 0 8px 0; font-size:1.3em; }\n    h3 { color:#d97706; margin:10px 0 6px 0; font-size:1.1em; }\n    p { margin:6px 0; color: #1f2937; }\n    ul, ol { margin: 8px 0; padding-left: 20px; color: #1f2937; }\n    li { color: #1f2937; }\n    code { background:#f3f4f6; color:#dc2626; padding:2px 6px; border-radius:3px; }\n    pre { background:#f3f4f6; color:#111827; padding:10px; border-radius:4px; overflow:auto; border-left:3px solid #059669; margin:8px 0; }\n    img, video, canvas { max-width: 50%; height: auto; display: block; margin: 20px auto; }\n    hr { border: none; border-top: 1px solid rgba(37,99,235,.3); margin: 24px 0; }\n    .endpoint { background:#f9fafb; border-left:3px solid #059669; box-shadow: inset 0 0 0 1px rgba(0,0,0,.05); padding:12px; border-radius:4px; margin:10px 0; }\n    .endpoint h3 { color:#047857; margin:0 0 6px 0; }\n    .example { background:#fef3c7; border-left:2px solid #d97706; padding:8px; border-radius:3px; margin:8px 0; color: #1f2937; }\n    .file-tag { display:inline-block; background:#16a34a; color:#fff; padding:2px 8px; border-radius:0; font-size:.85em; font-weight:700; margin-right:8px; }\n    .requirement { background:#f9fafb; border-left:3px solid #2563eb; box-shadow: inset 0 0 0 1px rgba(0,0,0,.05); padding:10px; border-radius:4px; margin:10px 0; }\n    .requirement h3 { color:#2563eb; margin:0 0 12px 0; }\n    .requirement p { margin:0 0 12px 0; color: #1f2937; }\n    .requirement p:last-of-type { margin-bottom:0; }\n    .requirement pre { margin-top:6px; margin-bottom:0; }\n    .requirement pre code { padding:0; background:transparent; }\n    .text-primary { color:#2563eb; font-weight:600; }\n    .text-accent { color:#059669; font-weight:600; }\n    em { color: #4b5563; font-style: italic; }\n    a { color: #1e40af; text-decoration: underline; cursor: pointer; }\n    a:hover { color: #2563eb; }\n    strong { color: #111827; }\n    #theme-toggle:hover { background: ${isLightMode ? 'rgba(243, 244, 246, 1)' : 'rgba(31, 41, 55, 1)'} !important; }\n  </style>\n  <base target=\"_blank\" />\n</head>\n<body>\n  <div class=\"ti-root\">${toggleButton}${taskImagePath ? `<div style="position: absolute; top: 6px; right: 6px; width: 36px; height: 36px; border-radius: 4px; overflow: hidden; border: 1px solid rgba(107, 114, 128, 0.3); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2); z-index: 1000; background: rgba(255, 255, 255, 0.95); pointer-events: none; display: flex; align-items: center; justify-content: center;"><img src="${taskImagePath}" alt="Task preview" style="width: 100%; height: 100%; object-fit: cover; display: block; margin: 0; padding: 0; min-width: 100%; min-height: 100%;" onerror="this.parentElement.style.display='none';" /></div>` : ''}${content}</div>\n  <script>\n    // Theme toggle button handler\n    document.getElementById('theme-toggle')?.addEventListener('click', function(e) {\n      e.preventDefault();\n      e.stopPropagation();\n      if (window.parent) {\n        window.parent.postMessage({ type: 'toggleIframeTheme' }, '*');\n      }\n    });\n    // Prevent copy, cut, and paste operations\n    document.addEventListener('copy', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    document.addEventListener('cut', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    document.addEventListener('paste', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    // Prevent selection via keyboard shortcuts\n    document.addEventListener('keydown', function(e) {\n      // Prevent Ctrl+C, Cmd+C, Ctrl+X, Cmd+X, Ctrl+A, Cmd+A\n      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'x' || e.key === 'a')) {\n        e.preventDefault();\n        return false;\n      }\n    });\n    // Prevent right-click context menu\n    document.addEventListener('contextmenu', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    // Handle link clicks to open in new window\n    document.addEventListener('click', function(e) {\n      const link = e.target.closest('a');\n      if (link && link.href) {\n        e.preventDefault();\n        window.open(link.href, '_blank', 'noopener,noreferrer');\n        return false;\n      }\n    }, true);\n  </script>\n</body>\n</html>`;
    }
    
    // Dark mode styles (original)
    return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <style>\n    :root { color-scheme: dark; }\n    html, body { margin: 0; padding: 0; height: 100%; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; overflow-y: auto; }\n    *, *::before, *::after { box-sizing: border-box; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }\n    /* Thin scrollbar styling */\n    ::-webkit-scrollbar { width: 4px; }\n    ::-webkit-scrollbar-track { background: transparent; }\n    ::-webkit-scrollbar-thumb { background: rgba(107, 114, 128, 0.5); border-radius: 2px; }\n    ::-webkit-scrollbar-thumb:hover { background: rgba(107, 114, 128, 0.7); }\n    /* Firefox scrollbar styling */\n    * { scrollbar-width: thin; scrollbar-color: rgba(107, 114, 128, 0.5) transparent; }\n    body { background: transparent; color: #d6dde6; font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; }\n    .ti-root { max-width: 900px; margin: 0 auto; padding: 12px; position: relative; }\n    h1 { color:#e6f6ff; border-bottom:2px solid rgba(86,156,214,.5); padding-bottom:6px; margin:0 0 12px 0; font-size:1.8em; }\n    h2 { color:#8ac4ff; margin:24px 0 8px 0; font-size:1.3em; }\n    h3 { color:#ffe082; margin:10px 0 6px 0; font-size:1.1em; }\n    p { margin:6px 0; }\n    ul, ol { margin: 8px 0; padding-left: 20px; }\n    code { background:#1b2130; color:#ffb4a3; padding:2px 6px; border-radius:3px; }\n    pre { background:#1b2130; color:#e6edf3; padding:10px; border-radius:4px; overflow:auto; border-left:3px solid #7fd8c7; margin:8px 0; }\n    img, video, canvas { max-width: 50%; height: auto; display: block; margin: 20px auto; }\n    hr { border: none; border-top: 1px solid rgba(86,156,214,.3); margin: 24px 0; }\n    .endpoint { background:#2f3644; border-left:3px solid #7fd8c7; box-shadow: inset 0 0 0 1px rgba(255,255,255,.03); padding:12px; border-radius:4px; margin:10px 0; }\n    .endpoint h3 { color:#9be5d8; margin:0 0 6px 0; }\n    .example { background:#252c3a; border-left:2px solid #ffe082; padding:8px; border-radius:3px; margin:8px 0; }\n    .file-tag { display:inline-block; background:#22c55e; color:#fff; padding:2px 8px; border-radius:0; font-size:.85em; font-weight:700; margin-right:8px; }\n    .requirement { background:#2f3644; border-left:3px solid #8ac4ff; box-shadow: inset 0 0 0 1px rgba(255,255,255,.03); padding:10px; border-radius:4px; margin:10px 0; }\n    .requirement h3 { color:#8ac4ff; margin:0 0 12px 0; }\n    .requirement p { margin:0 0 12px 0; }\n    .requirement p:last-of-type { margin-bottom:0; }\n    .requirement pre { margin-top:6px; margin-bottom:0; }\n    .requirement pre code { padding:0; background:transparent; }\n    .text-primary { color:#8ac4ff; font-weight:600; }\n    .text-accent { color:#7fd8c7; font-weight:600; }\n    em { color: #94a3b8; font-style: italic; }\n    a { color: #ffffff; text-decoration: underline; cursor: pointer; }\n    a:hover { color: #8ac4ff; }\n    #theme-toggle:hover { background: ${isLightMode ? 'rgba(243, 244, 246, 1)' : 'rgba(31, 41, 55, 1)'} !important; }\n  </style>\n  <base target=\"_blank\" />\n</head>\n<body>\n  <div class=\"ti-root\">${toggleButton}${taskImagePath ? `<div style="position: absolute; top: 6px; right: 6px; width: 36px; height: 36px; border-radius: 4px; overflow: hidden; border: 1px solid rgba(107, 114, 128, 0.3); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); z-index: 1000; background: rgba(17, 24, 39, 0.9); pointer-events: none; display: flex; align-items: center; justify-content: center;"><img src="${taskImagePath}" alt="Task preview" style="width: 100%; height: 100%; object-fit: cover; display: block; margin: 0; padding: 0; min-width: 100%; min-height: 100%;" onerror="this.parentElement.style.display='none';" /></div>` : ''}${content}</div>\n  <script>\n    // Theme toggle button handler\n    document.getElementById('theme-toggle')?.addEventListener('click', function(e) {\n      e.preventDefault();\n      e.stopPropagation();\n      if (window.parent) {\n        window.parent.postMessage({ type: 'toggleIframeTheme' }, '*');\n      }\n    });\n    // Prevent copy, cut, and paste operations\n    document.addEventListener('copy', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    document.addEventListener('cut', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    document.addEventListener('paste', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    // Prevent selection via keyboard shortcuts\n    document.addEventListener('keydown', function(e) {\n      // Prevent Ctrl+C, Cmd+C, Ctrl+X, Cmd+X, Ctrl+A, Cmd+A\n      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'x' || e.key === 'a')) {\n        e.preventDefault();\n        return false;\n      }\n    });\n    // Prevent right-click context menu\n    document.addEventListener('contextmenu', function(e) {\n      e.preventDefault();\n      return false;\n    });\n    // Handle link clicks to open in new window\n    document.addEventListener('click', function(e) {\n      const link = e.target.closest('a');\n      if (link && link.href) {\n        e.preventDefault();\n        window.open(link.href, '_blank', 'noopener,noreferrer');\n        return false;\n      }\n    }, true);\n  </script>\n</body>\n</html>`;
  };

  // Resolve instructions file path (repo-relative or absolute) to a URL we can load in an iframe
  const computeInstructionsUrl = (): string | null => {
    const pathOrUrl = instructionsFile || '';
    const desc = taskDescription || '';
    const candidate = pathOrUrl || desc;
    if (!candidate) return null;

    // If it's already an absolute URL, use as-is
    if (/^https?:\/\//i.test(candidate)) return candidate;

    // If it's likely a repo-relative path to an html file, load via backend /assets
    const looksLikeRepoPath = candidate.startsWith('data/') || candidate.startsWith('/data/');
    const isHtmlPath = candidate.toLowerCase().endsWith('.html');
    if (looksLikeRepoPath && isHtmlPath) {
      const cleanBase = (ENV.BACKEND_URL || '').replace(/\/$/, '');
      const cleanPath = candidate.replace(/^\//, '');
      return `${cleanBase}/assets/${cleanPath}`;
    }

    return null;
  };

  const instructionsUrl = computeInstructionsUrl();

  // Fetch HTML content when we have a URL so we can inject via srcDoc
  // Initialize state from cache if available to prevent loading flash
  const initialHtml = instructionsUrl ? htmlCache.get(instructionsUrl) || null : null;
  const [fetchedHtml, setFetchedHtml] = useState<string | null>(initialHtml);
  const [isLoadingHtml, setIsLoadingHtml] = useState<boolean>(false);
  const [htmlError, setHtmlError] = useState<string | null>(null);

  useEffect(() => {
    let abort = false;
    if (!instructionsUrl) {
      setFetchedHtml(null);
      setHtmlError(null);
      setIsLoadingHtml(false);
      return;
    }
    
    // Check cache first - synchronously
    const cached = htmlCache.get(instructionsUrl);
    if (cached) {
      // Only update if different to avoid unnecessary re-renders
      if (fetchedHtml !== cached) {
        setFetchedHtml(cached);
      }
      setIsLoadingHtml(false);
      setHtmlError(null);
      return;
    }
    
    // Only fetch if not in cache
    setFetchedHtml(null);
    setHtmlError(null);
    setIsLoadingHtml(true);
    fetch(instructionsUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!abort) {
          // Cache the fetched HTML
          htmlCache.set(instructionsUrl, text);
          setFetchedHtml(text);
        }
      })
      .catch((err) => {
        if (!abort) setHtmlError(String(err?.message || err));
      })
      .finally(() => {
        if (!abort) setIsLoadingHtml(false);
      });
    return () => {
      abort = true;
    };
  }, [instructionsUrl]);

  const handlePopOut = () => {
    if (!isHTML) return;
    
    // Open in new tab (no window features parameter)
    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(buildIframeDoc(trimmed));
      newWindow.document.close();
    }
  };

  // If we have an instructions file, prioritize that
  const contentToRender = instructionsFile || taskDescription;

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300 w-full min-w-0 flex flex-col h-full">
      {showHeader && (
        <div className="bg-gray-800/30 border-b border-gray-700/50 px-4 py-3 flex justify-between items-center">
          <h3 className="text-base font-medium text-white m-0">Task Instructions</h3>
          <div className="flex gap-0 items-center">
            {isHTML && (
              <button 
                className="open-preview-btn"
                onClick={handlePopOut}
                title="Open task instructions in new tab"
              >
                <BsBoxArrowUpRight className="icon" />
                Pop Out
              </button>
            )}
            {onHide && (
              <button 
                className="hide-btn"
                onClick={onHide}
                title="Hide task instructions"
              >
                <BsX className="icon" />
              </button>
            )}
          </div>
        </div>
      )}
      <div className={`flex-1 overflow-y-auto overflow-x-hidden ${contentToRender && (instructionsUrl || taskDescription) ? '' : 'p-3'}`}>
        {/* Video Demo Section */}
        {videoDemo && !compact && (
          <div className="mb-6">
            <div className="flex items-center space-x-2 mb-3">
              <Video className="h-4 w-4 text-blue-400" />
              <h4 className="text-sm font-medium text-gray-200">Video Demo</h4>
            </div>
            <div className="relative bg-gray-700 overflow-hidden">
              <video 
                className="w-full h-auto"
                controls
                preload="metadata"
                muted
                disablePictureInPicture
              >
                <source src={videoDemo} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        )}

        {/* Main Content */}
        {contentToRender ? (
          instructionsUrl ? (
            fetchedHtml != null ? (
              <iframe
                key={`${instructionsUrl}-${isLightMode}`}
                title="Task Instructions"
                srcDoc={buildIframeDoc(fetchedHtml, true)}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox"
              />
            ) : (
              <div className="text-gray-400 text-sm">
                {htmlError ? `Failed to load instructions: ${htmlError}` : 'Loading instructions...'}
              </div>
            )
          ) : taskDescription ? (
            // Always use structured format when we have a task description
            <iframe
              key={`structured-${trimmed.substring(0, 100)}-${isLightMode}`}
              title="Task Instructions"
              srcDoc={buildIframeDoc(trimmed, true)}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox"
            />
          ) : (
            <Markdown components={{ pre: (props) => <CodeBlockWithCopy className="bg-[#1e1e1e] rounded p-2 pr-10 my-2 overflow-x-auto text-[12px]" {...props} /> }}>
              {contentToRender || "No task description available."}
            </Markdown>
          )
        ) : (
          <div className="text-gray-400 text-sm">
            No task instructions available.
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskInstructionNew;
