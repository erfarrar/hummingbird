// Copy this file to config.js and paste your OAuth 2.0 Client ID below.
const CLIENT_ID = "44753036517-h39giv3si9d9d8nagji9evpt4cior2sf.apps.googleusercontent.com";
// Full drive scope is required: the app writes metadata (names, tags, filmed dates)
// and creates public view links (creates/removes Drive permissions).
const SCOPES = "https://www.googleapis.com/auth/drive";
// The fixed set of tags you can apply to videos. Edit this list to taste.
// Order here is the order tags appear in the filter bar.
const AVAILABLE_TAGS = ["legs", "core", "arms", "cardio", "stretch"];
