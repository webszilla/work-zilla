const version = "0.1.1";

function intEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? value : fallback;
}

const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || process.env.EAS_PROJECT_ID || "";
const updateChannel = process.env.EXPO_PUBLIC_UPDATE_CHANNEL || "production";

module.exports = {
  expo: {
    name: "WorkZilla",
    slug: "work-zilla-mobile",
    scheme: "workzilla",
    version,
    orientation: "portrait",
    userInterfaceStyle: "light",
    assetBundlePatterns: ["**/*"],
    newArchEnabled: false,
    runtimeVersion: {
      policy: "appVersion"
    },
    updates: {
      fallbackToCacheTimeout: 0,
      checkAutomatically: "ON_LOAD"
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      "expo-asset",
      "expo-font",
      "expo-updates"
    ],
    experiments: {
      typedRoutes: true
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.workzilla.mobile",
      buildNumber: String(intEnv("IOS_BUILD_NUMBER", 1))
    },
    android: {
      package: "com.workzilla.mobile",
      versionCode: intEnv("ANDROID_VERSION_CODE", 2)
    },
    extra: {
      eas: {
        projectId
      },
      updateChannel
    }
  }
};
