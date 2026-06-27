# Reqly - Todo

<!--
Queue of upcoming tasks. Specced in roadmap.md, picked up by AI agents.
Format is flexible - one line for simple tasks, add bullets when the agent needs context to implement without back-and-forth.
On completion: check the box, cut the line into docs/done.md under today's date.
IDs never reuse - increment from the highest T-NNN in either this file or done.md.
-->

## Queue

- [ ] **T-109** Multipart body editor - UI
  - Prerequisite: T-108
  - **Body type selector:** add "Multipart" option to the body type dropdown in `RequestEditor` alongside None / JSON / Form / Raw. Selecting it renders the multipart part editor below.
  - **Part editor:** a table of rows, each row has:
    - Name input (text)
    - Type toggle: "Text" / "File" pill buttons
    - Value column: text input when type=text; file picker button when type=file (shows chosen filename alongside, or "Choose file" when empty)
    - Content-Type override: shown as a small optional input on the right (placeholder `auto-detected`), collapsed by default, visible on hover or via a `···` toggle
    - Hover-reveal trash icon to remove the row
  - "Add part" button at the bottom of the table, same pattern as key-value editors elsewhere
  - **File upload flow for ad-hoc runs (Send button):**
    - Browser builds a `FormData` with the request config as a JSON string in a `_config` field, plus each file part appended as an actual `File` object under its part name
    - POST to a new dedicated route `POST /api/run/adhoc/multipart` (separate from the existing JSON route to avoid `multer` polluting the standard route)
    - Server uses `multer` (memStorage, no disk writes) to parse the incoming multipart, reconstructs the `RequestConfig` from `_config`, builds the outbound `FormData` from text parts + received file buffers, fires via the executor
    - Response shape is identical to `POST /api/run/adhoc` - same `ResponseViewer` handles it with no changes
  - **Saving to collection:** when a multipart request with file parts is saved to a collection, show an inline notice: "File parts are saved as paths. Ensure the file exists at the saved path for CLI and MCP runs." Do not auto-copy files anywhere.
  - **Variable autocomplete** (`{{` trigger) works in name and text-value inputs via the existing `VariableInput` component - no changes needed there.
