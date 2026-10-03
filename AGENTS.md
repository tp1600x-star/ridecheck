# Agent instructions

## Production source of truth

- Before implementing changes, fixing bugs, or extracting/updating RideCheck app information, inspect the relevant parts of `C:\Ridecheck\v2.html`. Treat this production file as the primary reference for the current UI, behavior, and app content.
- If another project file conflicts with `v2.html`, follow the production reference unless the user explicitly requests a change to production behavior.
- Do not modify `v2.html` as part of routine feature work. Only edit it when the user explicitly asks to change the production file.
- `v2.html` is an HTML app reference, not a live database or guarantee of current runtime/API data. For live data, use the production data source or API configured by the project; do not invent values from the HTML.
- If `v2.html` cannot be accessed or does not contain the information needed, report that limitation and ask before using a different source as the basis for the work.
