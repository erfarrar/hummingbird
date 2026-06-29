This is a bespoke video manager for a customer that runs a Pilates and Fitness Studio named "Inspired to Move".  Their logo is available at https://static.wixstatic.com/media/846e33_f67602de119948f29cde43a3dfa3d6f7~mv2.png/v1/fill/w_280,h_160,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/inspired_to_move_tranparent_v2.png, and their site is https://www.inspiredtomove.ca/.

They upload their class recordings to Google Drive, and they want a custom application to be able to view and manage their videos. The major functionality they want is:
- Ability to view all videos in a user-chosen Drive folder, and view them inline.
  All standard video file types are supported (any file Drive classifies with a
  `video/*` MIME type). If the folder contains non-video, non-folder files, a
  warning strip is shown at the top of the list.
- Ability to view, and edit the recording/filmed date
- The ability to apply custom tags to videos, and filter for those tags (intersection)
- Quick view of the title and description, and a quick way to edit them inline.
- Ability to view the video duration

Video folder selection:
- Each user keeps their videos in a single Drive folder (the path varies per user).
- On first login the app prompts the user to choose their video folder via a custom
  in-app browser (no Google Picker API key needed). The folder browser supports
  breadcrumb navigation into subfolders; any folder (including My Drive root) is selectable.
- The chosen folder is remembered in a browser cookie (`tea_folder`) so subsequent logins
  go straight to the file list. The cookie persists across sign-out / sign-in.
- A subtle "⋯" menu in the header shows the current folder name and a "Change folder…"
  link for the rare case when the folder needs to change.

Sharing:
- Ability to share a video directly from the app by publishing a public link. Clicking
  "Share" makes the video viewable by anyone with the link; clicking again disables the
  link so it no longer opens.
- Sharing grants view-only access — viewers can watch but cannot download, print, or copy
  the video.
- Shared videos are clearly indicated in the UI (a "Shared" badge).
- The "Last shared" indicator shows the date the link was last enabled.
- An easy way to see only the videos that are currently shared (a "Shared only" filter).
- A way to copy the video's share link to send out. The link grants view-only access while
  sharing is enabled, and stops working once sharing is disabled.

The customer has to deal with many videos, and the main goal is to make working with them easy beacuse doing these actions in the Google Drive app (e.g. update description) takes many clicks.

The customer wants a clean interface, but it should look professional and be a consumer grade experience. The color scheme should match their logo and website. It would even be okay if it used similar fonts and look and feel.

