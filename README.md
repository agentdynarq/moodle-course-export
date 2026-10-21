# moodle-course-export

Export everything from your Moodle courses in one go: files, folders, links, text,
announcements and forum posts. Each course is saved as one zip, with a folder per
week or section.

It runs in your own browser, signed in as you, so it only gets what you can already
open. Nothing is sent anywhere else. Built and tested on a Moodle 3.x site with the
Adaptable theme; other themes may need small changes.

## Use it (bookmark, no F12 needed)

1. Make a new bookmark in Edge or Chrome. Name it `course export`.
2. Paste this as the URL:

```
javascript:fetch('https://cdn.jsdelivr.net/gh/agentdynarq/moodle-course-export@v1.0.0/run.js').then(r=>r.text()).then(t=>new Function(t)()).catch(e=>alert(e))
```

3. Sign in to Moodle and click the bookmark:
   - On the **Dashboard**, a panel lists every course. Untick any you do not want and press **Start**.
     Finished courses are remembered, so running it again continues where it stopped.
   - On a **course page**, that one course is exported.
4. When the browser asks about downloading multiple files, click **Allow**.

## Use it from the console instead

Press F12, open Console, type `allow pasting` if asked, then paste:

```js
fetch('https://cdn.jsdelivr.net/gh/agentdynarq/moodle-course-export@v1.0.0/run.js').then(r=>r.text()).then(t=>new Function(t)())
```

Or paste the whole of `master.js` or `single.js` directly.

## What is in each zip

- every file, named in page order, inside a folder per section
- `links.txt`: every video and web link, by section
- `All text and announcements.html`: text boxes, pages, assignment instructions, forum posts
- `_report.txt`: what was saved, skipped or failed

Quizzes, feedback forms and similar activities cannot be exported; they are listed in the report.

## Be fair

- Requests are spaced out so the Moodle server is not flooded. Do not lower the pauses.
- Course material is for your own study. Do not reupload or share it publicly.
- The links point at a fixed version (`@v1.0.0`), so the code you run cannot change unless you change the link.

## Files

- `run.js`: picks the right script for the page you are on
- `master.js`: every course on the Dashboard
- `single.js`: one course page
