import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { WebpackPlugin } from "@electron-forge/plugin-webpack";

import { mainConfig } from "./webpack.main.config";
import { rendererConfig } from "./webpack.renderer.config";

// ✅ CLEAN + SECURE CSP POLICY
const cspPolicy = [
  "default-src 'self' data: blob:",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://via.placeholder.com https://picsum.photos https://fastly.picsum.photos",
  "connect-src 'self' https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://www.googleapis.com https://firestore.googleapis.com https://firebasestorage.googleapis.com https://us-central1-hoa-appp.cloudfunctions.net",
  "font-src 'self' https://fonts.gstatic.com",
].join("; ");

const config: ForgeConfig = {
  packagerConfig: {},
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new WebpackPlugin({
      mainConfig,
      devContentSecurityPolicy: cspPolicy, // ✅ Dev CSP
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: "./src/index.html",
            js: "./src/renderer.ts",
            name: "main_window",
            preload: {
              js: "./src/preload.ts",
            },
          },
        ],
      },
    }),
  ],
};

export default config;
