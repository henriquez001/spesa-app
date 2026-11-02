import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";

// Ogni build ha una versione (data e ora). L'app la confronta con /version.json
// per sapere se online c'è qualcosa di più nuovo.
const version = new Date().toISOString();

function versionFile(): Plugin {
  return {
    name: "version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version }) });
    },
  };
}

export default defineConfig({
  plugins: [preact(), versionFile()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { outDir: "dist", emptyOutDir: true },
});
