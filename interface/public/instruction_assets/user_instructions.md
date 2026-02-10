Thank you for using VibeJam! Below, we have video and written instructions on how to use our interface. You can return to [this page](/about) at any time.

![Video Instructions](instruction_assets/instructions.mp4)

<br />

### Overview

Our goal is to understand long-term effects and behaviors of users when they code with AI assistants. To do this, we'll ask you to participate in various website and game development tasks, and optionally ask you to complete skill assessments.

We will now describe three core functionalities of the interface: 1) building websites; 2) voiting on other websites; and 3) taking skill assessments.

<br />

### Building Websites in VibeJam

After completing the first skill check, you will be taken to the [tasks page](/vibe) where you will see all tasks that you can complete.

![Browse Tasks](instruction_assets/browse_all.png)

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

Afterwards, you'll be asked to answer a few questions about your project.

![Project Questions](instruction_assets/submit_2_public.png)

After submitting your project, you can keep working on it, but **only your most recent submission will be considered**. For that reason, we advise making sure you are mostly satisfied with your initial submission.

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

#### Voting on Projects

For any of the submissions, you can hit the "View Submissions" button to view all other user submissions (and your own), if the button is unlocked:

![Project Questions](instruction_assets/view_submissions.png)

Clicking on any submission will allow you to view it, interact with it, rate it on different aspects, and leave comments:

![Project Questions](instruction_assets/vote.png)