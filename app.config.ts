import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
  const googlePlugin: string | [string, { iosUrlScheme: string }] = iosUrlScheme
    ? ['@react-native-google-signin/google-signin', { iosUrlScheme }]
    : '@react-native-google-signin/google-signin';

  return {
    ...config,
    name: 'Lestra After',
    slug: 'lestra-after',
    scheme: 'lestraafter',
    version: '0.3.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'app.lestra.after',
    },
    android: {
      package: 'app.lestra.after',
      adaptiveIcon: { backgroundColor: '#F4F5F7' },
    },
    plugins: ['expo-router', 'expo-secure-store', googlePlugin],
    experiments: { typedRoutes: true },
  };
};
