Thank you for participating in VibeJam! Before you can get started, you must either watch the video below (recommended) or read through all of the instructions. You can return to [this page](/about) at any time.

![Video Instructions](instruction_assets/instructions.mp4)

<br />

### Overview

Our goal is to understand long-term effects and behaviors of users when they code with AI assistants. To do this, we'll ask you to participate in various website and game development tasks, and optionally ask you to complete skill assessments.

We will now describe three core functionalities of the interface: 1) building websites; 2) voiting on other websites; and 3) taking skill assessments.

<br />

### Building Websites in VibeJam

After completing the first skill check, you will be taken to the [tasks page](/vibe) where you will see all tasks that you can complete.

![Browse Tasks](instruction_assets/browse_all.png)

You may complete the tasks in any order, but we **highly recommend that you complete the [tutorial task](/playground)** before proceeding to others.

Each task will ask you to build a game-based website while adhering to the given constraints. Broadly, tasks are categorized as:
1. **Replication Tasks:** You will re-create a version of an existing game with your own personal flair (e.g. "Make your own version of tic-tac-toe").
2. **Open-Ended Tasks:** You have much more freedom and must create a game while adhering to a given theme (e.g. "Make a game set in space").

After you click on any of the tasks, you will be taken to a page split into two halves. On the left half, you'll see tabs for:
1. **Task:** A description of the game-based website you need to create, plus examples of real games that are in scope of the task.
2. **Preview:** A place where you can view the website you are currently creating.

On the right half of the screen, you'll see a **Code Editor** with HTML, CSS, and JavaScript files you can edit, along with a terminal where you can interact with an AI assistant while coding (similar to Cursor or GitHub Copilot). We provide a screenshot overview below:

![Coding Overview](instruction_assets/coding_overview.png)

We will now describe the core functions for coding.

<br />

#### Prompting the AI Assistant

