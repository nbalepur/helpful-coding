Thank you for completing the first round of tasks! If you would like to receive extra monetary compensation, you can now participate in the open-ended game development tasks in VibeJam! 

Before you can get started, you must either watch the video below (recommended) or read through all of the instructions. You can return to [this page](/about) at any time.

[Watch the Part II tutorial video on YouTube](https://www.youtube.com/watch?v=2gvfy71l7q0)

<br />

### Overview

Our goal is to understand how programmers build websites with AI assistants (i.e., Vibe Code). To help us answer this, we are running a study where you'll complete a variety of open-ended game development tasks.
You'll compete with other users to make the most fun and creative games, and you'll receive monetary compensation for submitting games and extra bonuses for scoring highly!

We will now describe each step.

<br />

### Task Selection

On the [tasks page](/browse), you'll see all the tasks that you can complete.

![AI Assistant Pane](instruction_assets/open_browse.png)

Before you can access all games in VibeJam, you'll be required to complete:
1. A **[tutorial task](/playground)** that gets you familiar with our interface
2. A timed game development task where you need to create a Platformer game

Afterwards, you'll be able to complete any of the games in VibeJam.

<br />

### Interface Overview

After you click on a tasks, you will be taken to a page split into two halves. On the left half, you'll see tabs for:
1. **Task:** A description of the game-based website you need to create, plus examples of real games that are in scope of the task.
2. **Preview:** A place where you can view the website you are currently creating.

On the right half of the screen, you'll see a **Code Editor** with HTML, CSS, and JavaScript files you can edit, along with a terminal where you can interact with an AI assistant while coding (similar to Cursor or GitHub Copilot). We provide a screenshot overview below:

![AI Assistant Pane](instruction_assets/open_overview.png)

We will now describe the core functions for coding.

<br />

### Task Description

The task description will describe a broad, open-ended theme, such as "Make a game set in outer space" or "Make a platformer game", that your game must adhere to. You are encouraged to be creative within this theme

![Task Description](instruction_assets/open_task.png)

Your website will be scored on the following criteria by other users:
1. Task Fulfillment: How well your game satisfies the task requirements and constraints.
2. Style: How aesthetically pleasing the visual design, polish, and presentation of your game is.
3. Enjoyment: How fun and engaging your game's experience is.
4. Creativity: How original the ideas are in your game beyond the basic theme.

<br />

### Programming in our Code Editor

The multi-file code editor is designed to resemble Visual Study Code. It will be populated with three files:
- `index.html`: the HTML code for your website, i.e., which elements are shown
- `styles.css`: the CSS code for your website, i.e., how the elements are styled
- `frontend.js`: the JS code for your website, i.e., most of the core game logic

The editor will initially be populated with a bare-bones version of the website you need to create, so you don't have to start from scratch.

The editor contains basic coding features you would normally use with an editor like Visual Studio Code, such as copy and paste, auto-complete, and undoing and redoing edits.

<br />

### Prompting the AI Assistant

To speed up the process of building websites, we highly recommend using our AI assistant on the right side of the multi-file code editor. You can switch between three different modes for our assistant: agent mode, ask mode, and brainstorming mode

#### Agent Mode

Agent mode allows you to prompt the AI assistant to automatically make changes to your code. If you've used Cursor or GitHub Copilot, it should feel very familiar.

You can prompt the AI assistant to make changes to `index.html`, `styles.css`, or `frontend.js` with nearly any desired effect: part of the process is learning what the system can and cannot do. The assistant cannot create any new files. After seeing your request, the AI assistant will tell you which files are being edited and generate a summary of what changed. At the very end, it will propose some follow-ups you could prompt the system to execute, but you do not have to pick any of the if you don't find them helpful. If you find that the assistant is struggling to follow your instructions, you can hit the "Trashcan" icon to clear the message history, giving a fresh start.

![AI Assistant Pane](instruction_assets/ai_pane.png)

After the AI makes changes to your code, the editor will show all differences between your old code and the AI-generated code. You can accept or reject changes, make manual edits, or leave it as-is and prompt the assistant with a new request:

![AI Assistant Pane](instruction_assets/diffs.png)

<br />

#### Ask Mode

In Ask mode, the AI assistant will have access to your code, but can only answer questions about it, without making any changes directly. The AI assistant can respond with plain text or code snippets when appropriate:

![Ask Mode](instruction_assets/ask.png)

This mode is useful if you want to understand how your own code is working, or if you want to make changes to your code yourself.

<br />

#### Brainstorm Mode

In Brainstorm mode, the AI assistant is designed to help you come up with ideas for your game. You can prompt the assistant to see suggestions of what you could create, and ask the model to refine its suggestions or dig deeper into certain ideas.

![Brainstorm Mode](instruction_assets/brainstorm.png)

You can use Brainstorm mode if you're unable to come up with ideas for your game. Once you've settled on an idea, you can switch into Agent or Ask mode to start implementing it! 

<br />

### Viewing Your Current Website

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

### Submitting Projects

Once you are satisfied with your website, you can hit the "Submit" button at the top right of your screen. You will first be asked to give a title and description for your project. This is what other users will see when they eventually play and vote on your project, so make them informative!

![Initial Submission](instruction_assets/submit_1.png)

We will first run an automated check with an LLM judge to ensure that you are making a good-faith submission that follows the task instructions, and you are not submitting offensive content. The screenshots below have examples of feedback from valid and invalid submissions:

![Valid Submission](instruction_assets/submit_valid.png)

![Invalid Submission](instruction_assets/submit_invalid.png)

These judgments are only to ensure you fulfill the minimal requirements for each submission and do not impact your overall website score.

Afterwards, you'll be asked to answer a few questions about your project. You'll also be asked to recall whether certain functions and features exist in your code. Do not worry if you are unable to answer these questions correctly. You do not need to go back and check your code, since we only use your responses for internal research.

![Project Questions](instruction_assets/submit_2.png)

After submitting your project, you can keep working on it, but **any resubmissions will clear your votes** and **only your most recent submission will be considered**. For that reason, we advise making sure you are mostly satisfied with your initial submission.

<br />

### Downloading Projects

Throughout the study, you may see download buttons that will let you save your project. It will also generate files that let you easily play the game locally, or upload the game online with Github Pages so others can play it (for free!):

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

For certain submissions, viewing and voting on other user submissions will be enabled. When voting begins, you can hit the "View Submissions" button on any project to view all other user submissions:

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

### Post-Test Assessment

After completing a certain number of tasks, you may be prompted to complete a "Post-Test" on the [/skill-check](/skill-check) page. This process is the same as the pre-test you completed much earlier in the study, where you'll need to keep 

![Post-Test Page](instruction_assets/post_test.png)


<br />
<br />


### Compensation

Compensation is as follows:
1. You must complete the required Platformer task to unlock paid stages; there is no reward for Platformer itself. Afterwards, all tasks will unlock.
2. For every 5 tasks you complete in VibeJam, you will be awarded $15
3. If you are selected to take a post-test, you will be awarded an additional $10
4. The top 10 users with the highest-scoring websites (by user voting) will each receive $10. If we find issues with public user voting, we will recruit our own judges.

All monetary rewards will be distributed to your email as online gift cards with Tango. We plan to distribute these rewards in June 2026, but will update these instructions, the compensation page, and all users via email if there are extensions.

You can track your compensation progress on the [Compensation page](/compensation)

<br />

### ⚠️ Warnings

<div style="background-color: rgba(220, 38, 38, 0.1); border-left: 4px solid #ef4444; border-radius: 0 0.5rem 0.5rem 0; padding: 1rem; margin: 1.5rem 0;">
    <ul style="color: #d1d5db; list-style: disc; list-style-position: inside; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem;">
    <li>There may be questions throughout the study that will ask you to select a specific option to make sure that you are paying attention</li>
    <li>Any detected attempts to game our user study or submit offensive websites in any way will result in immediate account termination.</li>
    <li>For the coding and post-test tasks, do not navigate away from the page to look up answers or ask ChatGPT. We provide an AI assistant so you do not need to leave the page</li>
    </ul>
    <div>
    If you are found to intentionally violate these rules or attempt to circumvent our study in any way, we reserve the right to withhold compensation.
    </div>
</div>

