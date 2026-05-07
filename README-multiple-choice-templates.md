# Multiple-choice templates (LaTeX)

Copy either `enumerate` block below into your LaTeX document. Each `\item` is the question stem followed by the correct answer text (not the letter). Snippet templates use placeholder text from the codebase; the skill-check bank uses the gold option text from `data/mcqa_data.jsonl`.

---

## 1. Snippet comprehension templates

Defined in `backend/question_generation_helpers.py` as `SNIPPET_QUESTION_TEMPLATE_CONFIG` (12 templates: two tasks × three languages × mechanism vs change). Stems use `main`; answers use the first `sample_gold_answers` entry.

```latex
\begin{enumerate}
  \item \textbf{zic\_zac\_zoe / html / mechanism.} Which of these options best describes how the JavaScript code below uses the HTML element [INSERT DESCRIPTOR]? \par\noindent\textit{Answer:} The JavaScript updates this element to display the game status.

  \item \textbf{zic\_zac\_zoe / html / change.} In the HTML snippet below, the JavaScript selects the status element using the `[INSERT THE ATTRIBUTE THE USER'S WEBSITE CODE USES, LIKE ID NAME, CLASS NAME, OR TAG NAME in code ticks]` identifier. If `[INSERT SAME ATTRIBUTE in code ticks]` on the HTML element was changed to `[INSERT NEW ATTRIBUTE in code ticks]` but the rest of the website remained the same, what would most likely happen? \par\noindent\textit{Answer:} The status element would never update.

  \item \textbf{zic\_zac\_zoe / css / mechanism.} In the CSS rule shown below, how does the selector `[CSS\_SELECTOR in code ticks]` determine which elements on the website the styles are applied to? \par\noindent\textit{Answer:} HTML elements whose ID matches the selector receive the rule's styles.

  \item \textbf{zic\_zac\_zoe / css / change.} The CSS rule in the snippet below uses the attribute `[INSERT MAIN ATTRIBUTE(S) that attempts to do centering in code ticks]`. If this attribute was removed but the rest of the website stayed the same, what would most likely happen to the elements where the `[INSERT SELECTOR that is shown]` rule applies? \par\noindent\textit{Answer:} The elements would be aligned to the left.

  \item \textbf{zic\_zac\_zoe / js / mechanism.} The JavaScript snippet below shows the function `[FUNCTION\_NAME in code ticks]`. Which of these options best describes the primary purpose of this function? \par\noindent\textit{Answer:} Sync the displayed board with the current board state.

  \item \textbf{zic\_zac\_zoe / js / change.} The JavaScript snippet below shows the function `[FUNCTION\_NAME in code ticks]`, which renders the game board. Imagine the loop indexing in this function were changed so that [IF THIS IS A NESTED INDEX OVER `board`, CHANGE THE LOGIC SO THE INNER LOOP ENDS ONE EARLY. IF THIS IS A SINGLE LOOP OVER `cells`, CHANGE THE LOGIC SO THE LOOP STOPS AT 20 (OR ANOTHER NUMBER IF NOT POSSIBLE)]. If the rest of the website stayed the same, which of these best describes how your original board display logic would change? (Remember: If the user's initial function did not render the last row correctly, you MUST alter this question substantially to something that would not render properly.) \par\noindent\textit{Answer:} The bottom-most row of the board would not be accessed.

  \item \textbf{zic\_zac\_zoe\_follow\_up / html / mechanism.} In this snippet, what is the primary role of this HTML element [reference the element uniquely for the reset button] in your website? \par\noindent\textit{Answer:} It lets the user play a new game.

  \item \textbf{zic\_zac\_zoe\_follow\_up / html / change.} In this snippet, if the identifier [insert whatever is used to select this element in the JavaScript, such as the ID, tag (e.g.\ \texttt{<div>} vs \texttt{<p>}), or the class, used for displaying the reset button] of this HTML button [reference the name of the element] was changed but the rest of the website stayed the same, what would happen to your website? \par\noindent\textit{Answer:} Clicking the button would no longer reset the game.

  \item \textbf{zic\_zac\_zoe\_follow\_up / css / mechanism.} In this snippet, what visual effect does the CSS rule [insert the rules for changing the colors of A and B symbols] have on the game symbols? \par\noindent\textit{Answer:} It controls the color of symbols on the board.

  \item \textbf{zic\_zac\_zoe\_follow\_up / css / change.} In this snippet, if the [insert selector for selecting A] were changed to [insert another selector name like relating to cell C] but the rest of the website stayed the same, what would happen to your website? \par\noindent\textit{Answer:} The A symbol would no longer use this style.

  \item \textbf{zic\_zac\_zoe\_follow\_up / js / mechanism.} In this snippet, what behavior or logic does this JavaScript function [insert the name of the JavaScript function that checks the winners] handle? \par\noindent\textit{Answer:} It detects whether a player has won the game.

  \item \textbf{zic\_zac\_zoe\_follow\_up / js / change.} In this snippet, if the order of the horizontal win check and the corner win check were swapped, what would happen to your game? \par\noindent\textit{Answer:} The game would still correctly detect winners.
\end{enumerate}
```

Remove the `\textbf{...}` prefix on each `\item` if you do not want task labels.

---

## 2. Skill-check bank (`data/mcqa_data.jsonl`)

46 fixed multiple-choice items (UX, frontend HTML/CSS/JS, plus sanity checks). Stems and answers are flattened to one line (embedded markdown code fences appear inline); open the JSONL for original line breaks. The correct answer is the option text for the stored letter (`A`–`D`), not the letter itself.

````latex
\begin{enumerate}
  \item \textbf{ux / choices\_1.} The concept of "decision paralysis" in UX design refers to: \par\noindent\textit{Answer:} Users avoiding making decisions due to too many choices
  \item \textbf{ux / choices\_2.} The "Paradox of Choice" in UX design suggests that: \par\noindent\textit{Answer:} Users are more likely to be satisfied with a product when they have fewer, well-curated choices.
  \item \textbf{ux / memory\_1.} The principle of "recognition over recall" in interface design suggests that: \par\noindent\textit{Answer:} It’s better to present choices than require users to remember options
  \item \textbf{ux / memory\_2.} The "serial position effect" suggests that users tend to best remember: \par\noindent\textit{Answer:} Items at the beginning and end of a list
  \item \textbf{ux / mobile\_1.} When designing for mobile interfaces, why is "thumb zone" consideration important? \par\noindent\textit{Answer:} It ensures that interactive elements are placed within easy reach of the user's thumb.
  \item \textbf{ux / mobile\_2.} Which design choice is a mobile UX best practice for touch interfaces? \par\noindent\textit{Answer:} Using sufficiently large touch targets (around 7–10mm, or \textasciitilde{}44px) for tappable elements.
  \item \textbf{ux / design\_protocol\_1.} What is the main challenge when designing for a global audience? \par\noindent\textit{Answer:} Addressing cultural differences in user behavior, expectations, and values.
  \item \textbf{ux / design\_protocol\_2.} A product team is developing a new feature for an existing product. What is the best approach to ensure the feature is useful to the largest number of existing users? \par\noindent\textit{Answer:} Conduct user research to understand the most common user needs and pain points, then design a solution that addresses them effectively.
  \item \textbf{ux / error\_1.} Which of the following error messages best follows UX writing best practices for helpful microcopy? \par\noindent\textit{Answer:} Your file couldn’t be uploaded. Check your internet connection and try again.
  \item \textbf{ux / error\_2.} Which of the following is an example of a dark pattern in UX? \par\noindent\textit{Answer:} A subscription page deliberately hides the "Cancel subscription" option, making it hard for users to opt out.
  \item \textbf{ux / aesthetics\_1.} The "aesthetic-usability effect" suggests that: \par\noindent\textit{Answer:} Users perceive aesthetically pleasing designs as working better, even if they don't
  \item \textbf{ux / aesthetics\_2.} Which practice contributes most to accessibility for users with visual impairments? \par\noindent\textit{Answer:} Ensuring sufficient contrast between text and background colors, following WCAG guidelines.
  \item \textbf{ux / object\_1.} Which of the following is an example of a forcing function (constraint that prevents misuse) in design? \par\noindent\textit{Answer:} A car’s ignition system that allows the key to be removed only when the transmission is in "Park."
  \item \textbf{ux / object\_2.} A stove has four burners arranged in a square, but its four control knobs are lined up in a row, confusing users about which knob corresponds to which burner. Which design principle is poorly implemented in this stove? \par\noindent\textit{Answer:} Natural mapping between controls and their effects.
  \item \textbf{ux / cognitive\_ease\_1.} According to cognitive load theory, which design approach helps minimize extraneous cognitive load on users? \par\noindent\textit{Answer:} Organizing content with a clear visual hierarchy and chunking information into digestible sections.
  \item \textbf{ux / cognitive\_ease\_2.} "Progressive disclosure" is a UX design technique that involves: \par\noindent\textit{Answer:} Gradually introducing complexity by showing only essential information initially and revealing more details as needed.
  \item \textbf{ux / visual\_order\_1.} Based on Fitts’s Law, which guideline is advisable for interface design? \par\noindent\textit{Answer:} Ensure important buttons are either larger in size or positioned closer to the user’s likely focus/start point, so they can be acquired faster.
  \item \textbf{ux / visual\_order\_2.} When discussing “visual hierarchy,” a UX designer is primarily concerned with: \par\noindent\textit{Answer:} Guiding the user’s eye through an interface in order of importance
  \item \textbf{ux / excitement\_1.} When employing the Kano Model in product design, the “excitement” features are: \par\noindent\textit{Answer:} Unexpected but delightful features that can significantly boost user satisfaction
  \item \textbf{ux / excitement\_2.} What is the primary purpose of incorporating gamification elements into a product's design? \par\noindent\textit{Answer:} To increase user engagement and motivation
  \item \textbf{frontend / html\_knowledge\_1.} On a page with many images, what would be the effect of adding loading="lazy" to the <img> tag? \par\noindent\textit{Answer:} In supporting browsers, images will load only when they are in or near the visible viewport
  \item \textbf{frontend / html\_knowledge\_2.} Which attribute must have a unique value each time it is used in an HTML document? \par\noindent\textit{Answer:} id
  \item \textbf{frontend / html\_recall\_1.} You are designing a site and creating a navigation bar linking to the main sections. Which HTML element should you use to indicate that this is the main navigation? \par\noindent\textit{Answer:} `<nav>`
  \item \textbf{frontend / html\_recall\_2.} Which element creates an ordered list, shown with numbers in the browser by default? \par\noindent\textit{Answer:} `<ol>`
  \item \textbf{frontend / html\_trace\_code\_1.} A webpage has `rel="preconnect"` added to a link resource. What will this do? ```html <link rel="preconnect" href="https://example.com" /> ``` \par\noindent\textit{Answer:} It will tell the browser that a connection will be made to another origin and to start getting ready as soon as possible.
  \item \textbf{frontend / html\_trace\_code\_2.} Which attribute to the button below creates a link to the telephone number 1-(704) 555-1151? ```html <a>Call Us Today</a> ``` \par\noindent\textit{Answer:} href = "tel:+17045551151"
  \item \textbf{frontend / html\_change\_code\_1.} How would you change this code to make Vanilla selected by default? ```javascript <input type="radio" value="strawberry">Strawberry <input type="radio" value="vanilla">Vanilla <input type="radio" value="chocolate">Chocolate ``` \par\noindent\textit{Answer:} `<input type="radio" value="vanilla" checked>`
  \item \textbf{frontend / html\_change\_code\_2.} Which HTML will result in text being highlighted in yellow? ```css .highlight \{ background-color: yellow; \} ``` \par\noindent\textit{Answer:} `<span class="highlight">\#yolo</span>`
  \item \textbf{frontend / css\_knowledge\_1.} The browser finds some CSS that it does not understand. What is likely to happen? \par\noindent\textit{Answer:} The browser will ignore the unknown CSS
  \item \textbf{frontend / css\_knowledge\_2.} How does the rem unit represent a font size? \par\noindent\textit{Answer:} Font sizes are relative to the root em unit used in the HTML element.
  \item \textbf{frontend / css\_recall\_1.} Which line of code, if applied to all flex items in a flex container, would cause each flex item to take up an equal share of the total width of the container? For example, if there are four items, they would get 25\% of each. \par\noindent\textit{Answer:} `flex: 1 0 0;`
  \item \textbf{frontend / css\_recall\_2.} You have created a box that has a height set with CSS. Which line of CSS would add scroll bars if the content is taller than the box, but leave no visible scroll bars if the content fits into the box? \par\noindent\textit{Answer:} .box \{ overflow: auto; \}
  \item \textbf{frontend / css\_trace\_code\_1.} How many columns will there be, given this code? ```css .container \{ width: 600px; column-width: 200px; column-gap: 50px; \} ``` \par\noindent\textit{Answer:} two
  \item \textbf{frontend / css\_trace\_code\_2.} The CSS box model describes how different parts of a box are calculated. Under the standard box model, what is the total width of the content box plus padding (excluding border and margin) in the following CSS? ```css box \{ width: 200px; padding: 10px; margin: 0 15px; border: 2px solid black; \} ``` \par\noindent\textit{Answer:} 220px
  \item \textbf{frontend / css\_change\_code\_1.} You want to create striped table rows using CSS without adding a class to any element. Which CSS would correctly apply the background color to every odd row in your table? \par\noindent\textit{Answer:} `tr:nth-child(2n+1) \{ background-color: \#ccc; \}`
  \item \textbf{frontend / css\_change\_code\_2.} Which code example would center `.box` inside `.container`? ```html <div class="container"> <div class="box">what a lovely box, very centered</div> </div> ``` \par\noindent\textit{Answer:} ```css .container \{ display: flex; align-items: center; justify-content: center; \} ```
  \item \textbf{frontend / js\_knowledge\_1.} What does the `===` comparison operator do? \par\noindent\textit{Answer:} It tests for equality of value and type
  \item \textbf{frontend / js\_knowledge\_2.} Variables declared with the let keyword have what type of scope? \par\noindent\textit{Answer:} block scope
  \item \textbf{frontend / js\_recall\_1.} Which array method should you apply to run a function for every item within an array, returning an array of all items for which the function is true? \par\noindent\textit{Answer:} filter()
  \item \textbf{frontend / js\_recall\_2.} How would you round the value 11.354 to the nearest full integer? \par\noindent\textit{Answer:} Math.round(11.354);
  \item \textbf{frontend / js\_trace\_code\_1.} What will be the value of selected? ```javascript let pocket = ['turnip', 'stone', 'log', 'apple']; let selected = pocket[1]; ``` \par\noindent\textit{Answer:} stone
  \item \textbf{frontend / js\_trace\_code\_2.} What will this loop print? ``` let max = 3; for (i = 0; i > max; i++) \{ document.write("skrt "); \} ``` \par\noindent\textit{Answer:} (empty string --- the loop body never runs)
  \item \textbf{frontend / js\_change\_code\_1.} In the following code, the variable `fruit` has been assigned a value of apple. How would you change the value to plum? ```javascript let fruit = 'apple'; ``` \par\noindent\textit{Answer:} `fruit = 'plum'`
  \item \textbf{frontend / js\_change\_code\_2.} Which line would you add to this code to add "Cosmos" to the list of currencies using JavaScript? ```javascript var currencies = ['Bitcoin', 'Ethereum']; /* Missing line */ console.log(currencies); ``` \par\noindent\textit{Answer:} `currencies.push("Cosmos");`
  \item \textbf{frontend / sanity\_frontend.} Select the third choice for this question \par\noindent\textit{Answer:} `<ul>`
  \item \textbf{ux / sanity\_ux.} Select the second choice for this question \par\noindent\textit{Answer:} Recency Bias
\end{enumerate}
````
