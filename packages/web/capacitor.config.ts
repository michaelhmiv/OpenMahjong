import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
    appId: "app.openmahjong",
    appName: "Open Mahjong",
    webDir: ".mobile-web",
    server: {
        hostname: "localhost",
        androidScheme: "https",
    },
    android: {
        allowMixedContent: false,
    },
};

export default config;
