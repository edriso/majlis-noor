/* The variables the build reads from its environment, beyond Vite's own.
   Each is optional: a local build has none of them and must still work. */

interface ImportMetaEnv {
  /** The repository's web address. The Pages workflow passes it from
      `github.server_url` and `github.repository`, so a fork links to
      itself; unset, the app shows no link rather than a wrong one. */
  readonly VITE_REPO_URL?: string;
}
