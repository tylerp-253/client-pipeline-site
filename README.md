# Client Pipeline landing page

The public landing page for Client Pipeline, the outbound system for marketing agencies.

It is one self-contained file, `index.html`, with no build step. GitHub Pages can serve it directly from the root of the `main` branch.

## Before this goes live

- Set `APPLY_URL` near the bottom of `index.html` to the application form or calendar link. Every button then points there and the setup note disappears.
- Replace the footer placeholders: company name, privacy policy, terms.
- Confirm the prices shown in the plans section.

## Editing

Open `index.html` in a browser to preview. Colors and fonts are set as tokens in the `:root` block at the top of the `<style>` tag.
