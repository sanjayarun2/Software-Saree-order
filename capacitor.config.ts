import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.sareeorder.app",
  appName: "Saree Order Book",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: "#f9fafb",
      showSpinner: false,
    },
  },
  android: {
    minWebViewVersion: 120,
  },
};

export default config;
