/* ------------------------------------------------------------------
   Ooshie Tracker — shared list setup

   The app works right now with NO changes: everything saves in the
   browser on the device you're using.

   To share ONE live list between you and your wife, create a free
   Firebase project (5 minutes, no credit card) and paste the values
   below. Step-by-step instructions are in SETUP.md.

   Leave this as-is and the app quietly stays in local-only mode.
------------------------------------------------------------------ */

window.OOSHIE_CONFIG = {
  firebase: {
    apiKey:      "",
    authDomain:  "",
    databaseURL: "",   // must look like https://YOUR-PROJECT-default-rtdb.<region>.firebasedatabase.app
    projectId:   ""
  }
};
