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
    version: '0.5.1',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'app.lestra.after',
    },
    android: {
      package: 'app.lestra.after',
      versionCode: 2,
      adaptiveIcon: { backgroundColor: '#FFF8F1' },
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      googlePlugin,
      [
        'expo-image-picker',
        {
          cameraPermission: 'After usa la cámara solo para fotografiar comunicaciones y tareas del colegio.',
          photosPermission: 'After accede a tus fotos solo cuando eliges una imagen para leerla.',
          microphonePermission: false,
        },
      ],
      ['expo-mlkit-ocr', { iosEngine: 'auto' }],
      [
        'expo-build-properties',
        {
          ios: {
            deploymentTarget: '16.0',
            useFrameworks: 'static',
          },
        },
      ],
    ],
    experiments: { typedRoutes: true },
  };
};
