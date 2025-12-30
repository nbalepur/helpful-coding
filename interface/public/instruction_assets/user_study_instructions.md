Thank you for participating in VibeJam! Before you can get started, you must either watch the video below (recommended) or read through all of the instructions. You can return to [this page](/about) at any time.

![Video Instructions](instruction_assets/instructions.mp4)

<br />

### Overview

Our goal is to understand which abilities programmers struggle with and excel at when building websites with AI assistants, and whether these abilities change over time. To help us answer this, please complete the following:

1. A **pre-test** where you answer coding questions.
2. Design **five websites** with AI assistance in VibeJam.
3. A **post-test** where you answer more coding questions.

Once you start the study, you will have one week to complete all steps, and you will only be compensated after completing all of them. The final date to complete the study is 03/26/2025. We expect the entire study to take five hours, and you will be payed $100 for your time. Additional rewards will be available for top performers, detailed in the "Compensation" section at the bottom of this page.

After completing all tasks, you are free to keep competing with other users across 50+ game jam tasks in VibeJam!

We will now describe each step.

<br />

### Step 1: Pre-Test Assessment

Before coding with AI assistance, we want you to complete an assessment to measure your programming abilities. Our goal is not to reward participants who score higher on this assessment, but rather to understand the background of who is working in our interface.

![Pre-Test Page](instruction_assets/pre_test.png)

The first set of questions in the pre-test will ask about your prior experience. Answer as accurately as you can. After that, you'll answer multiple-choice questions about front-end development:

![Multiple-Choice Questions](instruction_assets/mcqa.png)

Finally, you'll answer a few LeetCode-style coding questions. You'll be given a description of a function's inputs and outputs, and your job is to either implement the function from scratch or debug an existing implementation so that it passes a comprehensive set of test cases. You can pick between Python and JavaScript, but the coding questions are identical. You'll need to pass all test cases before moving on. To help you debug, you can view the outputs of all test cases, test your function with custom inputs, and inspect returned values and any print statements.

![Coding Questions](instruction_assets/coding_question.png)

For all of these questions, do not cheat. We only want to understand participants' backgrounds at a whole, so we do not care about your individual performance. Please do not navigate away from the page unless you are looking up general syntax questions. We will show an on-screen reminder every time you leave the page to let you know we detected it.

If you are stuck at any point or find an error in a question, please hit the "Report" button at the top right of the screen. This button appears after 30 seconds on each question to make sure you have made a good-faith attempt at solving it.

After completing the pre-test, you will be prompted to move on to the next step of building websites in VibeJam!

<br />
<br />

### Step 2: Building Websites in VibeJam

After completing the first skill check, you will be taken to the [browse](/browse) page where you will see all tasks that you must complete.

![Browse Tasks](instruction_assets/browse.png)

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

Afterwards, you'll be asked to answer a few questions about your project. You'll also be asked to recall whether certain functions and features exist in your code. You do not need to go back and check your code. Do not worry if you are unable to answer these questions correctly, as our goal is to measure how hard these questions are.

![Project Questions](instruction_assets/submit_2.png)

After submitting your project, you can keep working on it, but **any resubmissions will clear your votes** and **only your most recent submission will be considered**. For that reason, we advise making sure you are mostly satisfied with your initial submission.

<br />

#### Voting on Projects

After many users make submissions, we will open up voting on others's submissions. When voting begins and if you are later selected to be a judge, you can hit the "View Submissions" button on any project to view all other user submissions:

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

### Step 3: Post-Test Assessment

After completing all tasks, you will be prompted to complete a "Post-Test" on the [/skill-check](/skill-check) page. This process is the same as the pre-test, except the experience questions will be replaced with ones where you summarize how the study went.

![Post-Test Page](instruction_assets/post_test.png)

### Building Even More Websites

Once you have finished the post-test, you can keep building websites in VibeJam if you enjoyed it! You'll have access to 50+ tasks where you can build fun websites, compete against other users, and practice your AI coding skills!

![All Tasks](instruction_assets/browse_all.png)

### Additional Warnings and Notes

- Please do not look up the answers to any skill assessment questions. You are not being rewarded for answering more accurately; our research study just wants to understand where students succeed and struggle when using AI assistants.
- There will be sanity checks scattered throughout the skill-check questions to make sure you are paying attention.
- Any detected attempts to game our user study or submit offensive websites in any way will result in immediate account termination.