To speed up the process of building websites, we highly recommend using our AI assistant, which is based on [Aider](https://aider.chat/). If you've used Cursor or GitHub Copilot, it should feel very familiar.

You can prompt the AI assistant to make changes to `index.html`, `styles.css`, or `frontend.js` with nearly any desired effect: part of the process is learning what the system can and cannot do. The assistant cannot create any new files. After seeing your request, the AI assistant will tell you which files are being edited and generate a summary of what changed. At the very end, it will propose some follow-ups you could prompt the system to execute, but you do not have to pick any of the if you don't find them helpful. If you find that the assistant is struggling to follow your instructions, you can hit the "Trashcan" icon to clear the message history, giving a fresh start.

![AI Assistant Pane](instruction_assets/ai_pane.png)

After the AI makes changes to your code, the editor will show all differences between your old code and the AI-generated code. You can accept or reject changes, make manual edits, or leave it as-is and prompt the assistant with a new request:

![AI Assistant Pane](instruction_assets/diffs.png)

<br />

#### Viewing Your Current Website

To view your website at any time, hit the "My Preview" tab at the top left of your screen. You'll see what your current website looks like, along with any errors or outputs from any `console.log()` debugging statements you may have added:

![Preview Site](instruction_assets/preview.png)

Because your code is sandboxed in an isolated iframe, we expect the following to be difficult to add to your website (but not impossible), so don't be surprised if they do not work:

- **No External Libraries:** You cannot use npm packages, CDN imports, or any external JavaScript frameworks (React, Vue, Angular, etc.). Only native browser APIs and vanilla JavaScript are available.
- **No Build Tools:** There are no compilers, bundlers, or transpilers available. You must write code that runs directly in the browser without preprocessing.
- **No Backend Code:** You cannot write server-side code or connect to databases. All logic must run client-side in the browser.
- **No New Files:** You cannot create any new files for the website.
- **Imports and Assets:** Using imports or including external assets (images, fonts, etc.) may or may not work. Since you cannot upload files, you'll need to use data URIs, external URLs, or create assets programmatically with CSS/Canvas. For custom SVG image assets, we recommend using [SVGRepo](https://www.svgrepo.com/).
- **Persistent Storage:** Browser storage options like localStorage and sessionStorage are available, but they are limited and tied to the browser session. There is no backend storage available.
- **CORS Restrictions:** Fetching data from external APIs may be blocked by browser CORS policies. You can only reliably use publicly accessible APIs that allow cross-origin requests.

<br />

#### Submitting Projects

Once you are satisfied with your website, you can hit the "Submit" button at the top right of your screen. You will first be asked to give a title and description for your project. This is what other users will see when they eventually play and vote on your project, so make them informative!

![Initial Submission](instruction_assets/submit_1.png)

Afterwards, we will add an automated check with an LLM judge to ensure that you are making a good-faith submission that follows the task instructions, and you are not submitting offensive content. These checks will also show you scores from an LLM judge on the four dimensions you will be rated on and an explanation with feedback, which you can use to improve your submission.

The screenshots below have examples of feedback from valid and invalid submissions:

![Valid Submission](instruction_assets/submit_valid.png)

![Invalid Submission](instruction_assets/submit_invalid.png)

These judgments are only to establish minimal requirements for each submission and will not impact your overall website score.

Finally, you'll be asked to answer a few questions about your project. You'll also be asked to recall whether certain functions and features exist in your code. You do not need to go back and check your code. Do not worry if you are unable to answer these questions correctly, as our goal is to measure how hard these questions are.

![Project Questions](instruction_assets/submit_2_public.png)

After submitting your project, you can keep working on it, but **any resubmissions will clear your votes** and **only your most recent submission will be considered**. For that reason, we advise making sure you are mostly satisfied with your initial submission.

<br />

#### Downloading Projects

Throughout the study, you will see download buttons that will let you save your project. It will also generate files that let you easily play the game locally, or upload the game online with Github Pages so others can play it (for free!):

![Project Questions](instruction_assets/download_1.png)

![Project Questions](instruction_assets/download_2.png)

The project will download as a zip file with the following files:
- `index.html`: Your HTML code
- `styles.css`: Your CSS code
- `frontend.js`: Your JavaScript code
- `README.md`: An explanation of your project and how to deploy it
- `deploy.sh`: A bash script to help you deploy your project

If you choose to host your game online, we kindly ask that you preserve your README in the Github repository to indicate that it was created in VibeJam!

<br />

### Voting on Projects

For any of the submissions, you can hit the "View Submissions" button to view all other user submissions (and your own):

![Project Questions](instruction_assets/view_submissions.png)

Clicking on any submission will allow you to view it, interact with it, rate it on different aspects, and leave comments:

![Project Questions](instruction_assets/vote.png)

Specifically, you'll be scored on the following criteria:

- **Task Fulfillment:** How well your project satisfies the task requirements and constraints.
- **Style:** Visual design, polish, and overall presentation.
- **Enjoyment:** How fun and engaging the experience is.
- **Creativity:** Originality and interesting ideas beyond the basic requirements.

Participants with websites that score highly will be eligible for extra compensation, detailed in the "Compensation" section below.

<br />
<br />

### Skill-Checks

#### Taking Assessments

Throughout the study, you can optionally complete assessments to track your programming abilities. Our goal is not to reward participants who score higher on this assessment, but rather to understand how your abilities may change over time when coding with AI. You will see a popup every ~5 project submissions encouraging you to take a skill check, but again, this is optional.

![Retake](instruction_assets/retake_page.png)

If you decide to take a skill check, you can customize the type of questions and their numbers:

![Retake](instruction_assets/retake.png)

There are four question types:
1. Multiple-choice questions about front-end development
2. Multiple-choice questions about user interface design
3. Leetcode-style coding questions when you implement a function from a description
4. Leetcode-style debugging questions when you implement a function from a description and a faulty implementation.

After customizing your assessment, you'll first answer multiple-choice questions about front-end development (if you selected any of this question type):

![Multiple-Choice Questions](instruction_assets/mcqa.png)

You'll be able to check your answer before moving on and see whether you were corect or incorrect.

Then, you'll answer a few LeetCode-style coding questions. You'll be given a description of a function's inputs and outputs, and your job is to either implement the function from scratch or debug an existing implementation so that it passes a comprehensive set of test cases. You can pick between Python and JavaScript, but the coding questions are identical. You'll need to pass all test cases before moving on. To help you debug, you can view the outputs of all test cases, test your function with custom inputs, and inspect returned values and any print statements.

![Coding Questions](instruction_assets/coding_question.png)

For all of these questions, do not cheat. We only want to understand participants' backgrounds at a whole, so we do not care about your individual performance. Please do not navigate away from the page unless you are looking up general syntax questions. We will show an on-screen reminder every time you leave the page to let you know we detected it.

If you are stuck at any point or find an error in a question, please hit the "Report" button at the top right of the screen. The button will appear after 30 seconds to ensure you made a good faith attempt. In the coding questions, you can hit "View Solution (Give Up)" button to view the current solution.

#### Statistics

You can also navigate to the [/stats](/stats) page to see your AI usage and performance on our skill check assessments. Each plot will display your scores in different stages over the study over time

![Usage Statistics](instruction_assets/stats.png)

![Score Statistics](instruction_assets/stats_2.png)

If you want to see whether your skills have changed after using VibeJam, you can navigate back to the [/skill-check](/skill-check) page and re-take our skill checks at any time.

<br />
<br />

### Compensation

We will offer monetary rewards for users who complete the 50+ public projects in VibeJam. The 10 users who submit the most projects, or the first 10 users to submit all projects, will each receive **$10**. The three users with the highest website scores per project will each receive **$5**. The same user can win multiple bonus rewards across projects.

We also plan to award **$100** in bonus compensation for particularly creative, popular, or well-designed websites. You will be notified via email if you win this reward.

This compensation will be available until June 1, 2026. Any changes to this date will be announced on the About page and over email.

#### Multiple Rewards Available

You can win **multiple rewards** across tasks. Each high-performing submission qualifies for its own reward, allowing you to accumulate earnings across all projects.

At the end of the study, all monetary rewards will be distributed via email (online gift cards with Tango). We will intermittently send user study progress updates to your registered email. If you have any questions, please email [nbalepur@umd.edu](mailto:nbalepur@umd.edu).

<div style="background-color: rgba(220, 38, 38, 0.1); border-left: 4px solid #ef4444; border-radius: 0 0.5rem 0.5rem 0; padding: 1rem; margin: 1.5rem 0;">
    <div style="color:rgb(246, 41, 41); font-weight: 500; margin-bottom: 0.5rem; display: flex; align-items: center; font-size: 1.25rem;">
    Warnings
    </div>
    <ul style="color: #d1d5db; list-style: disc; list-style-position: inside; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem;">
    <li>There will be attention checks scattered throughout the skill-check questions to make sure you are paying attention. We may withdraw your compensation if you fail all checks</li>
    <li>Any detected attempts to game our user study or submit offensive websites in any way will result in immediate account termination.</li>
    <li>Please do not look up the answers to any skill assessment questions. You are not being rewarded for answering more accurately; our research study just wants to understand where students succeed and struggle when using AI assistants.</li>
    </ul>
</div>

