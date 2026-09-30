# Hocker North America — AI Implementation How to Get Started

## What is this in plain English?

This project is a set of AI helper Agents that do the slow and manual parts of finding and verifying leads.

1. **Finds companies** that are a good fit for Hocker's dust collection systems (Based on ICP and .MD files)
2. **Researches each one** — Checks for safety citations, growth signs, and who the
   right contact person is
3. **Drafts LinkedIn messages** to that contact, personalized to what was found
4. **Lists final results** into a clean readable report as well as a CSV file of all leads

It never sends anything on its own — every message it writes is a draft that a human
reads and sends themselves. 

---

## Set Up

## Step 1 — Get a free GitHub account

GitHub is just where the project's files are stored online — like Google Drive, but
for this kind of project.

1. Go to [github.com](https://github.com)
2. Click **Sign up** and follow the prompts (free account is all you need)

## Step 2 — Install GitHub Desktop

This is a simple app that copies the project files onto your computer — no typing
commands required.

1. Go to [desktop.github.com](https://desktop.github.com)
2. Download and install it for your computer
3. Open it and sign in with the GitHub account you just made

## Step 3 — Copy the project onto your computer

1. Whoever shares this project with you will send a link that looks like
   `github.com/[something]/hocker-ai-sales`
2. Open that link in your browser, click the green **Code** button, then
   **Open with GitHub Desktop**
3. GitHub Desktop will ask where to save it on your computer — the default location is
   fine. Click **Clone**
4. That's it — the project files are now on your computer

## Step 4 — Install the Claude Desktop app

1. Go to [claude.com/download](https://claude.com/download)
2. Download and install it for your computer
3. Open it and sign in with your Claude account

## Step 5 — Open the project in Claude

1. In the Claude Desktop app, look for the **Code** tab
2. Open the Hocker project folder you saved in Step 3
3. You're ready to use it

---

## How to use it

You don't need to know any special commands. Just type what you want in plain
English, for example:

- *"Find me 10 leads"*
- *"Enrich this lead: [company name]"*
- *"Draft LinkedIn outreach for the leads we just enriched"*

Claude will use the right helper automatically based on what you ask for. If a
message is drafted, **always read it yourself before sending** — nothing goes out
without you.

---

## Good first thing to try

Once everything's installed, open the project and type:

> *"What does this project do and what are the three helpers inside it?"*

If Claude gives you a sensible answer describing lead generation, enrichment, and
LinkedIn outreach, your setup worked.

---

## A note on trust

This system is built to be cautious on purpose:
- It won't invent facts about a company — if it can't verify something, it says so
  instead of guessing
- It refuses to draft outreach to companies flagged as inappropriate to contact
  (e.g., in the middle of a lawsuit or shutting down)
- Nothing is ever sent automatically — every message is a draft for a human to
  review
